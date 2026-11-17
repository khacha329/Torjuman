import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  defaultRangeExtractor,
  useWindowVirtualizer,
  type Range as VirtualRange,
} from '@tanstack/react-virtual';
import type { Block, Entity, EntityRange, MarkRange } from '../../types';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import type { CardMarker, VisibleRange } from './cardLayout';
import { pinnedBlockIds, trackSelectionPins } from './selectionPins';
import { TYPE_CHROME, settleOn as settleOnBlock, textHeightFor } from './blockLayout';
import { BlockRow } from './BlockRow';

// Virtualized reading surface.
//
// Six volumes is ~50,000 paragraphs. Mounting them all would freeze the tablet,
// so only what is on screen (plus a margin) is in the DOM.
//
// ---------------------------------------------------------------------------
// The document scrolls, not a box inside it
//
// The reader used to scroll inside its own overflow container. Android's
// native selection handles only autoscroll the *document* — drag a handle to
// the edge of a nested scroller and nothing moves, and the handles are clipped
// wrongly against its edges — so a selection could never be dragged further
// than one screen. The list is therefore a window virtualizer: the page itself
// scrolls, the reader's header is sticky, and the side panel is a sticky
// column with its own scrolling (ReaderScreen).
//
// The margin is wide: OVERSCAN blocks either side of the screen stay mounted,
// so a finger-dragged selection several screens long never spans an unmounted
// block. Each block's text renders with content-visibility: auto, so the
// browser skips laying out and painting the ones off screen and the larger
// window stays cheap. The blocks a live selection starts and ends in are also
// pinned — kept mounted wherever the reader scrolls — as a safety net for a
// selection longer than the margin. See selectionPins.ts.
// ---------------------------------------------------------------------------

/**
 * Blocks kept mounted either side of the screen. Sized for a selection of
 * about 200 paragraphs — several screens — dragged with a finger.
 */
export const OVERSCAN = 200;
//
// Margin layout. Both gutters live in the container's padding (below), and
// BlockRow.tsx draws in them by absolute positioning, never in the flow, so
// nothing in a row narrows the Arabic column:
//
//   right margin (the START side in RTL) — the card marker
//   left margin                          — the ج/ص citation
//   just outside the text                — the subtle translated-range border

export interface BlockListHandle {
  scrollToOrder: (order: number, align?: 'start' | 'center') => void;
  scrollToIndex: (index: number, align?: 'start' | 'center') => void;
}

interface BlockListProps {
  blocks: Block[];
  pageMeta: Map<number, PageMeta>;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  /** Blocks covered by a card, marked subtly along their edge. */
  translatedBlockIds: Set<string>;
  /** One entry per block that any card starts in. */
  markers: Map<string, CardMarker>;
  /** Each block's share of the resolved entities. */
  entitiesByBlock: Map<string, EntityRange[]>;
  onEntityTap: (entity: Entity, anchor: HTMLElement) => void;
  /** Each block's share of the reading marks. */
  marksByBlock: Map<string, MarkRange[]>;
  /** Margin tap: toggle skip on this block. */
  /** Both absent in a shared view — see MarginTarget, in BlockRow.tsx. */
  onMarginTap?: (block: Block) => void;
  /** Margin long-press: open the Skip / Read / Clear / Note menu. */
  onMarginHold?: (block: Block, anchor: HTMLElement) => void;
  /** Block to flash, e.g. after tapping a card or a search result. */
  flashBlockId: string | null;
  /** Search match to mark, in display-text offsets. */
  match: { blockId: string; range: [number, number] } | null;
  onVisibleBlockChange: (block: Block | null) => void;
  /**
   * The block at the middle of the area below the header, where a centred
   * jump lands it (settleOn): the read-mark arrows count from here.
   */
  onMiddleBlockChange: (block: Block | null) => void;
  onVisibleRangeChange: (range: VisibleRange) => void;
  onMarkerClick: (marker: CardMarker, anchor: HTMLElement) => void;
  handleRef: Ref<BlockListHandle>;
  /**
   * Height of the sticky header covering the top of the page. A jump lands
   * just below it rather than under it, a centred jump in the middle of what
   * it leaves visible (settleOn, blockLayout.ts), and a block hidden behind it
   * does not count as the one being read.
   */
  topInset: number;
}

function pageIndexOf(block: Block): number {
  return Number(block.pageId.split(':p')[1] ?? 0);
}

