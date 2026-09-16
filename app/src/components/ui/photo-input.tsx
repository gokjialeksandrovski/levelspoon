"use client";

import { CameraIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";

import { ScanningOverlay } from "@/components/ui/scanning-overlay";

interface UsePreviewUrlResult {
  previewUrl: string | null;
  showPreview: (photo: File) => void;
}

// Revokes through a ref, not a useEffect keyed on the URL: that cleanup also
// fires on StrictMode's dev remount and would kill a URL still on screen.
export const usePreviewUrl = (): UsePreviewUrlResult => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const activeUrl = useRef<string | null>(null);

  const revokeActive = () => {
    if (activeUrl.current) {
      URL.revokeObjectURL(activeUrl.current);
    }
  };

  useEffect(() => revokeActive, []);

  const showPreview = (photo: File) => {
    revokeActive();
    activeUrl.current = URL.createObjectURL(photo);
    setPreviewUrl(activeUrl.current);
  };

  return { previewUrl, showPreview };
};

interface PhotoInputProps {
  label: string;
  onSelect: (photo: File) => void;
  // Guidance shown under the dropzone, linked via aria-describedby - used to
  // disclose the rough-estimate/third-party-service caveat before opt-in.
  hint?: string;
  // Set only while something is reading the selected photo.
  scanningLabel?: string;
}

const PREVIEW_SIZE_PX = 300;

interface PhotoPreviewProps {
  previewUrl: string;
  scanningLabel: string | undefined;
}

// object-contain on a raised mat, not a cropped fill: a nutrition label has
// to stay fully readable, so the letterboxing wants a mat, not empty page.
export const PhotoPreview = ({ previewUrl, scanningLabel }: PhotoPreviewProps) => (
  <div className="relative overflow-hidden rounded-surface border border-border bg-surface-raised">
    <Image
      src={previewUrl}
      alt="Selected preview"
      width={PREVIEW_SIZE_PX}
      height={PREVIEW_SIZE_PX}
      unoptimized
      className="max-h-48 w-full object-contain"
    />
    {scanningLabel && <ScanningOverlay label={scanningLabel} />}
  </div>
);

interface DropzoneProps {
  label: string;
  describedBy: string | undefined;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

// The label wraps the (visually hidden) file input, so the label text is
// the input's accessible name; the camera glyph is decorative.
const Dropzone = ({ label, describedBy, onChange }: DropzoneProps) => (
  <label className="relative flex min-h-36 flex-col items-center justify-center gap-2 rounded-surface border-2 border-dashed border-border bg-surface px-4 py-6 text-center transition-colors active:bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-text">
    <CameraIcon size={32} className="text-text-muted" aria-hidden="true" />
    <span className="text-sm font-medium text-text">{label}</span>
    <input
      type="file"
      accept="image/*"
      capture="environment"
      aria-describedby={describedBy}
      onChange={onChange}
      className="absolute inset-0 cursor-pointer opacity-0"
    />
  </label>
);

// Standalone handler, not a hook: previewUrl is the component's only state.
const handlePhotoChange = (
  event: ChangeEvent<HTMLInputElement>,
  onSelect: (photo: File) => void,
  showPreview: (photo: File) => void,
): void => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  showPreview(file);
  onSelect(file);
  // Clears the input so re-picking the same file still fires `change` -
  // otherwise a retry after declining consent or a failed estimate does nothing.
  input.value = "";
};

export const PhotoInput = ({ label, onSelect, hint, scanningLabel }: PhotoInputProps) => {
  const { previewUrl, showPreview } = usePreviewUrl();
  const hintId = useId();

  return (
    <div className="flex flex-col gap-2">
      <Dropzone
        label={label}
        describedBy={hint ? hintId : undefined}
        onChange={(event) => handlePhotoChange(event, onSelect, showPreview)}
      />
      {hint && (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
      {previewUrl && <PhotoPreview previewUrl={previewUrl} scanningLabel={scanningLabel} />}
    </div>
  );
};
