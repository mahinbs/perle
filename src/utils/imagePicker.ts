import { Capacitor } from "@capacitor/core";

// 20 MB everywhere — matches the backend multer cap (MAX_UPLOAD_BYTES in
// server/src/utils/uploadConfig.ts). Lifted from 10 MB on user request so
// modern phone photos / multi-page PDFs sail through without rejection.
const MAX_LOGO_BYTES = 20 * 1024 * 1024;

export const MAX_IMAGE_UPLOAD_MB = 20;

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg)$/i;

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (!file.type && IMAGE_EXTENSIONS.test(file.name)) return true;
  return IMAGE_EXTENSIONS.test(file.name);
}

export function isImageWithinSizeLimit(
  file: File,
  maxBytes = MAX_LOGO_BYTES
): boolean {
  return file.size <= maxBytes;
}

/**
 * Pick an image file — uses native file input on web and Capacitor WebView.
 * For camera capture on mobile, use a separate input with capture="environment".
 */
export function openImageFilePicker(
  input: HTMLInputElement | null,
  options?: { capture?: boolean }
): void {
  if (!input) return;
  if (options?.capture && Capacitor.isNativePlatform()) {
    input.setAttribute("capture", "environment");
  } else {
    input.removeAttribute("capture");
  }
  input.click();
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
