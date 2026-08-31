"use client";

import { Camera } from "@phosphor-icons/react";
import Image from "next/image";
import { type ChangeEvent, useState } from "react";

interface PhotoInputProps {
  label: string;
  onSelect: (photo: File) => void;
}

const PREVIEW_SIZE_PX = 300;

export const PhotoInput = ({ label, onSelect }: PhotoInputProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    onSelect(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="relative flex min-h-36 flex-col items-center justify-center gap-2 rounded-(--radius-surface) border-2 border-dashed border-border bg-surface px-4 py-6 text-center transition-colors active:bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <Camera size={32} weight="light" className="text-text-muted" aria-hidden="true" />
        <span className="text-sm font-medium text-text">{label}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {previewUrl && (
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
      )}
    </div>
  );
};
