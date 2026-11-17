import type { Block, BlockType } from '../../types';

// How each block type is laid out, and how tall a block's text is before it
// has been: the type's classes, the margin and padding those classes put
// around the text, and the text-height estimate the virtualizer adds that to.
// One file because TYPE_CHROME must equal TYPE_CLASS's margins (CLAUDE.md
// trap 7). Moved verbatim from BlockList.tsx in restructure Phase 5 step 5f1
// (docs/refactor/plans/phase5-big-ui-files.md); `textHeightFor` is the body
// of BlockList's `estimateTextHeight`, which now calls it.

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
