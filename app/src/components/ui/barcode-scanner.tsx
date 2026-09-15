"use client";

import { useEffect, useRef, useState } from "react";
import type { BarcodeDetector as BarcodeDetectorApi } from "barcode-detector/ponyfill";

import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoInput } from "@/components/ui/photo-input";
import { TEXT_LINK_SM } from "@/components/ui/tap-target";

interface BarcodeScannerProps {
  onDetect: (code: string) => void;
}

type ScanStage = "starting" | "scanning" | "permission-denied" | "error";

const DETECT_INTERVAL_MS = 300;
const WASM_PUBLIC_PATH = "/zxing";

// .wasm copied from node_modules/zxing-wasm@3.1.3's dist/reader/ into
// public/zxing/ (Task 2, Step 3) - re-copy after any barcode-detector /
// zxing-wasm version bump. Self-hosted so a CDN outage can't break scanning
// (spec T2 decision table).
const locateWasm = (path: string, prefix: string): string =>
  path.endsWith(".wasm") ? `${WASM_PUBLIC_PATH}/${path}` : prefix + path;

// Lazy import: the ~1MB WASM only loads once a scan is actually requested,
// never on first page load (spec T2).
const loadDetector = async (): Promise<BarcodeDetectorApi> => {
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({ overrides: { locateFile: locateWasm } });
  return new BarcodeDetector({ formats: ["retail_codes"] });
};

interface LiveScanHandle {
  stream: MediaStream;
  // null between acquiring the stream and starting the poll - lets a failure
  // in between (e.g. video.play() rejecting) still find and stop the stream.
  intervalId: ReturnType<typeof setInterval> | null;
}

const stopLiveScan = (handle: LiveScanHandle | null): void => {
  if (!handle) {
    return;
  }
  if (handle.intervalId) {
    clearInterval(handle.intervalId);
  }
  handle.stream.getTracks().forEach((track) => track.stop());
};

// A single failed poll tick (e.g. a blurry frame the WASM can't parse)
// must not kill the live-scan loop - swallow it and let the interval
// continue to the next frame (CLAUDE.md Rule 18).
const pollForBarcode = (
  video: HTMLVideoElement,
  detector: BarcodeDetectorApi,
  onFound: (code: string) => void,
): ReturnType<typeof setInterval> =>
  setInterval(() => {
    void detector
      .detect(video)
      .then((results) => {
        if (results.length > 0) {
          onFound(results[0].rawValue);
        }
      })
      .catch(() => {
        // Single missed tick - no user-facing error, next interval retries.
      });
  }, DETECT_INTERVAL_MS);

const requestCameraStream = async (onDenied: () => void): Promise<MediaStream | null> => {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  } catch {
    onDenied();
    return null;
  }
};

interface StartLiveScanCallbacks {
  onStage: (stage: ScanStage) => void;
  onFound: (code: string) => void;
}

// Standalone, not nested in the effect, so the effect itself stays under the
// line budget - same split as nutrition-photo-step's handler functions.
// Writes the result onto handleRef instead of returning it, so the caller
// doesn't need a `.then()` of its own just to stash it.
const runCameraAcquisition = async (
  video: HTMLVideoElement,
  handleRef: { current: LiveScanHandle | null },
  isCancelled: () => boolean,
  detector: BarcodeDetectorApi,
  callbacks: StartLiveScanCallbacks,
): Promise<void> => {
  const stream = await requestCameraStream(() => callbacks.onStage("permission-denied"));
  if (!stream || isCancelled()) {
    stream?.getTracks().forEach((track) => track.stop());
    return;
  }
  // Stashed before video.play() (which can itself reject) so a failure past
  // this point still has a handle to stop the already-acquired stream by.
  handleRef.current = { stream, intervalId: null };
  video.srcObject = stream;
  await video.play();
  callbacks.onStage("scanning");
  handleRef.current = { stream, intervalId: pollForBarcode(video, detector, callbacks.onFound) };
};

// Any rejection in this chain stops whatever stream was acquired and reports
// a real "error" stage, instead of an unhandled rejection or a stuck stage.
const startLiveScan = async (
  video: HTMLVideoElement,
  handleRef: { current: LiveScanHandle | null },
  isCancelled: () => boolean,
  callbacks: StartLiveScanCallbacks,
): Promise<void> => {
  try {
    const detector = await loadDetector();
    // StrictMode double-invoke: the stale invocation's cleanup can fire during
    // this await; without the guard it races a second getUserMedia() and reports a phantom denial.
    if (isCancelled()) {
      return;
    }
    await runCameraAcquisition(video, handleRef, isCancelled, detector, callbacks);
  } catch {
    stopLiveScan(handleRef.current);
    handleRef.current = null;
    callbacks.onStage("error");
  }
};

const makeCleanup = (cancelledRef: { current: boolean }, handleRef: { current: LiveScanHandle | null }) => (): void => {
  cancelledRef.current = true;
  stopLiveScan(handleRef.current);
};

