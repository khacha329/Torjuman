import {
  memo,
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
import type { Block, BlockType, Entity, EntityRange, MarkRange } from '../../types';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import { toArabicNumerals } from '../../lib/arabic';
import { isDivider } from '../../shamela/structure';
import { BlockText } from './BlockText';
import type { CardMarker, VisibleRange } from './cardLayout';
import { pinnedBlockIds, trackSelectionPins } from './selectionPins';

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
// Margin layout. Both gutters live in the container's padding via absolute
// positioning, never in the flow, so nothing here narrows the Arabic column:
//
//   right margin (the START side in RTL) — the card marker
//   left margin                          — the ج/ص citation
//   just outside the text                — the subtle translated-range border

const TYPE_CLASS: Record<BlockType, string> = {
  chapter_title: 'text-center font-bold my-10 text-[1.35em] leading-relaxed',
  quran: 'text-verse my-4',
  hadith_matn:
    'my-5 rounded-md border-r-4 border-accent/50 bg-matn px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]',
  takhrij: 'my-2 text-[0.82em] text-muted',
  sharh: 'my-4',
  poetry: 'my-6 text-center whitespace-pre-line',
  body: 'my-4',
};

/**
 * Each type's vertical margin and padding, in px — exactly what TYPE_CLASS
 * puts around the text (Tailwind spacing is rem-based, 1rem = 16px). An item's
 * estimated height is its estimated text plus this, so a block that has never
 * been on screen — mounted, but skipped by content-visibility — measures
 * exactly its estimate. Any difference is a resize for every one of the
 * hundreds of mounted blocks, each nudging the scroll position as it lands.
 * Keep in step with TYPE_CLASS.
 */
const TYPE_CHROME: Record<BlockType, number> = {
  chapter_title: 80, // my-10
  quran: 32, // my-4
  hadith_matn: 64, // my-5 + py-3
  takhrij: 16, // my-2
  sharh: 32, // my-4
  poetry: 48, // my-6
  body: 32, // my-4
};

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
  /** Both absent in a shared view — see MarginTarget. */
  onMarginTap?: (block: Block) => void;
  /** Margin long-press: open the Skip / Read / Clear / Note menu. */
  onMarginHold?: (block: Block, anchor: HTMLElement) => void;
  /** Block to flash, e.g. after tapping a card or a search result. */
  flashBlockId: string | null;
  /** Search match to mark, in display-text offsets. */
  match: { blockId: string; range: [number, number] } | null;
  onVisibleBlockChange: (block: Block | null) => void;
  onVisibleRangeChange: (range: VisibleRange) => void;
  onMarkerClick: (marker: CardMarker, anchor: HTMLElement) => void;
  handleRef: Ref<BlockListHandle>;
  /**
   * Height of the sticky header covering the top of the page. A jump lands
   * just below it rather than under it, and a block hidden behind it does not
   * count as the one being read.
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

  /**
   * The text's height before it has been laid out. An Arabic character in
   * these faces averages about 0.43em, which makes the 42rem desktop column
   * the 60 characters a line this used to assume — but a portrait tablet's
   * column, or one narrowed by the search panel, wraps far sooner, and an
   * estimate that ignores that puts every jump in the wrong place.
   */
  const estimateTextHeight = useCallback(
    (block: Block) => {
      const charsPerLine = Math.max(8, columnWidth / (fontSize * 0.43));
      const lines = Math.max(1, Math.ceil(block.text.length / charsPerLine));
      return lines * fontSize * lineHeight;
    },
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

  /**
   * Scroll to a block and make sure it got there.
   *
   * A jump is computed from the heights the virtualizer knows, and most of the
   * mounted blocks are off screen, skipped by content-visibility, holding an
   * estimate or a height remembered from an earlier width. Landing draws the
   * paragraphs around the target at their real size, which moves it. So the
   * target is checked where it actually ended up, a couple of frames later,
   * and the jump repeated until it stays put — each pass lays out more real
   * text around it, so it converges within a few.
   */
  const settleOn = useCallback(
    (index: number, align: 'start' | 'center') => {
      let attempts = 0;
      const attempt = () => {
        virtualizer.scrollToIndex(index, { align });
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            attempts++;
            const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
            if (!element || attempts >= 8) return;
            const rect = element.getBoundingClientRect();
            const off =
              align === 'start'
                ? rect.top - topInset
                : rect.top + rect.height / 2 - window.innerHeight / 2;
            if (Math.abs(off) > 4) attempt();
          }),
        );
      };
      attempt();
    },
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

  useEffect(() => {
    onVisibleBlockChange(topIndex === undefined ? null : (blocks[topIndex] ?? null));
  }, [topIndex, blocks, onVisibleBlockChange]);

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

