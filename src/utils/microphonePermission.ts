import { Capacitor, registerPlugin } from "@capacitor/core";

type MicrophonePermissionPlugin = {
  check: () => Promise<{ microphone: string }>;
  request: () => Promise<{ microphone: string }>;
};

const MicrophonePermission =
  registerPlugin<MicrophonePermissionPlugin>("MicrophonePermission");

/**
 * Ensure the app can use the microphone before starting voice input.
 * On Android, requests the native RECORD_AUDIO runtime permission first,
 * then probes getUserMedia so the WebView also grants AUDIO_CAPTURE.
 */
export async function ensureMicrophonePermission(): Promise<boolean> {
  const isAndroidNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  if (isAndroidNative) {
    try {
      const result = await MicrophonePermission.request();
      if (String(result?.microphone || "").toLowerCase() !== "granted") {
        return false;
      }
    } catch {
      return false;
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    // Native Android already granted RECORD_AUDIO above; WebView may still
    // support speech recognition without a mediaDevices probe.
    return isAndroidNative;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
