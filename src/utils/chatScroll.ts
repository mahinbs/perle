import { useLayoutEffect, useState, type RefObject } from "react";

/** Offset from the top of the scroll container (header / safe area). */
export const CHAT_EXCHANGE_SCROLL_OFFSET = 90;

/** Tighter offset for follow-ups so the new question sits at the very top. */
export const CHAT_FOLLOW_UP_SCROLL_OFFSET_MOBILE = 42;
export const CHAT_FOLLOW_UP_SCROLL_OFFSET_DESKTOP = 44;

export function getExchangeScrollOffset(isFollowUp: boolean): number {
  if (!isFollowUp) return CHAT_EXCHANGE_SCROLL_OFFSET;
  if (typeof window === 'undefined') return CHAT_FOLLOW_UP_SCROLL_OFFSET_MOBILE;
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  return isMobile
    ? CHAT_FOLLOW_UP_SCROLL_OFFSET_MOBILE
    : CHAT_FOLLOW_UP_SCROLL_OFFSET_DESKTOP;
}

export type ScrollExchangeOptions = {
  offset?: number;
  behavior?: ScrollBehavior;
};

/**
 * Min-height for the active exchange so there is enough scroll room to pin it
 * at the top while older exchanges move above the viewport (ChatGPT / Grok).
 */
export function getActiveExchangeMinHeight(
  viewportHeight: number,
  offset = CHAT_EXCHANGE_SCROLL_OFFSET,
  isFollowUp = false
): number | undefined {
  if (viewportHeight <= 0) return undefined;
  const effectiveOffset = isFollowUp ? getExchangeScrollOffset(true) : offset;
  return Math.max(0, viewportHeight - effectiveOffset);
}

export function useScrollViewportHeight(
  containerRef: RefObject<HTMLElement | null>
): number {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => setHeight(el.clientHeight);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return height;
}

/**
 * Pin a new chat exchange near the top of its scroll container (ChatGPT / Grok style).
 * Older exchanges scroll up and out of view above the viewport.
 */
export function scrollExchangeToTop(
  scrollContainer: HTMLElement | null | undefined,
  targetElement: HTMLElement | null | undefined,
  options?: ScrollExchangeOptions
): void {
  if (!scrollContainer || !targetElement) return;

  const offset = options?.offset ?? CHAT_EXCHANGE_SCROLL_OFFSET;
  const behavior = options?.behavior ?? "auto";

  const containerRect = scrollContainer.getBoundingClientRect();
  const elementRect = targetElement.getBoundingClientRect();
  const targetTop =
    scrollContainer.scrollTop + (elementRect.top - containerRect.top) - offset;

  scrollContainer.scrollTo({
    top: Math.max(0, targetTop),
    behavior,
  });
}

/** Run scroll after layout so the target element is measured correctly. */
export function scheduleScrollExchangeToTop(
  scrollContainer: HTMLElement | null | undefined,
  targetElement: HTMLElement | null | undefined,
  options?: ScrollExchangeOptions
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollExchangeToTop(scrollContainer, targetElement, options);
    });
  });
}