/**
 * One paragraph and its margin furniture.
 *
 * Memoized: BlockList renders on every scroll frame, and with OVERSCAN blocks
 * mounted either side of the screen, rebuilding every row each time is what
 * made scrolling slow. A row's props only change when something about that
 * row does — its position, its marks, its cards — so the rest skip rendering.
 */
const BlockRow = memo(function BlockRow({
  index,
  block,
  offset,
  measureRef,
  pageStart,
  marker,
  marks,
  entities,
  translated,
  flash,
  highlight,
  fontFamily,
  fontSize,
  lineHeight,
  intrinsicHeight,
  onMarginTap,
  onMarginHold,
  onMarkerClick,
  onBlockClick,
}: {
  index: number;
  block: Block;
  offset: number;
  measureRef: (element: HTMLElement | null) => void;
  /** The page this block opens, if it opens one: its ج/ص goes in the margin. */
  pageStart: PageMeta | undefined;
  marker: CardMarker | undefined;
  marks: MarkRange[] | undefined;
  entities: EntityRange[] | undefined;
  translated: boolean;
  flash: boolean;
  highlight: [number, number] | undefined;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  /** Estimated text height, used until the paragraph is first laid out. */
  intrinsicHeight: number;
  onMarginTap?: (block: Block) => void;
  onMarginHold?: (block: Block, anchor: HTMLElement) => void;
  onMarkerClick: (marker: CardMarker, anchor: HTMLElement) => void;
  onBlockClick: (event: React.MouseEvent<HTMLParagraphElement>) => void;
}) {
  return (
    <div
      data-index={index}
      ref={measureRef}
      className="absolute top-0 right-0 left-0"
      style={{ transform: `translateY(${offset}px)` }}
    >
      <div className="relative">
        {/* Margin tap target for block-scope marking, in the right
            margin — the start side in RTL, and where the hand rests.
            This is the high-frequency gesture, so it takes no text
            selection and is a full 44px wide. It sits below the card
            marker in the stack so the dot stays tappable. */}
        <MarginTarget block={block} marks={marks} onTap={onMarginTap} onHold={onMarginHold} />
        {/* ج/ص citation, in the left margin and outside the
            selectable block so it can never be counted into a
            selection offset. */}
        {pageStart && (
          <div
            className="pointer-events-none absolute top-1 -left-16 hidden w-12 text-right text-[11px] leading-tight text-muted select-none sm:block"
            aria-hidden
          >
            {pageStart.volume !== null && <div>ج{toArabicNumerals(pageStart.volume)}</div>}
            {pageStart.printPage !== null && (
              <div className="text-muted/70">ص{toArabicNumerals(pageStart.printPage)}</div>
            )}
          </div>
        )}

        {/* Subtle indication that this block is inside a translated
            range. Unchanged from before. */}
        {translated && (
          <span
            className="pointer-events-none absolute -left-3 top-2 bottom-2 w-0.5 rounded bg-accent/40 select-none"
            aria-hidden
          />
        )}

        {/* Card marker, in the right margin — the start side in RTL.
            Deliberately quiet: it sits beside text being read
            continuously, and anything high-contrast becomes a
            distraction within minutes. */}
        {marker && (
          <CardMarkerDot marker={marker} onOpen={(element) => onMarkerClick(marker, element)} />
        )}

        <p
          data-block-id={block.id}
          dir="rtl"
          lang="ar"
          onClick={onBlockClick}
          className={
            `arabic transition-colors ${TYPE_CLASS[block.type]} ` +
            (isDivider(block.text) ? 'text-center text-muted tracking-[0.5em] ' : '') +
            (flash ? 'bg-amber-100/70 ' : '')
          }
          style={{
            fontFamily: `'${fontFamily}', 'Amiri', serif`,
            fontSize,
            ['--reader-line-height' as string]: String(lineHeight),
            // Off screen, the browser skips laying out and painting
            // this text, which is what makes OVERSCAN affordable. It
            // is on the paragraph rather than the item, because it
            // brings paint containment, and the item's margin
            // furniture (ج/ص, card dot, tap target) sits outside its
            // box and would be clipped. Until first laid out the
            // paragraph takes its estimated height; `auto` then
            // remembers the real one, so measureElement sees the
            // estimate only for text that has never been on screen —
            // as it did when such text was simply not mounted.
            contentVisibility: 'auto',
            containIntrinsicSize: `auto ${intrinsicHeight}px`,
            // Harakāt above the first line and descenders below the
            // last can ink past the box; paint containment would
            // otherwise shave them off.
            overflowClipMargin: '0.75em',
          }}
        >
          <BlockText block={block} entities={entities} marks={marks} highlight={highlight} />
        </p>
      </div>
    </div>
  );
});

