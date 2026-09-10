"use client";

import { Camera } from "@phosphor-icons/react";
import Image from "next/image";
import { type ChangeEvent, useId, useState } from "react";

interface PhotoInputProps {
  label: string;
  onSelect: (photo: File) => void;
  // Persistent guidance shown under the dropzone and linked to the file
  // input via aria-describedby. Used by the amount step to disclose, before
  // anyone opts in, that the photo estimate is a rough guess and that the
  // image is sent to a third-party service (found via /accessibility, 2026-09-10).
  hint?: string;
}

const PREVIEW_SIZE_PX = 300;

const PhotoPreview = ({ previewUrl }: { previewUrl: string }) => (
  <div className="overflow-hidden rounded-(--radius-surface) border border-border">
    <Image
      src={previewUrl}
      alt="Selected preview"
      width={PREVIEW_SIZE_PX}
      height={PREVIEW_SIZE_PX}
      unoptimized
      className="max-h-48 w-full object-contain"
    />
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
  <label className="relative flex min-h-36 flex-col items-center justify-center gap-2 rounded-(--radius-surface) border-2 border-dashed border-border bg-surface px-4 py-6 text-center transition-colors active:bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-text">
    <Camera size={32} className="text-text-muted" aria-hidden="true" />
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

// Standalone handler, not a hook, since previewUrl is the component's only
// piece of state - mirrors the same shape used elsewhere in this pass for
// single-flag handlers.
const handlePhotoChange = (
  event: ChangeEvent<HTMLInputElement>,
  onSelect: (photo: File) => void,
  setPreviewUrl: (url: string) => void,
): void => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  setPreviewUrl(URL.createObjectURL(file));
  onSelect(file);
  // Clear the input so picking the same file again still fires `change` -
  // otherwise a retry (e.g. after declining the AI terms, or after a failed
  // estimate) with the identical photo does nothing.
  input.value = "";
};

export const PhotoInput = ({ label, onSelect, hint }: PhotoInputProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const hintId = useId();

  return (
    <div className="flex flex-col gap-2">
      <Dropzone
        label={label}
        describedBy={hint ? hintId : undefined}
        onChange={(event) => handlePhotoChange(event, onSelect, setPreviewUrl)}
      />
      {hint && (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
      {previewUrl && <PhotoPreview previewUrl={previewUrl} />}
    </div>
  );
};