const runLiveScan = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onDetect: (code: string) => void,
  setStage: (stage: ScanStage) => void,
): (() => void) => {
  const video = videoRef.current;
  if (!video) {
    return () => {};
  }
  const cancelledRef = { current: false };
  const handleRef: { current: LiveScanHandle | null } = { current: null };
  const onFound = (code: string): void => {
    stopLiveScan(handleRef.current);
    onDetect(code);
  };
  void startLiveScan(video, handleRef, () => cancelledRef.current, { onStage: setStage, onFound });
  return makeCleanup(cancelledRef, handleRef);
};

interface UseLiveScanResult {
  stage: ScanStage;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const useLiveScan = (onDetect: (code: string) => void): UseLiveScanResult => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stage, setStage] = useState<ScanStage>("starting");
  // Latest-callback-ref pattern: the mount effect below reads through this
  // ref, so an inline onDetect from the caller never restarts the camera.
  const onDetectRef = useRef(onDetect);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => runLiveScan(videoRef, (code) => onDetectRef.current(code), setStage), []);

  return { stage, videoRef };
};

const SCANNER_LOAD_ERROR_MESSAGE = "Couldn't load the barcode scanner. Try again in a moment.";
const NO_BARCODE_FOUND_MESSAGE = "No barcode found in that photo. Try again with the code centered and in focus.";

// A photo with no decodable barcode can make the underlying WASM throw
// instead of resolving empty - both mean "no barcode found" to the user
// (CLAUDE.md Rule 18: no unhandled rejection, no silent dead end).
const detectFromPhoto = async (detector: BarcodeDetectorApi, photo: File): Promise<string | null> => {
  try {
    const results = await detector.detect(photo);
    return results.length > 0 ? results[0].rawValue : null;
  } catch {
    return null;
  }
};

const handlePhotoFallback = async (
  photo: File,
  onDetect: (code: string) => void,
  onError: (message: string) => void,
): Promise<void> => {
  let detector: BarcodeDetectorApi;
  try {
    detector = await loadDetector();
  } catch {
    onError(SCANNER_LOAD_ERROR_MESSAGE);
    return;
  }
  const code = await detectFromPhoto(detector, photo);
  if (code === null) {
    onError(NO_BARCODE_FOUND_MESSAGE);
    return;
  }
  // Deliberately outside any try/catch here - a throw from the caller's own
  // onDetect must propagate, not get mislabeled as a decode failure.
  onDetect(code);
};

interface UsePhotoFallbackResult {
  error: string | null;
  handleSelect: (photo: File) => void;
}

const usePhotoFallback = (onDetect: (code: string) => void): UsePhotoFallbackResult => {
  const [error, setError] = useState<string | null>(null);
  const handleSelect = (photo: File): void => {
    setError(null);
    void handlePhotoFallback(photo, onDetect, setError);
  };
  return { error, handleSelect };
};

const LiveScanVideo = ({ videoRef, hidden }: { videoRef: React.RefObject<HTMLVideoElement | null>; hidden: boolean }) => (
  <video ref={videoRef} muted autoPlay playsInline hidden={hidden} className="w-full rounded-surface border border-border" />
);

const SCANNER_START_ERROR_MESSAGE = "Couldn't start the scanner. Try uploading a photo instead.";

const StartingNotice = () => <p className="text-sm text-text-muted">Starting camera…</p>;

const PermissionDeniedNotice = () => (
  <InlineMessage tone="error">
    Camera access was denied. Upload a barcode photo instead, or go back and enter the product another way.
  </InlineMessage>
);

const ScannerErrorNotice = () => <InlineMessage tone="error">{SCANNER_START_ERROR_MESSAGE}</InlineMessage>;

interface PhotoFallbackProps {
  visible: boolean;
  onReveal: () => void;
  onSelect: (photo: File) => void;
  error: string | null;
}

const PhotoFallback = ({ visible, onReveal, onSelect, error }: PhotoFallbackProps) =>
  visible ? (
    <div className="flex flex-col gap-2">
      <PhotoInput label="Barcode photo" onSelect={onSelect} />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </div>
  ) : (
    <button type="button" onClick={onReveal} className={TEXT_LINK_SM}>
      <span>Or upload a photo instead</span>
    </button>
  );

export const BarcodeScanner = ({ onDetect }: BarcodeScannerProps) => {
  const { stage, videoRef } = useLiveScan(onDetect);
  const [showPhotoFallback, setShowPhotoFallback] = useState(false);
  const photoFallback = usePhotoFallback(onDetect);

  const cameraUnavailable = stage === "permission-denied" || stage === "error";

  return (
    <div className="flex flex-col gap-4">
      <LiveScanVideo videoRef={videoRef} hidden={cameraUnavailable} />
      {stage === "starting" && <StartingNotice />}
      {stage === "permission-denied" && <PermissionDeniedNotice />}
      {stage === "error" && <ScannerErrorNotice />}
      <PhotoFallback
        visible={showPhotoFallback || cameraUnavailable}
        onReveal={() => setShowPhotoFallback(true)}
        onSelect={photoFallback.handleSelect}
        error={photoFallback.error}
      />
    </div>
  );
};
