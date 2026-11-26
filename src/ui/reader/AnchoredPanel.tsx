import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLayoutMode } from '../useLayoutMode';

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

const POPOVER_WIDTH = 400;
const MARGIN = 12;
/**
 * The least part of its content a capped popover must show. Where the larger
 * side of the anchor has room for less (after the popover's header and
 * footer), the content opens as the bottom sheet instead (FOUND_ISSUES 47,
 * the owner's decision: "under half its content"). Capped to less, a popover
 * is a narrow window onto its content, and beside a tall anchor (a long
 * ḥadīth in landscape) a strip a few pixels high.
 */
const MIN_SHOWN_FRACTION = 0.5;

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
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    /** Set only when the popover fits on neither side of its anchor (47). */
    maxHeight: number | null;
  } | null>(null);

  // The same decision as the card panel's, so the two never disagree: where
  // the panel sits beside the text there is room for a popover, and where it
  // is a sheet, so is this. See src/ui/useLayoutMode.ts.
  //
  // `tooTight` is set by a placement that finds room for less than
  // MIN_SHOWN_FRACTION of the popover's content on both sides of the anchor,
  // and stays set while the panel is open: a sheet is not placed, so nothing
  // would turn it back, and a panel that changed between popover and sheet
  // as the page scrolled would jump under the finger. The change remounts
  // the panel's children (the two branches are different trees), so state
  // inside them is lost: FOUND_ISSUES 84.
  const [tooTight, setTooTight] = useState(false);
  const asSheet = useLayoutMode() === 'sheet' || preferSheet || tooTight;

  // The latest `onClose`, read by the effects and callbacks below instead of
  // listing it as a dependency. Every caller passes an inline arrow, new on
  // each reader render, and the reader renders repeatedly while scrolling,
  // for example on each change of the top block. With `onClose` as a
  // dependency, each render removed the document's pointerdown listener and
  // added it back a tick later, so a tap in that tick was not seen as an
  // outside tap, and it re-created `reposition` and so the size observer
  // (FOUND_ISSUES 34). On mount the ref already holds the current `onClose`.
  // It is updated in a layout effect declared before the ones that read it,
  // so that on an update where `reposition` changes too (`asSheet` flipping,
  // or a new anchor), the placement that update runs calls the new
  // `onClose`, not the previous render's.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  /** Re-measure the anchor and place the popover beside it. */
  const reposition = useCallback(() => {
    if (asSheet) return;

    // The anchor lives in a virtualized list and can be unmounted by scrolling.
    if (!anchor.isConnected) {
      onCloseRef.current();
      return;
    }

    const rect = anchor.getBoundingClientRect();

    // Closed only when the anchored text has actually left the viewport —
    // not merely because the reader scrolled.
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      onCloseRef.current();
      return;
    }

    const left = Math.min(
      Math.max(MARGIN, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - MARGIN,
    );

    // The popover's own height, as its content would make it: header and
    // footer, and the body at its full height up to the 60vh the body's CSS
    // allows. Measured from the body's scrollHeight, not the panel's
    // offsetHeight, which a cap set by an earlier placement would shrink. The
    // 60vh is read from the computed style rather than worked out from
    // innerHeight: in a browser tab on Android, vh is measured without the
    // URL bar and innerHeight with it.
    const panel = panelRef.current;
    const body = bodyRef.current;
    const bodyCap = body ? parseFloat(getComputedStyle(body).maxHeight) : NaN;
    // Header, footer and borders: what a capped popover shows besides its
    // content.
    const chrome = panel && body ? panel.offsetHeight - body.offsetHeight : 0;
    const contentHeight = body ? body.scrollHeight : 0;
    const panelHeight =
      panel && body
        ? chrome + Math.min(contentHeight, Number.isNaN(bodyCap) ? Infinity : bodyCap)
        : 280;

    // Below the anchor if it fits, above it if it fits there. If it fits on
    // neither side, it goes on the side with more room, its height capped to
    // that room, and its body scrolls; by the owner's decision on
    // FOUND_ISSUES 47 it never covers the anchor. If that side cannot show
    // half of it, the content opens as the bottom sheet instead. It used to
    // be clamped to the top of the screen at its full height, over the
    // anchored text.
    const below = rect.bottom + 8;
    const roomBelow = window.innerHeight - MARGIN - below;
    const roomAbove = rect.top - 8 - MARGIN;
    let top: number;
    let maxHeight: number | null = null;
    if (panelHeight <= roomBelow) {
      top = below;
    } else if (panelHeight <= roomAbove) {
      top = rect.top - 8 - panelHeight;
    } else if (Math.max(roomBelow, roomAbove) - chrome < contentHeight * MIN_SHOWN_FRACTION) {
      setTooTight(true);
      return;
    } else if (roomBelow >= roomAbove) {
      top = below;
      maxHeight = Math.max(0, roomBelow);
    } else {
      maxHeight = Math.max(0, roomAbove);
      top = MARGIN;
    }

    setPosition({ left, top, maxHeight });
  }, [anchor, asSheet]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  // Placed again whenever the panel's own size changes. The first placement
  // measures the panel as it first renders, which for a sheet whose lookups
  // fill in afterwards (the ḥadīth sheet's dorar, sunnah.com and commentaries;
  // the Qurʾān sheet's bundled translation) is its short loading state: chosen
  // to fit below the anchor, it then grew past the bottom of the screen. It was
  // put right only by a window scroll or resize, or when something else
  // re-rendered the reader and, by accident, re-ran the effect above
  // (FOUND_ISSUES 37). Placing it moves its
  // `top` and `left`, and changes its size only when it caps its height
  // (47); the placement that follows such a change measures the same content
  // and so sets the same cap, and the observer does not fire again. A sheet
  // is pinned to the bottom of the screen and is never placed.
  //
  // The content inside the body is observed too: once a placement has capped
  // the popover's height (47), its content can grow without the popover
  // changing size, and the next placement must see it (it may now need the
  // sheet, or no longer fit where it is).
  useEffect(() => {
    const panel = panelRef.current;
    if (asSheet || !panel) return;
    const observer = new ResizeObserver(() => reposition());
    observer.observe(panel);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [asSheet, reposition]);

  // Placed again when the anchor moves with no scroll, no resize and no
  // change in the panel's own size: when layout above it changes inside the
  // viewport (a block above it growing or shrinking as it is measured, say),
  // or the list moves under the sticky header. None of the listeners here
  // hears that, so the popover stayed where it was and the anchor slid under
  // it or away from it (FOUND_ISSUES 49). Nothing reports an element's
  // position changing, so the anchor's rectangle is read once a frame while
  // the popover is open, and the popover is placed again only when the
  // rectangle has moved. A rectangle read on a frame whose layout is already
  // clean costs microseconds, and the loop runs only while a popover is open,
  // never for a sheet (pinned to the bottom of the screen, never placed).
  useEffect(() => {
    if (asSheet) return;
    let frame = 0;
    let last: DOMRect | null = null;
    const watch = () => {
      if (anchor.isConnected) {
        const rect = anchor.getBoundingClientRect();
        if (
          last !== null &&
          (rect.top !== last.top || rect.left !== last.left || rect.bottom !== last.bottom || rect.right !== last.right)
        ) {
          reposition();
        }
        last = rect;
      }
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
    return () => cancelAnimationFrame(frame);
  }, [anchor, asSheet, reposition]);

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
      onCloseRef.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
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
  }, [anchor, reposition]);

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
        maxHeight: position?.maxHeight ?? undefined,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {header}
      {/* min-h-0 lets the body shrink below its content, and so scroll, when
          the popover's height is capped (FOUND_ISSUES 47). */}
      <div ref={bodyRef} className="panel-body min-h-0 flex-1">
        <div ref={contentRef}>{children}</div>
      </div>
      {footer && <div className="shrink-0 border-t border-rule px-3 py-2">{footer}</div>}
    </div>
  );
}
