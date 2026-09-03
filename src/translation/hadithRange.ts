import type { Block, GlossaryEntry } from '../types';
import { estimateTokens, PRICES } from './models';
import { renderSystem } from './prompt';

// One ḥadīth's commentary: where it ends, and what translating it would cost.
//
// ---------------------------------------------------------------------------
// The terminator is a NUMBER, not a type
//
// A commentary's structure is already in the blocks: a `hadith_matn` block,
// then the commentary on it, then the next `hadith_matn`. So the obvious rule
// is "run to the next block of type hadith_matn" — and it is wrong, in a way
// that silently truncates most of the interesting ranges.
//
// Ibn ʿUthaymīn quotes other ḥadīth inside his commentary constantly: to
// support a point, to compare a wording, to raise an objection. Those quoted
// narrations are `hadith_matn` blocks too — they are ḥadīth text, and the
// parser is right to type them that way — but they are not the next entry.
// Stopping at the first one ends the range in the middle of the discussion.
//
// What separates the two is the number. The book numbers its own ḥadīth; a
// ḥadīth quoted inside a commentary carries no number, because it is not an
// entry in this book. So the range runs to the next `hadith_matn` block that
// HAS a `hadithNumber`, and passes straight over the quoted ones.
// ---------------------------------------------------------------------------

/**
 * The blocks belonging to one ḥadīth: its matn and the commentary on it.
 *
 * Returns an empty array when the id is not a block in this book. The matn
 * itself is included — it is the thing being commented on, and a translation of
 * the discussion without the text it discusses is not usable.
 */
export function commentaryRange(blocks: Block[], matnBlockId: string): Block[] {
  const from = blocks.findIndex((block) => block.id === matnBlockId);
  if (from === -1) return [];

  const range: Block[] = [blocks[from]];

  for (let index = from + 1; index < blocks.length; index++) {
    const block = blocks[index];
    // The next numbered ḥadīth. An unnumbered matn is a quotation inside this
    // commentary and belongs to this range.
    if (block.type === 'hadith_matn' && block.hadithNumber) break;
    range.push(block);
  }

  return range;
}

/** Whether a block can start a batch — i.e. it is a ḥadīth's own matn. */
export function isBatchable(block: Block): boolean {
  return block.type === 'hadith_matn';
}

export interface BatchEstimate {
  blocks: number;
  /** Characters of Arabic to be translated. */
  characters: number;
  inputTokens: number;
  outputTokens: number;
  /** Null when the model has no published price here — shown as unknown. */
  costUsd: number | null;
}

/**
 * How much output a translation produces, relative to its input.
 *
 * Every segment carries the Arabic AND its English AND a JSON envelope, so
 * output exceeds input rather than approximating it. Two is the expectation;
 * `maxTokensFor` separately allows four as a ceiling, which is a different
 * question — what to permit, not what to expect. Using the ceiling here would
 * quote the reader roughly double what a run actually costs, and an estimate
 * that is always wrong in the same direction stops being read.
 */
const OUTPUT_RATIO = 2;

/**
 * What a batch would cost, before it is started.
 *
 * The system prompt and glossary are charged PER BLOCK, because each block is
 * its own request: that is the real cost of translating block-by-block, and
 * hiding it would understate a long run substantially. It is also the number
 * that makes the trade visible — a big glossary is not free when it is sent
 * forty times.
 */
export function estimateBatch(
  range: Block[],
  options: { model: string; systemPrompt: string; glossary: GlossaryEntry[] },
): BatchEstimate {
  const characters = range.reduce((total, block) => total + block.text.length, 0);

  // Rendered once with an empty target to price the fixed part of each call
  // exactly, rather than assuming a number for it.
  const overhead = estimateTokens(
    renderSystem({
      systemPrompt: options.systemPrompt,
      glossary: options.glossary,
      targetText: '',
      contextBefore: '',
      contextAfter: '',
      blockTypes: [],
      model: options.model,
    } as never),
  );

  const content = range.reduce((total, block) => total + estimateTokens(block.text), 0);
  const inputTokens = content + overhead * range.length;
  const outputTokens = Math.ceil(content * OUTPUT_RATIO);

  const price = PRICES[options.model];
  const costUsd = price
    ? (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000
    : null;

  return { blocks: range.length, characters, inputTokens, outputTokens, costUsd };
}

/** Money, at the precision the number actually carries. */
export function formatCost(costUsd: number | null): string {
  if (costUsd === null) return 'unknown for this model';
  if (costUsd < 0.01) return 'under $0.01';
  return `about $${costUsd.toFixed(2)}`;
}
