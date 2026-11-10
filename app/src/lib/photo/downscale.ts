// Phone photos run several MB, over the 1 MB Server Action default.
// 2048 px on the long edge still leaves label
// text tens of pixels tall for OCR, and lands a JPEG well under 1 MB.
const MAX_PHOTO_EDGE_PX = 2048;
const JPEG_QUALITY = 0.85;

interface PixelSize {
  width: number;
  height: number;
}

export const fitWithin = (size: PixelSize, maxEdge: number): PixelSize => {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
};

const encodeJpeg = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));

const drawScaled = (bitmap: ImageBitmap, target: PixelSize): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable");
  }
  context.drawImage(bitmap, 0, 0, target.width, target.height);
  return canvas;
};

const shrink = async (photo: File): Promise<File> => {
  const bitmap = await createImageBitmap(photo);
  const target = fitWithin(bitmap, MAX_PHOTO_EDGE_PX);
  if (target.width === bitmap.width) {
    bitmap.close();
    return photo;
  }
  const canvas = drawScaled(bitmap, target);
  bitmap.close();
  const blob = await encodeJpeg(canvas);
  return blob ? new File([blob], photo.name, { type: "image/jpeg" }) : photo;
};

// Never rejects: a photo this browser cannot decode (HEIC on Chrome) goes up
// as picked, and the action that reads it reports the failure.
export const downscalePhoto = async (photo: File): Promise<File> => {
  try {
    return await shrink(photo);
  } catch {
    return photo;
  }
};
