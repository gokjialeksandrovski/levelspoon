"use client";

import { CameraIcon, XIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Image from "next/image";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";

import { ScanningOverlay } from "@/components/ui/scanning-overlay";
import { ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

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

// A data URL, not an object URL. usePreviewUrl gets away with an object URL
// because it creates one in an event handler, well after effects settle; one
// created for a prop is revoked by StrictMode's dev double-effect before the
// expanded <Image> can fetch it again. A data URL has nothing to revoke.
//
// setUrl runs in the reader's callback, never in the effect body, which this
// repo's lint rejects. Null while there is no blob.
export const useDataUrl = (blob: Blob | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(blob);
    return () => reader.abort();
  }, [blob]);

  return url;
};

interface PhotoInputProps {
  label: string;
  onSelect: (photo: File) => void;
  // Guidance shown under the dropzone, linked via aria-describedby - used to
  // disclose the rough-estimate/third-party-service caveat before opt-in.
  hint?: string;
  // Set only while something is reading the selected photo.
  scanningLabel?: string;
  /** What the photo is of, when a camera does not say it: the wizard's entry
   * rows already print a barcode glyph for a code, and a tile asking for the
   * same thing has to read the same way. Defaults to the camera. */
  icon?: Icon;
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
  icon: Icon;
  describedBy: string | undefined;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

// The label wraps the (visually hidden) file input, so the label text is
// the input's accessible name; the camera glyph is decorative. A raised tile
// that presses like a Button, not the stock dashed upload box.
//
// Bare glyph at the option rows' own size/gap/colour (product-name-step's
// OPTION_ROW_LAYOUT), not a disc behind it: every other icon+label row in the
// app reads that way, and an icon on a disc on a card is the templated-SaaS
// tell the design context rejects by name.
const Dropzone = ({ label, icon: DropzoneIcon, describedBy, onChange }: DropzoneProps) => (
  <label className="relative flex min-h-16 items-center gap-3 rounded-surface bg-surface-raised p-4 text-left transition-transform duration-100 hover:bg-border active:scale-[0.98] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-text">
    <DropzoneIcon size={24} className="shrink-0 text-text-muted" aria-hidden="true" />
    <span className="text-sm font-medium text-text">{label}</span>
    <input
      type="file"
      accept="image/*"
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

export const PhotoInput = ({ label, onSelect, hint, scanningLabel, icon = CameraIcon }: PhotoInputProps) => {
  const { previewUrl, showPreview } = usePreviewUrl();
  const hintId = useId();

  return (
    <div className="flex flex-col gap-2">
      {!scanningLabel && (
        <>
          <Dropzone
            label={label}
            icon={icon}
            describedBy={hint ? hintId : undefined}
            onChange={(event) => handlePhotoChange(event, onSelect, showPreview)}
          />
          {hint && (
            <p id={hintId} className="text-sm/relaxed text-text-muted">
              {hint}
            </p>
          )}
        </>
      )}
      {previewUrl && <PhotoPreview previewUrl={previewUrl} scanningLabel={scanningLabel} />}
    </div>
  );
};

interface AttachedPhotoProps {
  photo: Blob;
  /** What the photo is of - the same words the dropzone it replaced used. */
  label: string;
  onRemove: () => void;
}

const ATTACHED_THUMB_PX = 96;

// Takes the dropzone's place once a photo is picked: same raised tile, so the
// slot reads as "filled" rather than growing a second control under it. The
// thumbnail says which photo; the X is the one way to take it back.
export const AttachedPhoto = ({ photo, label, onRemove }: AttachedPhotoProps) => {
  const url = useDataUrl(photo);
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-surface bg-surface-raised py-2 pr-1 pl-2">
      {url ? (
        <Image src={url} alt="" width={ATTACHED_THUMB_PX} height={ATTACHED_THUMB_PX} unoptimized className="size-12 shrink-0 rounded-control object-cover" />
      ) : (
        <span aria-hidden="true" className="size-12 shrink-0 rounded-control bg-border" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className="text-xs text-text-muted">Attached</span>
      </span>
      <button type="button" aria-label="Remove photo" onClick={onRemove} className={`${ICON_TAP_TARGET_CLASS} text-text-muted`}>
        <XIcon weight="regular" />
      </button>
    </div>
  );
};
