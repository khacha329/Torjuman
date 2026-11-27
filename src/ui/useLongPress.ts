import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

// A long press on an element, for a menu of actions on it (the Library's book
// cards). Touch first: the owner's tablet has no right button and no hover.
//
// Pointer events and a timer rather than `contextmenu` alone. Android Chrome
// does fire `contextmenu` on a long press, but not over text it would rather
// select, which a book card's title is, and DuckDuckGo's WebView is not known
// to fire it at all; a desktop right-click fires it and nothing else. So the
// timer opens the menu on a touch or a held mouse, and `contextmenu` opens it
// on a right-click — and is cancelled in every case, so the browser's own menu
// never covers ours.
//
// The press is dropped when the finger moves (the page is being scrolled; the
// browser also sends `pointercancel` once it takes the gesture over) or
// lifts early.
//
// After a long press has opened the menu, the lift still produces a click,
// and it must not land. Swallowing it on the element itself is not enough:
// measured in Chromium with touch emulation, the click after a touch long
// press went to what was under the finger when it lifted — the menu's
// backdrop, which closes the menu — not to the card the press began on. So
// the one click that follows the lift is swallowed at the window, in the
// capture phase, and the listener goes after a short while if no click comes.

const HOLD_MS = 500;
/** How far a finger may drift and still be pressing, in CSS pixels. */
const SLOP_PX = 10;
/** How long after the lift a click still counts as the lift's own. */
const CLICK_WINDOW_MS = 400;

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onContextMenu: (event: MouseEvent) => void;
}

/** Drops the next click anywhere in the page, if it comes soon. */
function swallowNextClick(): void {
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener('click', swallow, true);
  };
  window.addEventListener('click', swallow, true);
  window.setTimeout(() => window.removeEventListener('click', swallow, true), CLICK_WINDOW_MS);
}

/**
 * When the pointer that made a long press lifts, wherever it lifts — a mouse
 * released over the menu's backdrop is not the card's pointerup — the click
 * that follows is dropped. A cancelled pointer produces no click.
 */
function swallowClickAfterLift(): void {
  const lift = () => {
    done();
    swallowNextClick();
  };
  const done = () => {
    window.removeEventListener('pointerup', lift, true);
    window.removeEventListener('pointercancel', done, true);
  };
  window.addEventListener('pointerup', lift, true);
  window.addEventListener('pointercancel', done, true);
}

export function useLongPress(
  onLongPress: () => void,
  enabled = true,
): LongPressHandlers | Record<string, never> {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  });

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const handlers: LongPressHandlers = {
    onPointerDown: (event) => {
      // A right-click is `contextmenu`'s; only the main button holds.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      clear();
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        start.current = null;
        swallowClickAfterLift();
        callback.current();
      }, HOLD_MS);
    },
    onPointerMove: (event) => {
      const origin = start.current;
      if (!origin) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > SLOP_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (event) => {
      event.preventDefault();
      // A press still timing that the browser called a long press first is
      // that long press, so its lift is swallowed too. A right-click is not
      // a press (its pointerdown is ignored above), and no click follows it.
      // After the timer has opened the menu, opening it again is harmless.
      if (timer.current !== null) swallowClickAfterLift();
      clear();
      callback.current();
    },
  };

  return enabled ? handlers : {};
}
