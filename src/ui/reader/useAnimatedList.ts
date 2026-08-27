import { useEffect, useRef, useState } from 'react';

// Keeping a departing row on screen long enough to animate out.
//
// ---------------------------------------------------------------------------
// Why this is needed at all
//
// The Visible scope re-derives the panel's contents as the reader scrolls. A
// card that leaves scope is simply gone from the next render, and a card that
// enters appears fully formed — so a fast scroll reads as the panel strobing.
//
// Debouncing the scroll signal is the primary fix and lives in ReaderScreen.
// This is the second half: an item that has left the list stays mounted, marked
// `out`, at the index it used to occupy, until its exit animation finishes.
// Entry is just a CSS animation on mount and needs nothing here.
// ---------------------------------------------------------------------------

export interface AnimatedEntry<T> {
  item: T;
  state: 'in' | 'out';
}

export function useAnimatedList<T extends { id: string }>(
  items: T[],
  exitMs = 180,
): AnimatedEntry<T>[] {
  const [entries, setEntries] = useState<AnimatedEntry<T>[]>(() =>
    items.map((item) => ({ item, state: 'in' as const })),
  );

  // Read in the effect below without making it a dependency: this is the last
  // list that was actually rendered, not a value the effect should re-run for.
  const rendered = useRef(entries);
  rendered.current = entries;

  useEffect(() => {
    const present = new Set(items.map((item) => item.id));
    const next: AnimatedEntry<T>[] = items.map((item) => ({ item, state: 'in' as const }));

    const departing: string[] = [];
    rendered.current.forEach((entry, index) => {
      if (present.has(entry.item.id)) return;
      departing.push(entry.item.id);
      // Back into the position it held, so the list does not reflow around it
      // while it fades.
      next.splice(Math.min(index, next.length), 0, { item: entry.item, state: 'out' });
    });

    setEntries(next);
    if (departing.length === 0) return;

    const timer = window.setTimeout(() => {
      setEntries((current) =>
        current.filter((entry) => !(entry.state === 'out' && departing.includes(entry.item.id))),
      );
    }, exitMs);

    return () => window.clearTimeout(timer);
  }, [items, exitMs]);

  return entries;
}

/**
 * A value that stops changing while it is changing quickly.
 *
 * The scroll-driven range updates on every frame of a flick. Handing that
 * straight to the panel is what makes it strobe, so the panel reads this
 * instead and the reader keeps the live value for everything else.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
