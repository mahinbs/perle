import { Capacitor } from '@capacitor/core';

/** CSS class for sticky bottom input / composer bars. */
export const INPUT_BAR_SAFE_BOTTOM_CLASS = 'input-bar-safe-bottom';

/** CSS class for bottom sheets (attach menu, model picker, etc.). */
export const BOTTOM_SHEET_SAFE_BOTTOM_CLASS = 'bottom-sheet-safe-bottom';

export function isIosPlatform(): boolean {
  if (Capacitor.getPlatform() === 'ios') return true;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) && !/MSStream/i.test(ua);
}

/** Adds platform classes on `<html>` for safe-area CSS overrides (iOS home indicator). */
export function initPlatformInsets(): void {
  const root = document.documentElement;

  if (isIosPlatform()) {
    root.classList.add('platform-ios');
  }

  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    root.classList.add('platform-android');
  }
  if (Capacitor.isNativePlatform()) {
    root.classList.add('platform-native');
  }
}
