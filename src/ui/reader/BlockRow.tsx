import {
  memo,
  useRef,
} from 'react';
import type { Block, EntityRange, MarkRange } from '../../types';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import { toArabicNumerals } from '../../lib/arabic';
import { isDivider } from '../../shamela/structure';
import { BlockText } from './BlockText';
import type { CardMarker } from './cardLayout';
import { TYPE_CLASS } from './blockLayout';

// One block of the reader: its paragraph and the margin furniture around it,
// which BlockList renders for each virtual item. `MarginTarget` (the skip and
// read tap target) and `CardMarkerDot` (the card marker) are its own parts.
// Moved verbatim from BlockList.tsx in restructure Phase 5 step 5f3
// (docs/refactor/plans/phase5-big-ui-files.md).

/**
 * One paragraph and its margin furniture.
 *
 * Memoized: BlockList renders on every scroll frame, and with OVERSCAN blocks
 * mounted either side of the screen, rebuilding every row each time is what
 * made scrolling slow. A row's props only change when something about that
 * row does — its position, its marks, its cards — so the rest skip rendering.
 */
export const BlockRow = memo(function BlockRow({
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
