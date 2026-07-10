import { Capacitor } from "@capacitor/core";
import { getAuthToken } from "./auth";

/**
 * Download / save a media file (image or video) in a way that actually works on
 * BOTH the web and inside the Capacitor native WebView.
 *
 * Strategy:
 *   1. Fetch blob directly (works when CORS allows).
 *   2. Fall back to same-origin API proxy (fixes mobile WebView CORS issues).
 *   3. Native: Web Share API with files → anchor download → open URL.
 *   4. Web: anchor download with blob URL → open URL.
 */
export async function downloadMedia(url: string, filename: string): Promise<void> {
  const isNative = Capacitor.isNativePlatform();
  const blob = await fetchMediaBlob(url, filename);

  if (blob) {
    const file = new File([blob], filename, {
      type: blob.type || "application/octet-stream",
    });

    if (isNative) {
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData & { files?: File[] }) => boolean;
        share?: (data?: ShareData & { files?: File[] }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
        try {
          await nav.share({ files: [file], title: filename });
          return;
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") return;
        }
      }

      // Some Android WebViews support programmatic download from blob URLs.
      if (triggerBlobDownload(blob, filename)) return;
    } else if (triggerBlobDownload(blob, filename)) {
      return;
    }
  }

  // Last resort: open the URL so the user can long-press / use system save.
  const opened = window.open(url, "_blank");
  if (!opened) throw new Error("Unable to download or open the file");
}

async function fetchMediaBlob(url: string, filename: string): Promise<Blob | null> {
  if (url.startsWith("data:")) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.blob();
    } catch {
      return null;
    }
    return null;
  }

  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) return await res.blob();
  } catch {
    // CORS or network issue — try authenticated same-origin proxy below.
  }

  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  const token = getAuthToken();
  if (!baseUrl || !token) return null;

  try {
    const proxyUrl = `${baseUrl.replace(/\/+$/, "")}/api/media/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const res = await fetch(proxyUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return await res.blob();
  } catch {
    return null;
  }

  return null;
}

function triggerBlobDownload(blob: Blob, filename: string): boolean {
  try {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch {
    return false;
  }
}
