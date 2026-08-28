"use client";

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
      <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
        {label}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="text-sm font-normal"
        />
      </label>
      {previewUrl && (
        <Image
          src={previewUrl}
          alt="Selected preview"
          width={PREVIEW_SIZE_PX}
          height={PREVIEW_SIZE_PX}
          unoptimized
          className="max-h-48 w-auto rounded border object-contain"
        />
      )}
    </div>
  );
};
