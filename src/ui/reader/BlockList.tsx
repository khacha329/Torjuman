import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Block, BlockType, Entity, EntityRange, MarkRange } from '../../types';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import { toArabicNumerals } from '../../lib/arabic';
import { isDivider } from '../../shamela/structure';
import { BlockText } from './BlockText';
import type { CardMarker, VisibleRange } from './cardLayout';

// Virtualized reading surface.
//
// Six volumes is ~50,000 paragraphs. Mounting them all would freeze the tablet,
// so only what is on screen (plus a margin) is in the DOM. The overscan is
// deliberately generous: a selection can only span mounted blocks, and a reader
// selecting "this paragraph and the next" must not hit an unmounted node.
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
  onMarginTap: (block: Block) => void;
  /** Margin long-press: open the Skip / Read / Clear / Note menu. */
  onMarginHold: (block: Block, anchor: HTMLElement) => void;
  /** Block to flash, e.g. after tapping a card or a search result. */
  flashBlockId: string | null;
  /** Search match to mark, in display-text offsets. */
  match: { blockId: string; range: [number, number] } | null;
  onVisibleBlockChange: (block: Block | null) => void;
  onVisibleRangeChange: (range: VisibleRange) => void;
  onMarkerClick: (marker: CardMarker, anchor: HTMLElement) => void;
  handleRef: Ref<BlockListHandle>;
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
}: BlockListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: useCallback(
      (index: number) => {
        const block = blocks[index];
        if (!block) return 120;
        const charsPerLine = 60;
        const lines = Math.max(1, Math.ceil(block.text.length / charsPerLine));
        return lines * fontSize * lineHeight + 28;
      },
      [blocks, fontSize, lineHeight],
    ),
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 12,
    getItemKey: useCallback((index: number) => blocks[index]?.id ?? index, [blocks]),
  });

  const items = virtualizer.getVirtualItems();

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToOrder: (order, align = 'start') => {
        const index = blocks.findIndex((block) => block.order >= order);
        if (index >= 0) virtualizer.scrollToIndex(index, { align });
      },
      scrollToIndex: (index, align = 'start') => {
        virtualizer.scrollToIndex(index, { align });
      },
    }),
    [blocks, virtualizer],
  );

  // The topmost visible block drives the ج/ص margin and the saved position;
  // the full visible range drives which cards the panel scopes to.
  const topIndex = items[0]?.index;
  const bottomIndex = items[items.length - 1]?.index;

  useEffect(() => {
    onVisibleBlockChange(topIndex === undefined ? null : (blocks[topIndex] ?? null));
  }, [topIndex, blocks, onVisibleBlockChange]);

  useEffect(() => {
    if (topIndex === undefined || bottomIndex === undefined) return;
    onVisibleRangeChange({ startIndex: topIndex, endIndex: bottomIndex });
  }, [topIndex, bottomIndex, onVisibleRangeChange]);

  return (
    <div ref={scrollRef} className="reader-surface h-full overflow-auto">
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
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const block = blocks[item.index];
            if (!block) return null;

            const pageIndex = pageIndexOf(block);
            const meta = pageMeta.get(pageIndex);
            const previous = blocks[item.index - 1];
            const startsPage = !previous || pageIndexOf(previous) !== pageIndex;
            const marker = markers.get(block.id);

            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 right-0 left-0"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <div className="relative">
                  {/* Margin tap target for block-scope marking, in the right
                      margin — the start side in RTL, and where the hand rests.
                      This is the high-frequency gesture, so it takes no text
                      selection and is a full 44px wide. It sits below the card
                      marker in the stack so the dot stays tappable. */}
                  <MarginTarget
                    block={block}
                    marks={marksByBlock.get(block.id)}
                    onTap={onMarginTap}
                    onHold={onMarginHold}
                  />
                  {/* ج/ص citation, in the left margin and outside the
                      selectable block so it can never be counted into a
                      selection offset. */}
                  {startsPage && meta && (
                    <div
                      className="pointer-events-none absolute top-1 -left-16 hidden w-12 text-right text-[11px] leading-tight text-muted select-none sm:block"
                      aria-hidden
                    >
                      {meta.volume !== null && <div>ج{toArabicNumerals(meta.volume)}</div>}
                      {meta.printPage !== null && (
                        <div className="text-muted/70">ص{toArabicNumerals(meta.printPage)}</div>
                      )}
                    </div>
                  )}

                  {/* Subtle indication that this block is inside a translated
                      range. Unchanged from before. */}
                  {translatedBlockIds.has(block.id) && (
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
                    <CardMarkerDot
                      marker={marker}
                      onOpen={(element) => onMarkerClick(marker, element)}
                    />
                  )}

                  <p
                    data-block-id={block.id}
                    dir="rtl"
                    lang="ar"
                    onClick={handleBlockPointer}
                    className={
                      `arabic transition-colors ${TYPE_CLASS[block.type]} ` +
                      (isDivider(block.text) ? 'text-center text-muted tracking-[0.5em] ' : '') +
                      (flashBlockId === block.id ? 'bg-amber-100/70 ' : '')
                    }
                    style={{
                      fontFamily: `'${fontFamily}', 'Amiri', serif`,
                      fontSize,
                      ['--reader-line-height' as string]: String(lineHeight),
                    }}
                  >
                    <BlockText
                      block={block}
                      entities={entitiesByBlock.get(block.id)}
                      marks={marksByBlock.get(block.id)}
                      highlight={match?.blockId === block.id ? match.range : undefined}
                    />
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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
  onTap: (block: Block) => void;
  onHold: (block: Block, anchor: HTMLElement) => void;
}) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const skip = marks?.find((range) => range.mark.kind === 'skip');
  const read = marks?.find((range) => range.mark.kind === 'read');

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={skip ? 'Marked skip — tap to clear' : 'Tap to mark this passage skip'}
      className="absolute top-0 -right-11 bottom-0 z-0 w-11 cursor-pointer select-none"
      onPointerDown={(event) => {
        held.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
        const element = event.currentTarget;
        timer.current = window.setTimeout(() => {
          held.current = true;
          onHold(block, element);
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
        if (wasTap) onTap(block);
      }}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onTap(block);
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
