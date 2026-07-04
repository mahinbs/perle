import { Capacitor } from '@capacitor/core';

/**
 * Mobile browser keyboard fix (ChatGPT-style): pin the app shell to the
 * visual viewport so the header stays visible when the keyboard opens.
 */
export function initMobileWebViewportLayout(): void {
  if (typeof window === 'undefined' || Capacitor.isNativePlatform()) return;

  const isMobileWeb =
    window.matchMedia('(max-width: 768px)').matches ||
    window.matchMedia('(pointer: coarse)').matches;
  if (!isMobileWeb) return;

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
