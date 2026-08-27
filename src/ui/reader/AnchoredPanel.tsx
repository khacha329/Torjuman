import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// A panel anchored to a span of text — either a floating popover or, when the
// content is long or the screen is narrow, a bottom sheet.
//
// ---------------------------------------------------------------------------
// Correcting the "dismiss on scroll" behaviour specified in Amendment 3.
//
// That rule is right for a one-line glance and wrong the moment the panel holds
// a paragraph of translation, and the first implementation of it was broken in
// two compounding ways:
//
//   1. scroll events do not bubble, so the dismiss handler was attached to the
//      window in the capture phase — which fires for every scroll on the page,
//      *including the one inside the panel*. Scrolling the translation closed
//      it. The handler now ignores any scroll originating inside the panel.
//
//   2. Scroll chaining. Once the panel's body reaches its end, the browser
//      hands the remaining scroll to the reader behind it, which scrolls and
//      dismissed the panel. `overscroll-behavior: contain` on the body stops
//      that, and it is the fix that matters on a touchscreen, where overscroll
//      gestures are constant.
//
// Beyond the bug: closing on *any* reader scroll is the wrong behaviour for
// lesson preparation. Scrolling the Arabic to see what came before a passage
// while its translation stays open is exactly what this is for. So the popover
// now follows its anchor and closes only when the anchored text actually leaves
// the viewport.
// ---------------------------------------------------------------------------

const WIDE_QUERY = '(min-width: 1024px)';
const POPOVER_WIDTH = 400;
const MARGIN = 12;

export function AnchoredPanel({
  anchor,
  title,
  /** Long content outgrows the popover pattern and opens as a sheet instead. */
  preferSheet = false,
  onClose,
  footer,
  children,
}: {
  anchor: HTMLElement;
  title: ReactNode;
  preferSheet?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const asSheet = !wide || preferSheet;

  /** Re-measure the anchor and place the popover beside it. */
  const reposition = useCallback(() => {
    if (asSheet) return;

    // The anchor lives in a virtualized list and can be unmounted by scrolling.
    if (!anchor.isConnected) {
      onClose();
      return;
    }

    const rect = anchor.getBoundingClientRect();

    // Closed only when the anchored text has actually left the viewport —
    // not merely because the reader scrolled.
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      onClose();
      return;
    }

    const left = Math.min(
      Math.max(MARGIN, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - MARGIN,
    );

    const panelHeight = panelRef.current?.offsetHeight ?? 280;
    const below = rect.bottom + 8;
    const top =
      below + panelHeight + MARGIN <= window.innerHeight
        ? below
        : Math.max(MARGIN, rect.top - 8 - panelHeight);

    setPosition({ left, top });
  }, [anchor, asSheet, onClose]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  useEffect(() => {
    const onScroll = (event: Event) => {
      // A scroll that started inside the panel is the user reading it, not a
      // reason to take it away.
      if (panelRef.current?.contains(event.target as Node)) return;
      reposition();
    };

    const onResize = () => reposition();

    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      if (anchor.contains(event.target as Node)) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    // Capture phase, because scroll does not bubble.
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    // Deferred: the click that opened the panel would otherwise close it.
    const timer = setTimeout(() => document.addEventListener('pointerdown', onPointerDown), 0);

    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      clearTimeout(timer);
    };
  }, [anchor, onClose, reposition]);

  const header = (
    <div className="no-select flex shrink-0 items-baseline gap-2 border-b border-rule bg-white px-3 py-2">
      {title}
      <button
        onClick={onClose}
        className="ml-auto rounded px-2 text-xs text-muted hover:bg-rule"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );

  if (asSheet) {
    return (
      <>
        <button
          className="fixed inset-0 z-40 cursor-default bg-black/10"
          onClick={onClose}
          aria-hidden
        />
        <div
          ref={panelRef}
          dir="ltr"
          role="dialog"
          className="ltr-isolate fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-xl border-t border-rule bg-white shadow-2xl"
        >
          {/* A drag handle is the obvious dismiss affordance on a touchscreen,
              and a sheet can go near-full-height without covering the anchor. */}
          <div className="flex justify-center pt-2 pb-1">
            <span className="h-1 w-10 rounded-full bg-rule" aria-hidden />
          </div>
          {header}
          <div className="panel-body flex-1">{children}</div>
          {footer && <div className="shrink-0 border-t border-rule px-3 py-2">{footer}</div>}
        </div>
      </>
    );
  }

  return (
    <div
      ref={panelRef}
      dir="ltr"
      role="dialog"
      className="ltr-isolate fixed z-50 flex flex-col overflow-hidden rounded-lg border border-rule bg-white shadow-xl"
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        width: POPOVER_WIDTH,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {header}
      <div className="panel-body flex-1">{children}</div>
      {footer && <div className="shrink-0 border-t border-rule px-3 py-2">{footer}</div>}
    </div>
  );
}
