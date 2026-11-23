import type { HadithJsonEntry } from '../types';
import { letterFold } from '../lib/arabic';
import { BOOK_NUMBER, SHORT_QUOTE_MAX_RAW_WORDS, SHORT_QUOTE_WORDS } from './hadithJson';
import { MAX_POSTINGS, MIN_RUN_WORDS, foldForMatch, isnadEnd, sameFamily } from './hadithText';
import { stripApparatus } from './sharh';

// ---------------------------------------------------------------------------
// A ḥadīth found from a short quotation (docs/plans/hadith-short-quote.md).
//
// A sharḥ often quotes three words of a ḥadīth, «إنما الأعمال بالخواتيم», and
// names it in a footnote, «رواه البخاري … ٦٦٠٧». The text search cannot take
// it (six words at least, past the chain), and the number path looks only ten
// either side of the cited number, while Bukhārī's file has that ḥadīth 241
// below it. So a third way, for three to five words.
//
// Measured on the real files before it was built: a short phrase found in one
// ḥadīth of a collection is the wrong ḥadīth about as often as the right one
// (plan, M2), so uniqueness alone proves nothing. The cited number carries the
// other half of the proof: the phrase must lie in exactly one family of the
// WHOLE collection (not only near the number: five times more wrong answers,
// M3), and that family must have a member in the window around the cited
// number. With the matn-only and twelve-letter rules below, about 1 in 2,900
// three-word quotations under a wrong citation was accepted.
// ---------------------------------------------------------------------------

/** Fewest letters a short quotation must have (M3: removes most 3-word errors). */
export const SHORT_QUOTE_MIN_LETTERS = 12;

/** Most folded words: six and more belong to the text search (`MIN_RUN_WORDS`). */
export const SHORT_QUOTE_MAX_WORDS = MIN_RUN_WORDS - 1;

export type ShortQuotePhrase =
  | { words: string[]; letters: number }
  | { refused: 'too-short' | 'too-long' | 'empty' };

/**
 * The book's quotation as a phrase to search for, or why it is not one.
 *
 * Prepared as `shortQuoteHolds` prepares it (the printed number and the
 * apparatus stripped), then folded with `foldForMatch`, so honorifics are
 * gone: «صلى الله عليه وسلم» alone folds to nothing and is refused as empty,
 * which also keeps it off the 125 Mālik rows that have no Arabic at all.
 */
export function shortQuotePhrase(text: string): ShortQuotePhrase {
  const unnumbered = text.replace(BOOK_NUMBER, '');
  const raw = letterFold(unnumbered).split(' ').filter(Boolean);
  if (raw.length > SHORT_QUOTE_MAX_RAW_WORDS) return { refused: 'too-long' };
  const { words } = foldForMatch(stripApparatus(unnumbered));
  if (words.length === 0) return { refused: 'empty' };
  if (words.length > SHORT_QUOTE_MAX_WORDS) return { refused: 'too-long' };
  const letters = words.reduce((sum, word) => sum + word.length, 0);
  if (words.length < SHORT_QUOTE_WORDS || letters < SHORT_QUOTE_MIN_LETTERS) return { refused: 'too-short' };
  return { words, letters };
}

/** A dataset entry folded once, for scanning many phrases or many entries. */
export interface FoldedEntry {
  words: string[];
  /** The first word past the isnād (`isnadEnd`). */
  matnStart: number;
}

export function foldEntry(arabic: string): FoldedEntry {
  const { words } = foldForMatch(arabic);
  return { words, matnStart: isnadEnd(words) };
}

/** The conjunctions the dataset fuses to a quotation's first word. */
const PROCLITICS = ['و', 'ف'];

/**
 * Whether the entry's matn holds the phrase as consecutive whole words.
 *
 * The first word may carry one «و» or «ف» on the entry's side: the owner's
 * quotation «إنما الأعمال بالخواتيم» is «وإنما الأعمال بالخواتيم» in the file,
 * and without this it is found nowhere (plan, Current state 4). Only the first
 * word, and only that addition; nothing else is fuzzy. A phrase that starts
 * inside the isnād does not count (M3: half the three-word errors were chain
 * words).
 */
export function containsShortQuote(entry: FoldedEntry, phrase: readonly string[]): boolean {
  const [first, ...rest] = phrase;
  if (first === undefined) return false;
  const last = entry.words.length - phrase.length;
  for (let i = entry.matnStart; i <= last; i++) {
    const word = entry.words[i];
    if (word !== first && !PROCLITICS.some((p) => word === p + first)) continue;
    if (rest.every((next, k) => entry.words[i + 1 + k] === next)) return true;
  }
  return false;
}

export type ShortQuoteChoice =
  | {
      status: 'matched';
      entry: HadithJsonEntry;
      /** Every number in the matched family, ascending. */
      family: number[];
      /** entry.number minus the cited number. */
      distance: number;
    }
  | { status: 'ambiguous'; families: number }
  | { status: 'common'; entries: number }
  | { status: 'none-near' };

/**
 * Accept or refuse, given every entry of the collection that holds the phrase.
 *
 * Over MAX_POSTINGS entries is a formula («قال رسول الله»: 490 in Bukhārī),
 * for the reason the text index caps its postings. Two families anywhere in
 * the collection are ambiguous, even if only one is near the number: the
 * number never chooses between two (owner's answer Q3). One family with no
 * member in the window is refused. Of the members in the window, the one
 * nearest the cited number is chosen, then the lowest number, as the text
 * search orders repetitions.
 */
export function chooseShortQuote(
  hits: readonly HadithJsonEntry[],
  cited: number,
  window: { behind: number; ahead: number },
): ShortQuoteChoice {
  if (hits.length === 0) return { status: 'none-near' };
  if (hits.length > MAX_POSTINGS) return { status: 'common', entries: hits.length };

  const parent = hits.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let a = 0; a < hits.length; a++) {
    for (let b = a + 1; b < hits.length; b++) {
      if (root(a) !== root(b) && sameFamily(hits[a].arabic, hits[b].arabic)) parent[root(b)] = root(a);
    }
  }
  const families = new Set(hits.map((_, i) => root(i))).size;
  if (families > 1) return { status: 'ambiguous', families };

  const near = hits
    .filter((entry) => entry.number >= cited - window.behind && entry.number <= cited + window.ahead)
    .sort((a, b) => Math.abs(a.number - cited) - Math.abs(b.number - cited) || a.number - b.number);
  if (near.length === 0) return { status: 'none-near' };
  return {
    status: 'matched',
    entry: near[0],
    family: hits.map((entry) => entry.number).sort((a, b) => a - b),
    distance: near[0].number - cited,
  };
}
