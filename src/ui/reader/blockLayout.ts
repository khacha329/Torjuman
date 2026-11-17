import type { RefObject } from 'react';
import type { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Block, BlockType } from '../../types';

// How each block type is laid out, how tall a block's text is before it has
// been laid out, and how a jump makes sure it landed: the type's classes, the
// margin and padding those classes put around the text, the text-height
// estimate the virtualizer adds that to, and `settleOn`. One file because
// TYPE_CHROME must equal TYPE_CLASS's margins (CLAUDE.md trap 7). Moved
// verbatim from BlockList.tsx in restructure Phase 5 steps 5f1 and 5f2
// (docs/refactor/plans/phase5-big-ui-files.md); `textHeightFor` and
// `settleOn` are the bodies of BlockList's `estimateTextHeight` and
// `settleOn`, which now call them.

export const TYPE_CLASS: Record<BlockType, string> = {
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
export const TYPE_CHROME: Record<BlockType, number> = {
  chapter_title: 80, // my-10
  quran: 32, // my-4
  hadith_matn: 64, // my-5 + py-3
  takhrij: 16, // my-2
  sharh: 32, // my-4
  poetry: 48, // my-6
  body: 32, // my-4
};

/**
 * The text's height before it has been laid out. An Arabic character in
 * these faces averages about 0.43em, which makes the 42rem desktop column
 * the 60 characters a line this used to assume — but a portrait tablet's
 * column, or one narrowed by the search panel, wraps far sooner, and an
 * estimate that ignores that puts every jump in the wrong place.
 */
export function textHeightFor(
  block: Block,
  columnWidth: number,
  fontSize: number,
  lineHeight: number,
): number {
  const charsPerLine = Math.max(8, columnWidth / (fontSize * 0.43));
  const lines = Math.max(1, Math.ceil(block.text.length / charsPerLine));
  return lines * fontSize * lineHeight;
}

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
 *
 * `start` puts the block just below the header: the virtualizer's own
 * `scrollToIndex`, whose `scrollPaddingStart` is the header's height.
 * `center` puts the block's middle at the middle of what the header leaves
 * visible, `topInset + (innerHeight - topInset) / 2`, and is computed here;
 * a block taller than that area lands as `start` does, its beginning just
 * below the header.
 * TanStack's own centring subtracts the padding and then centres in the
 * whole window, which put the middle at `innerHeight / 2 + topInset`, half a
 * header low; and this check, which tested against `innerHeight / 2`, found
 * every centred landing a header's height off and repeated it until the
 * eighth pass (FOUND_ISSUES 40). It goes through `scrollToOffset`, because
 * `scrollToIndex` would leave TanStack re-aiming at its own centre on the
 * next frames.
 */
export function settleOn(
  virtualizer: ReturnType<typeof useWindowVirtualizer>,
  listRef: RefObject<HTMLDivElement | null>,
  topInset: number,
  index: number,
  align: 'start' | 'center',
): void {
  let attempts = 0;
  const visible = () => window.innerHeight - topInset;
  // Where a block's top should land: centred in what the header leaves
  // visible, or — for a block taller than that — just below the header, so
  // its beginning is not hidden under it (where TanStack's centring had put
  // such a block too).
  const landingTop = (height: number) =>
    align === 'start' || height >= visible() ? topInset : topInset + (visible() - height) / 2;
  // A centred jump is aimed from the heights the virtualizer holds the first
  // time; once the block is on the page it is corrected from where it
  // actually is, since a held height can still be an estimate for a block
  // that has landed (a 601 px block held at its estimate came back to the
  // same wrong place on every pass).
  const jump = (landed: { top: number; height: number } | null) => {
    if (align === 'start') {
      virtualizer.scrollToIndex(index, { align });
      return;
    }
    if (landed) {
      virtualizer.scrollToOffset(window.scrollY + landed.top - landingTop(landed.height));
      return;
    }
    const item = virtualizer.measurementsCache[index];
    if (!item) {
      virtualizer.scrollToIndex(index, { align });
      return;
    }
    // The item's start is a page offset (the list's scrollMargin included),
    // as the virtualizer's own alignment uses it.
    virtualizer.scrollToOffset(item.start - landingTop(item.size));
  };
  // A centred landing that is on target is looked at once more, two frames
  // later, before it counts: the block may still be drawn at its
  // content-visibility placeholder, the estimate, and grow to its real height
  // a frame after (a search result in the column the search panel narrows
  // was held at 196 px and laid out at 601), which moves its middle. Only a
  // block that moved is aimed again.
  const check = (confirming: boolean) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        attempts++;
        const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
        if (!element || attempts >= 8) return;
        const rect = element.getBoundingClientRect();
        const off = rect.top - landingTop(rect.height);
        if (Math.abs(off) > 4) attempt({ top: rect.top, height: rect.height });
        else if (align === 'center' && !confirming) check(true);
      }),
    );
  const attempt = (landed: { top: number; height: number } | null) => {
    jump(landed);
    check(false);
  };
  attempt(null);
}
