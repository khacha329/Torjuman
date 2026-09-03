import { letterFold } from '../lib/arabic';
import type { TranslatedSegment } from '../types';

// Did the model actually translate the whole passage?
//
// ---------------------------------------------------------------------------
// The failure this exists to catch
//
// Truncation — the model running out of output budget — is already handled:
// both providers see `stop_reason: max_tokens`, retry once with double the
// budget, and then raise a `truncated` error the reader can see. That path is
// loud and it works.
//
// The quiet failure is different and was unhandled. On a long selection the
// model can return a perfectly well-formed answer that simply stops early —
// eight segments for a passage that needed twenty, `stop_reason: end_turn`, no
// error anywhere. `coerceSegments` accepts whatever comes back, nothing
// compares it to the source, and the card renders a translation that looks
// complete and silently omits half the passage.
//
// For a tool used to prepare lessons that is the worst possible shape of bug:
// no symptom, and the missing half is invisible precisely because it is
// missing. So the returned Arabic is measured against the Arabic that was sent.
//
// ---------------------------------------------------------------------------
// Two measures, because they fail differently
//
//   ratio       how much of the passage came back at all. Catches a model that
//               summarised, skipped, or dropped segments in the middle.
//   reachedEnd  whether the passage's final words are present. Catches the
//               commonest case — output that stopped early — which a ratio
//               alone can miss when the model padded what it did return.
//
// Both are computed on letters alone: the segments echo the Arabic back and an
// editor's punctuation is not a difference in coverage.
// ---------------------------------------------------------------------------

export interface Coverage {
  sourceWords: number;
  translatedWords: number;
  /** Fraction of the source's words present in the returned Arabic. */
  ratio: number;
  /** Whether the passage's closing words came back. */
  reachedEnd: boolean;
}

/**
 * Words from the end of the source that must appear for `reachedEnd`.
 *
 * Four, matching the shingle length used elsewhere: long enough not to occur by
 * chance in an unrelated sentence, short enough that a single reworded closing
 * word does not read as a truncation.
 */
const TAIL_WORDS = 4;

/**
 * Below this share of the passage, a translation is reported as incomplete.
 *
 * Not 1.0. The model legitimately merges and splits segments, and the echoed
 * Arabic is not required to be a character-for-character copy of the source —
 * so a small shortfall is normal. A fifth of the passage missing is not.
 */
export const MIN_COVERAGE = 0.8;

export function coverageOf(
  sourceText: string,
  segments: Pick<TranslatedSegment, 'arabic'>[],
): Coverage {
  const source = letterFold(sourceText).split(' ').filter(Boolean);
  const returned = letterFold(segments.map((segment) => segment.arabic).join(' '));
  const returnedWords = returned.split(' ').filter(Boolean);

  if (source.length === 0) {
    return { sourceWords: 0, translatedWords: returnedWords.length, ratio: 1, reachedEnd: true };
  }

  // Counted as a multiset so a word repeated in the source has to come back as
  // often as it was sent, rather than one occurrence vouching for all of them.
  const budget = new Map<string, number>();
  for (const word of returnedWords) budget.set(word, (budget.get(word) ?? 0) + 1);

  let found = 0;
  for (const word of source) {
    const left = budget.get(word) ?? 0;
    if (left > 0) {
      budget.set(word, left - 1);
      found += 1;
    }
  }

  const tail = source.slice(-Math.min(TAIL_WORDS, source.length)).join(' ');

  return {
    sourceWords: source.length,
    translatedWords: returnedWords.length,
    ratio: found / source.length,
    reachedEnd: returned.includes(tail),
  };
}

/** Whether this coverage should be reported to the reader as incomplete. */
export function isIncomplete(coverage: Coverage): boolean {
  return coverage.ratio < MIN_COVERAGE || !coverage.reachedEnd;
}