export function BlockList({
  blocks,
  pageMeta,
  fontFamily,
  fontSize,
  lineHeight,
  translatedBlockIds,
  markers,
  entitiesByBlock,
  onEntityTap,
  marksByBlock,
  onMarginTap,
  onMarginHold,
  flashBlockId,
  match,
  onVisibleBlockChange,
  onMiddleBlockChange,
  onVisibleRangeChange,
  onMarkerClick,
  handleRef,
  topInset,
}: BlockListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * The list's distance from the top of the document — everything above it,
   * header and notices included. The window virtualizer measures every block
   * from the top of the page, so it needs this to know where block 0 begins.
   * Re-measured whenever the screen's root changes size, which is what a
   * notice or banner appearing or going, or the header wrapping onto a second
   * line, does. The root, not the body: html and body are fixed at 100% of the
   * viewport and the page overflows them, so the body never changes size and an
   * observer on it never fires.
   */
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().top + window.scrollY);
      setScrollMargin((current) => (current === next ? current : next));
    };
    // The outermost element of this screen, directly under the app's mount.
    let screenRoot: HTMLElement = element;
    while (screenRoot.parentElement && screenRoot.parentElement.id !== 'root') {
      screenRoot = screenRoot.parentElement;
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(screenRoot);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  /**
   * Entity tap.
   *
   * Handled here, at the block, rather than on the entity element itself. The
   * two interactions have to coexist: a tap opens the entity, a long-press and
   * drag selects text freely — including across and inside entities. Making the
   * entity a button would capture the pointer and break the drag. Instead the
   * click is only treated as a tap when it left no selection behind, so any
   * drag falls through to the normal selection path untouched.
   */
  const handleBlockPointer = useCallback(
    (event: React.MouseEvent<HTMLParagraphElement>) => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      const target = (event.target as HTMLElement).closest?.('[data-entity-id]');
      if (!(target instanceof HTMLElement)) return;

      const id = target.getAttribute('data-entity-id');
      const blockId = target.closest('[data-block-id]')?.getAttribute('data-block-id');
      if (!id || !blockId) return;

      const range = entitiesByBlock
        .get(blockId)
        ?.find((candidate) => candidate.entity.id === id);
      // The element is handed over, not a rect: the popover follows the anchor
      // as the reader scrolls, which needs the live element to measure.
      if (range) onEntityTap(range.entity, target);
    },
    [entitiesByBlock, onEntityTap],
  );

  // Pins are recorded the instant a selection starts — see selectionPins.ts.
  useEffect(() => trackSelectionPins(), []);

  const indexById = useMemo(
    () => new Map(blocks.map((block, index) => [block.id, index])),
    [blocks],
  );

  /** The usual range, plus the selection's endpoint blocks wherever they are. */
  const rangeExtractor = useCallback(
    (range: VirtualRange) => {
      const base = defaultRangeExtractor(range);
      const first = base[0] ?? 0;
      const last = base[base.length - 1] ?? -1;
      const extra = pinnedBlockIds()
        .map((id) => indexById.get(id))
        .filter((index): index is number => index !== undefined && (index < first || index > last));
      return extra.length === 0 ? base : [...base, ...extra].sort((a, b) => a - b);
    },
    [indexById],
  );

  /**
   * The text column's width, for estimating how a paragraph will wrap. It
   * changes with the panel, the search column, rotation and window size.
   */
  const [columnWidth, setColumnWidth] = useState(672);
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const update = () => {
      const width = Math.round(element.getBoundingClientRect().width);
      if (width > 0) setColumnWidth((current) => (current === width ? current : width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const estimateTextHeight = useCallback(
    (block: Block) => textHeightFor(block, columnWidth, fontSize, lineHeight),
    [columnWidth, fontSize, lineHeight],
  );

  const virtualizer = useWindowVirtualizer({
    count: blocks.length,
    scrollMargin,
    scrollPaddingStart: topInset,
    estimateSize: useCallback(
      (index: number) => {
        const block = blocks[index];
        return block
          ? Math.round(estimateTextHeight(block)) + TYPE_CHROME[block.type]
          : 120;
      },
      [blocks, estimateTextHeight],
    ),
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: OVERSCAN,
    rangeExtractor,
    getItemKey: useCallback((index: number) => blocks[index]?.id ?? index, [blocks]),
  });

  const items = virtualizer.getVirtualItems();

  const settleOn = useCallback(
    (index: number, align: 'start' | 'center') =>
      settleOnBlock(virtualizer, listRef, topInset, index, align),
    [topInset, virtualizer],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToOrder: (order, align = 'start') => {
        const index = blocks.findIndex((block) => block.order >= order);
        if (index >= 0) settleOn(index, align);
      },
      scrollToIndex: (index, align = 'start') => {
        settleOn(index, align);
      },
    }),
    [blocks, settleOn],
  );

  // The topmost visible block drives the ج/ص margin and the saved position;
  // the full visible range drives which cards the panel scopes to. Worked out
  // from the scroll position rather than from what is mounted: with OVERSCAN
  // blocks either side in the DOM, the first mounted block is far above the
  // screen, and a pinned block can be anywhere. A block behind the sticky
  // header is not counted as on screen — nor one showing less than a couple of
  // pixels below it, which is what a jump to the next block leaves of the one
  // before, once fractional positions are rounded.
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const viewTop = scrollOffset + topInset + 2;
  const viewBottom = scrollOffset + (virtualizer.scrollRect?.height ?? window.innerHeight);
  const onScreen = items.filter((item) => item.end > viewTop && item.start < viewBottom);
  const topIndex = onScreen[0]?.index;
  const bottomIndex = onScreen[onScreen.length - 1]?.index;
  // The block at the middle of what the header leaves visible: where a
  // centred jump puts its block. The read-mark arrows count from it, so a
  // mark they have just centred is the one they move on from (FOUND_ISSUES
  // 39); counted from the top block, it was still "next".
  const viewMiddle = (viewTop - 2 + viewBottom) / 2;
  const middleIndex = onScreen.find((item) => item.start <= viewMiddle && item.end > viewMiddle)?.index;

  useEffect(() => {
    onVisibleBlockChange(topIndex === undefined ? null : (blocks[topIndex] ?? null));
  }, [topIndex, blocks, onVisibleBlockChange]);

  useEffect(() => {
    onMiddleBlockChange(middleIndex === undefined ? null : (blocks[middleIndex] ?? null));
  }, [middleIndex, blocks, onMiddleBlockChange]);

  useEffect(() => {
    if (topIndex === undefined || bottomIndex === undefined) return;
    onVisibleRangeChange({ startIndex: topIndex, endIndex: bottomIndex });
  }, [topIndex, bottomIndex, onVisibleRangeChange]);

  // The handlers rows receive, held stable. BlockList renders on every scroll
  // frame, and so does ReaderScreen whenever the top block changes; a row
  // handed a new function each time could not skip rendering, and there are
  // OVERSCAN of them either side of the screen. These always call the latest
  // handler, so nothing is lost by keeping their identity fixed.
  const latest = useRef({ onMarginTap, onMarginHold, onMarkerClick, handleBlockPointer });
  latest.current = { onMarginTap, onMarginHold, onMarkerClick, handleBlockPointer };
  const stableMarginTap = useCallback((block: Block) => latest.current.onMarginTap?.(block), []);
  const stableMarginHold = useCallback(
    (block: Block, anchor: HTMLElement) => latest.current.onMarginHold?.(block, anchor),
    [],
  );
  const stableMarkerClick = useCallback(
    (marker: CardMarker, anchor: HTMLElement) => latest.current.onMarkerClick(marker, anchor),
    [],
  );
  const stableBlockClick = useCallback(
    (event: React.MouseEvent<HTMLParagraphElement>) => latest.current.handleBlockPointer(event),
    [],
  );

  return (
    <div className="reader-surface">
      {/* Padding lives on the outer box and the measured height on the inner
          one: absolutely-positioned virtual items resolve against the padding
          box, so combining the two would push every block under the top edge
          and let it run into the horizontal padding. */}
      {/* The max width is widened to exactly offset the wider gutters, so the
          Arabic measure is unchanged from before markers existed: 52rem − 2×5rem
          is the same 42rem of text as the previous 48rem − 2×3rem. */}
      {/* Small-screen padding is 48px so the 44px margin tap target fits
          inside it rather than overflowing the block. */}
      <div className="mx-auto w-full max-w-[52rem] px-12 py-10 sm:px-20">
        <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const block = blocks[item.index];
            if (!block) return null;

            const pageIndex = pageIndexOf(block);
            const previous = blocks[item.index - 1];
            const startsPage = !previous || pageIndexOf(previous) !== pageIndex;

            return (
              <BlockRow
                key={item.key}
                index={item.index}
                block={block}
                // Positions are measured from the top of the page; the list
                // itself starts scrollMargin further down.
                offset={item.start - scrollMargin}
                measureRef={virtualizer.measureElement}
                pageStart={startsPage ? pageMeta.get(pageIndex) : undefined}
                marker={markers.get(block.id)}
                marks={marksByBlock.get(block.id)}
                entities={entitiesByBlock.get(block.id)}
                translated={translatedBlockIds.has(block.id)}
                flash={flashBlockId === block.id}
                highlight={match?.blockId === block.id ? match.range : undefined}
                fontFamily={fontFamily}
                fontSize={fontSize}
                lineHeight={lineHeight}
                intrinsicHeight={Math.round(estimateTextHeight(block))}
                onMarginTap={onMarginTap ? stableMarginTap : undefined}
                onMarginHold={onMarginHold ? stableMarginHold : undefined}
                onMarkerClick={stableMarkerClick}
                onBlockClick={stableBlockClick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
