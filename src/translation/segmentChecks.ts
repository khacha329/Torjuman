import type { SegmentType } from '../types';
import { letterFold } from '../lib/arabic';
import { stripApparatus } from '../retrieval/sharh';

// Two checks on a model's segments, each ending in a note on the card rather
// than a silent repair.
//
// Both come from one real Gemini Flash-Lite card (see the comment at the top
// of sourceUnits.ts). Its piece numbers drifted one piece late, and the app
// clamped the overflow onto the last piece without a word, so English sat
// beside the wrong Arabic and nothing on the card said so. And its ḥadīth
// segment carried the commentary after the quotation, which is why the
// verified English was not found. Cutting the pieces better makes both rarer;
// these say so when they happen anyway, so a card that needs retranslating
// can be told from one that does not.

/**
 * What is wrong with one segment's piece numbers, given where the segment
 * before it ended, or null when they follow on. Each segment should start at
 * the piece after the previous one's last, inside 1..pieceCount, in order.
 * `previousTo` is the model's own `to` for the segment before (0 for the
 * first), not the clamped one: after one slip, a model that carries on from
 * its own numbering is flagged once, not on every later segment.
 */
export interface PieceSequenceProblem {
  detail: string;
  /**
   * The numbers ran past the last piece. On the owner's card this was the
   * only visible sign: an extra segment early on kept the numbering in order
   * but one piece late, and only the overflow at the end showed it.
   */
  overran: boolean;
}

export function pieceSequenceProblem(
  previousTo: number,
  from: unknown,
  to: unknown,
  pieceCount: number,
): PieceSequenceProblem | null {
  const problem = (detail: string, overran = false) => ({ detail, overran });
  if (typeof from !== 'number' || typeof to !== 'number') return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const outside = [from, to].find((n) => n < 1 || n > pieceCount);
  if (outside !== undefined) {
    return problem(
      `it names piece ${outside}, and the passage has pieces 1–${pieceCount}`,
      outside > pieceCount,
    );
  }
  if (from > to) return problem(`it names pieces ${from} to ${to}, backwards`);
  if (from <= previousTo) {
    return problem(`it starts at piece ${from}, which the segment before already covered`);
  }
  if (from > previousTo + 1) {
    return problem(
      from === previousTo + 2
        ? `piece ${previousTo + 1} is in no segment`
        : `pieces ${previousTo + 1}–${from - 1} are in no segment`,
    );
  }
  return null;
}

/** The note a segment gets for a sequence problem. */
export function pieceSequenceNote(problem: PieceSequenceProblem): string {
  return problem.overran
    ? `The model's piece numbers ran past the end of the passage (${problem.detail}), ` +
        'so this English, and possibly the English of the segments before it, may sit ' +
        'beside the wrong Arabic.'
    : `The model's piece numbers are out of order here (${problem.detail}), ` +
        'so this English may sit beside the wrong Arabic.';
}

/** Marks a quotation ends with. Plain " is counted only when the text has two. */
const QUOTATION_CLOSERS = '﴾»”)';

/**
 * For a verse or ḥadīth segment: the words after its quotation that are not
 * part of it, or null when there are none or the quotation cannot be found.
 *
 * Only what follows the closing mark is looked at. A lead-in such as «قال:»
 * before a matn is how a ḥadīth is normally quoted; commentary after the
 * closing mark is not. A takhrīj there (رواه مسلم، متفق عليه) and a citation
 * in brackets are part of the quotation's apparatus and are allowed. A
 * segment with no quotation marks at all — a matn block printed without them —
 * is not checked, since nothing in it says where the quotation ends.
 */
export function quotationOverrun(type: SegmentType, arabic: string): string | null {
  if (type !== 'hadith' && type !== 'quran') return null;
  let last = -1;
  for (const mark of QUOTATION_CLOSERS) last = Math.max(last, arabic.lastIndexOf(mark));
  if ((arabic.match(/"/g) ?? []).length >= 2) last = Math.max(last, arabic.lastIndexOf('"'));
  if (last === -1) return null;
  const after = arabic.slice(last + 1).replace(/\[[^\]]*\]/g, ' ');
  const rest = stripApparatus(after);
  // Folded only to test for words; quoted as the book spells them.
  if (letterFold(rest) === '') return null;
  return rest
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');
}

/** The note a segment gets when its quotation runs on into the commentary. */
export function quotationOverrunNote(type: SegmentType, words: string): string {
  const what = type === 'quran' ? 'verse' : 'ḥadīth';
  return (
    `This ${what} segment also holds words after the quotation («${words}…»), which ` +
    'belong to the commentary. Its English may be incomplete, and a verified translation may not be found for it.'
  );
}
