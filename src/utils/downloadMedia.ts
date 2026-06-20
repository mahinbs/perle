import { Capacitor } from "@capacitor/core";

/**
 * Download / save a media file (image or video) in a way that actually works on
 * BOTH the web and inside the Capacitor native WebView.
 *
 * The old approach (`<a download>` + a.click()) is a no-op in native WebViews —
 * that's why the download buttons did nothing in the app. Here we:
 *   - Native: fetch the blob and hand it to the system share sheet
 *     (navigator.share with files → "Save Image" / "Save to Files"). If sharing
 *     isn't available, open the URL so the user can long-press to save.
 *   - Web: fetch the blob and trigger a normal anchor download.
 *   - If the blob can't be fetched (CORS), fall back to opening the URL.
 *
 * Throws only if nothing at all could be done, so callers can show a toast.
 */
export async function downloadMedia(url: string, filename: string): Promise<void> {
  const isNative = Capacitor.isNativePlatform();

  let blob: Blob | null = null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) blob = await res.blob();
  } catch {
    // CORS or network issue — handled by the URL-open fallback below.
  }

  if (isNative) {
    if (blob) {
      const file = new File([blob], filename, {
        type: blob.type || "application/octet-stream",
      });
      const nav = navigator as Navigator & {
        canShare?: (data?: any) => boolean;
        share?: (data?: any) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
        try {
          await nav.share({ files: [file], title: filename });
          return;
        } catch (e: any) {
          // User dismissed the share sheet — treat as success (their choice).
          if (e?.name === "AbortError") return;
          // otherwise fall through to opening the URL
        }
      }
    }
    // No share support / no blob → open so the user can long-press to save.
    window.open(url, "_blank");
    return;
  }

  // ── Web ──────────────────────────────────────────────────────────────────
  if (blob) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return;
  }

  // Couldn't fetch the blob (CORS) — open in a new tab as a fallback.
  const opened = window.open(url, "_blank");
  if (!opened) throw new Error("Unable to download or open the file");
}
