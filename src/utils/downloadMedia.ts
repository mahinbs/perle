import { Capacitor } from "@capacitor/core";
import { getAuthToken } from "./auth";
import { MediaFiles } from "../plugins/mediaFiles";

/**
 * Download / save a media file (image or video) on web + Capacitor native.
 *
 * Native: MediaFiles plugin → Downloads (Android) / share sheet (iOS).
 * Web: blob + anchor download.
 */
/** @returns true when a file was saved/downloaded; false if the user cancelled. */
export async function downloadMedia(url: string, filename: string): Promise<boolean> {
  const blob = await fetchMediaBlob(url, filename);
  if (!blob) {
    const opened = window.open(url, "_blank");
    if (!opened) throw new Error("Unable to download or open the file");
    return true;
  }

  const mimeType = blob.type || guessMime(filename);
  const safeName = filename || `download-${Date.now()}`;

  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    try {
      await MediaFiles.save({ data, filename: safeName, mimeType });
    } catch (e: unknown) {
      // iOS share-sheet cancel should not surface as a hard failure.
      if (isUserCancelled(e)) return false;
      throw e;
    }
    return true;
  }

  if (!triggerBlobDownload(blob, safeName)) {
    throw new Error("Unable to download the file");
  }
  return true;
}

/**
 * Share a media file via the system share sheet (native) or Web Share API (web).
 */
export async function shareMedia(url: string, filename: string): Promise<void> {
  const blob = await fetchMediaBlob(url, filename);
  if (!blob) throw new Error("Unable to prepare file for sharing");

  const mimeType = blob.type || guessMime(filename);
  const safeName = filename || `share-${Date.now()}`;

  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    try {
      await MediaFiles.share({ data, filename: safeName, mimeType });
    } catch (e: unknown) {
      if (isUserCancelled(e)) return;
      throw e;
    }
    return;
  }

  const file = new File([blob], safeName, { type: mimeType });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData & { files?: File[] }) => boolean;
    share?: (data?: ShareData & { files?: File[] }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file], title: safeName });
      return;
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }

  // Fallback: download on web when share isn't available.
  if (!triggerBlobDownload(blob, safeName)) {
    throw new Error("Unable to share the file");
  }
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
    // CORS — try authenticated proxy.
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

function isUserCancelled(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "USER_CANCELLED") return true;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("cancel") || msg.includes("abort");
}
