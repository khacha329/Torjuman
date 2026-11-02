import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import type { PanelPosition } from '../types';
import { RAIL_WIDTH } from './reader/SelectionRail';

// Whether the card panel sits beside the text or comes up as a bottom sheet.
//
// This used to switch on '(min-width: 1024px)' alone, in two places with their
// own copies of the query. A landscape tablet narrower than that in CSS pixels
// got the bottom sheet even with plenty of room beside the text, while an older
// tablet with a wider viewport got the side panel. The question is not what
// kind of device this is but whether both panes fit, so that is what decides.

/** The narrowest Arabic column worth reading beside a panel, in CSS pixels. */
export const MIN_READING_WIDTH = 420;
/** The draggable divider between the text and the panel. */
export const DIVIDER_WIDTH = 6;
/** The panel never renders narrower than this, nor is it dragged narrower. */
export const PANEL_MIN_WIDTH = 300;
/** Nor wider than this, on any screen. */
export const PANEL_MAX_WIDTH = 760;
/** And never more than this share of the viewport, so the text keeps the larger part. */
export const PANEL_MAX_SHARE = 0.45;
/** At or above this width, side by side in any orientation: desktop is unchanged. */
export const DESKTOP_MIN_WIDTH = 1024;

/**
 * The narrowest landscape viewport with room for both panes: the rail, a
 * readable column, the divider and the smallest panel. Derived, not chosen, so
 * changing any of those moves it with them.
 */
export const SIDE_BY_SIDE_MIN_WIDTH =
  RAIL_WIDTH + MIN_READING_WIDTH + DIVIDER_WIDTH + PANEL_MIN_WIDTH;

/**
 * One media query, so the browser reports the switch as it happens: rotating
 * a tablet or resizing a window changes the layout without a reload.
 */
export const SIDE_BY_SIDE_QUERY =
  `(min-width: ${DESKTOP_MIN_WIDTH}px), ` +
  `(orientation: landscape) and (min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`;

export type LayoutMode = 'beside' | 'sheet';

/** The layout for a panel-position setting, given whether both panes fit. */
export function resolveLayoutMode(position: PanelPosition, fits: boolean): LayoutMode {
  if (position === 'beside') return 'beside';
  if (position === 'sheet') return 'sheet';
  return fits ? 'beside' : 'sheet';
}

/**
 * The width the panel is drawn at, from the width saved for it.
 *
 * The saved width can come from a desktop, where 760px is reasonable; on a
 * 900px tablet it would leave the Arabic a sliver. So it is limited here, at
 * render time, to the smaller of PANEL_MAX_SHARE of the viewport and whatever
 * leaves the text its readable column — and never below PANEL_MIN_WIDTH. The
 * saved setting itself is left alone, so the desktop keeps its width.
 */
export function clampPanelWidth(saved: number, viewportWidth: number): number {
  const leavesTextReadable = viewportWidth - RAIL_WIDTH - DIVIDER_WIDTH - MIN_READING_WIDTH;
  const ceiling = Math.min(
    PANEL_MAX_WIDTH,
    Math.floor(viewportWidth * PANEL_MAX_SHARE),
    leavesTextReadable,
  );
  return Math.max(PANEL_MIN_WIDTH, Math.min(saved, ceiling));
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Beside the text or a bottom sheet, honouring the per-device override. */
export function useLayoutMode(): LayoutMode {
  const { settings } = useApp();
  const fits = useMediaQuery(SIDE_BY_SIDE_QUERY);
  return resolveLayoutMode(settings.panelPosition ?? 'auto', fits);
}

/** The viewport width, kept current through resizes and rotations. */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}

/**
 * One line for Copy diagnostics, so a layout bug can be read off a paste:
 * `viewport 900x600 @ dpr 2, landscape, layout beside (auto)`.
 */
export function describeLayout(position: PanelPosition): string {
  const fits = window.matchMedia(SIDE_BY_SIDE_QUERY).matches;
  const orientation = window.matchMedia('(orientation: landscape)').matches
    ? 'landscape'
    : 'portrait';
  const mode = resolveLayoutMode(position, fits);
  const why = position === 'auto' ? 'auto' : `set to ${position}`;
  return (
    `viewport ${window.innerWidth}x${window.innerHeight} @ dpr ${window.devicePixelRatio}, ` +
    `${orientation}, layout ${mode} (${why})`
  );
}
