import { Capacitor } from '@capacitor/core';

/**
 * Mobile browser & iOS native keyboard fix (ChatGPT-style): pin the app shell
 * to the visual viewport so the header stays visible when the keyboard opens.
 *
 * - Mobile web: always active.
 * - iOS Capacitor native: WKWebView does NOT honour `adjustResize`; instead the
 *   visual viewport shrinks when the keyboard appears. We apply the same CSS
 *   variable trick here so the layout behaves identically to Android.
 * - Android Capacitor: uses `adjustResize` (manifest), so the WebView itself
 *   resizes and this helper is not needed; skip to avoid double-handling.
 */
export function initMobileWebViewportLayout(): void {
  if (typeof window === 'undefined') return;

  const isAndroidNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  if (isAndroidNative) return; // adjustResize handles it on Android

  const isMobileWeb =
    !Capacitor.isNativePlatform() &&
    (window.matchMedia('(max-width: 768px)').matches ||
      window.matchMedia('(pointer: coarse)').matches);

  const isIOSNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

  if (!isMobileWeb && !isIOSNative) return;

  const root = document.documentElement;
  root.classList.add('layout-visual-viewport');

  const update = () => {
    const vv = window.visualViewport;
    if (!vv) {
      root.style.setProperty('--app-vh', `${window.innerHeight}px`);
      root.style.setProperty('--app-vt', '0px');
      return;
    }
    root.style.setProperty('--app-vh', `${vv.height}px`);
    root.style.setProperty('--app-vt', `${vv.offsetTop}px`);
  };

  update();
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  window.addEventListener('orientationchange', update);
}
