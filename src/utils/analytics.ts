/**
 * Website analytics / ad-tracking loader (fixes B1 — "website has no tracking").
 *
 * Loads Meta Pixel, Google tag (GA4 or Google Ads), and TikTok Pixel so Meta,
 * Google and TikTok can attribute ad clicks to sign-ups and subscriptions, and
 * so cost-per-subscriber can be reported.
 *
 * IDs are read from Vite env (set them in Vercel, then redeploy) — nothing is
 * hardcoded, and each provider only loads when its ID is configured:
 *   VITE_META_PIXEL_ID     e.g. 123456789012345
 *   VITE_GA_MEASUREMENT_ID e.g. G-XXXXXXX (GA4) or AW-XXXXXXXXX (Google Ads)
 *   VITE_TIKTOK_PIXEL_ID   e.g. Cxxxxxxxxxxxxxxxxxxx
 *
 * After init, use trackEvent() to forward a conversion to every configured
 * provider, e.g. trackEvent('CompleteRegistration') or trackEvent('Subscribe').
 */

type Params = Record<string, unknown>;

const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const TIKTOK_PIXEL_ID = import.meta.env.VITE_TIKTOK_PIXEL_ID as string | undefined;

let initialized = false;

/* eslint-disable @typescript-eslint/no-explicit-any */
function w(): any {
  return window as any;
}

function initMetaPixel(id: string): void {
  const win = w();
  if (win.fbq) return;
  /* Standard Meta Pixel base code (injected via JS). */
  const n: any = (win.fbq = function (...args: unknown[]) {
    n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
  });
  if (!win._fbq) win._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  const t = document.createElement("script");
  t.async = true;
  t.src = "https://connect.facebook.net/en_US/fbevents.js";
  const s = document.getElementsByTagName("script")[0];
  s?.parentNode?.insertBefore(t, s);
  win.fbq("init", id);
  win.fbq("track", "PageView");
}

function initGoogleTag(id: string): void {
  const win = w();
  const t = document.createElement("script");
  t.async = true;
  t.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(t);
  win.dataLayer = win.dataLayer || [];
  win.gtag = function (...args: unknown[]) {
    win.dataLayer.push(args);
  };
  win.gtag("js", new Date());
  win.gtag("config", id);
}

function initTikTokPixel(id: string): void {
  const win = w();
  const d = document;
  const t = "ttq";
  win.TiktokAnalyticsObject = t;
  const ttq: any = (win[t] = win[t] || []);
  ttq.methods = [
    "page", "track", "identify", "instances", "debug", "on", "off", "once",
    "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent",
    "revokeConsent", "grantConsent",
  ];
  ttq.setAndDefer = function (obj: any, method: string) {
    obj[method] = function (...args: unknown[]) {
      obj.push([method].concat(Array.prototype.slice.call(args, 0)));
    };
  };
  for (let i = 0; i < ttq.methods.length; i++) {
    ttq.setAndDefer(ttq, ttq.methods[i]);
  }
  ttq.instance = function (pid: string) {
    const inst = (ttq._i && ttq._i[pid]) || [];
    for (let i = 0; i < ttq.methods.length; i++) {
      ttq.setAndDefer(inst, ttq.methods[i]);
    }
    return inst;
  };
  ttq.load = function (pid: string, opts?: Params) {
    const url = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i = ttq._i || {};
    ttq._i[pid] = [];
    ttq._i[pid]._u = url;
    ttq._t = ttq._t || {};
    ttq._t[pid] = +new Date();
    ttq._o = ttq._o || {};
    ttq._o[pid] = opts || {};
    const script = d.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = `${url}?sdkid=${encodeURIComponent(pid)}&lib=${t}`;
    const first = d.getElementsByTagName("script")[0];
    first?.parentNode?.insertBefore(script, first);
  };
  ttq.load(id);
  ttq.page();
}

/** Initialise every configured provider. Safe to call once at app start. */
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    if (META_PIXEL_ID) initMetaPixel(META_PIXEL_ID);
    if (GA_MEASUREMENT_ID) initGoogleTag(GA_MEASUREMENT_ID);
    if (TIKTOK_PIXEL_ID) initTikTokPixel(TIKTOK_PIXEL_ID);
  } catch (e) {
    // Never let analytics break the app.
    console.warn("analytics init failed", e);
  }
}

/**
 * Forward a conversion/event to every configured provider. Names follow the
 * Meta standard-event vocabulary (e.g. 'CompleteRegistration', 'Subscribe',
 * 'Search'); the same name is passed through to Google and TikTok.
 */
export function trackEvent(name: string, params?: Params): void {
  if (typeof window === "undefined") return;
  const win = w();
  try {
    win.fbq?.("track", name, params);
    win.gtag?.("event", name, params);
    win.ttq?.track?.(name, params);
  } catch (e) {
    console.warn("analytics trackEvent failed", e);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
