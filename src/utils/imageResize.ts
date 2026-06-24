const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const SKIP_BELOW_BYTES = 400_000;

/**
 * Downsample large phone photos before upload to cap memory use.
 * Non-images and GIFs are returned unchanged.
 */
export async function downsampleImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { width, height } = img;
      const maxDim = Math.max(width, height);
      if (maxDim <= MAX_DIMENSION && file.size <= SKIP_BELOW_BYTES) {
        resolve(file);
        return;
      }

      const scale = Math.min(1, MAX_DIMENSION / maxDim);
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
          resolve(
            new File([blob], `${baseName}.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now(),
            })
          );
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