/**
 * The block-scope marking target in the right margin.
 *
 * A tap toggles skip; a long press opens the fuller menu. The distinction has
 * to be made by hand because a plain click handler cannot tell a tap from the
 * start of a scroll: the timer is cancelled if the pointer moves more than a
 * few pixels, so dragging to scroll through the margin never marks anything.
 */
function MarginTarget({
  block,
  marks,
  onTap,
  onHold,
}: {
  block: Block;
  marks: MarkRange[] | undefined;
  /**
   * Absent in a shared view.
   *
   * The band still *renders* the author's marks — they are the preparation
   * being handed over and the main reason to look at the margin at all — but
   * it stops being a control. Optional rather than a no-op handler so the
   * element also drops out of the tab order and stops announcing itself as a
   * button, which a no-op would leave in place and lying.
   */
  onTap?: (block: Block) => void;
  onHold?: (block: Block, anchor: HTMLElement) => void;
}) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const interactive = onTap !== undefined || onHold !== undefined;

  const skip = marks?.find((range) => range.mark.kind === 'skip');
  const read = marks?.find((range) => range.mark.kind === 'read');

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={
        !interactive
          ? undefined
          : skip
            ? 'Marked skip — tap to clear'
            : 'Tap to mark this passage skip'
      }
      className={`absolute top-0 -right-11 bottom-0 z-0 w-11 select-none ${
        interactive ? 'cursor-pointer' : 'pointer-events-none'
      }`}
      onPointerDown={(event) => {
        if (!interactive) return;
        held.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
        const element = event.currentTarget;
        timer.current = window.setTimeout(() => {
          held.current = true;
          onHold?.(block, element);
        }, 480);
      }}
      onPointerMove={(event) => {
        if (!origin.current) return;
        const moved =
          Math.abs(event.clientX - origin.current.x) +
          Math.abs(event.clientY - origin.current.y);
        // A scroll gesture, not a press.
        if (moved > 8) clear();
      }}
      onPointerUp={() => {
        const wasTap = timer.current !== null && !held.current;
        clear();
        if (wasTap) onTap?.(block);
      }}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onTap?.(block);
        }
      }}
    >
      {/* The band is the primary signal that a block is skipped, which lets the
          text highlight itself stay faint enough to read through. */}
      {skip && (
        <span
          className="pointer-events-none absolute top-1 bottom-1 right-2 w-1 rounded-full bg-[#d9a441]"
          aria-hidden
        />
      )}
      {read && !skip && (
        <span
          className="pointer-events-none absolute top-1 bottom-1 right-2 w-1 rounded-full bg-accent/70"
          aria-hidden
        />
      )}
    </div>
  );
}

/**
 * The margin marker.
 *
 * Several cards starting in the same block share one marker with a count —
 * stacking one per card would crowd the margin and eventually squeeze the
 * Arabic column.
 */
function CardMarkerDot({
  marker,
  onOpen,
}: {
  marker: CardMarker;
  onOpen: (anchor: HTMLElement) => void;
}) {
  const count = marker.cards.length;

  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onOpen(event.currentTarget);
      }}
      // Not part of the text flow, and not selectable, so dragging a selection
      // across the paragraph never picks it up.
      className="absolute top-2 -right-6 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] leading-none text-accent/70 transition select-none sm:-right-7 hover:bg-accent/15 hover:text-accent"
      title={count === 1 ? 'Open this translation' : `${count} translations start here`}
      aria-label={count === 1 ? 'Open translation' : `Open ${count} translations`}
    >
      {count > 1 ? (
        <span className="rounded-full bg-accent/15 px-1 font-medium">{count}</span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-accent/50" aria-hidden />
      )}
    </button>
  );
}
