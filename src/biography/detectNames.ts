import type { BiographyEntry } from '../types';
import { foldName } from '../retrieval/narrator';

// Marking the names of people the reader can actually look up.
//
// ---------------------------------------------------------------------------
// Precision, and what it costs to get it wrong
//
// This layer marks names in the running text so they can be tapped instead of
// selected. That is a small convenience with a large failure mode: the Arabic
// column already carries entity tints, skip highlights, read underlines and
// translated-range borders, and a name layer that fires too often does not
// merely add noise — it buries the other four.
//
// «محمد» and «أحمد» appear on nearly every page of a six-volume commentary, and
// most of those occurrences are not the man whose biography would open. So a
// bare given name is never marked, and the rule that enforces it is structural
// rather than a list: only aliases of TWO OR MORE WORDS are markable.
//
// That single rule covers every case the amendment names:
//
//   «عمر بن الخطاب»   ism + nasab, two words plus the particle   marked
//   «أبو حفص»          kunya, two words                          marked
//   «عمر»              bare ism, one word                        never
//   «القرشي»           nisba, one word, and shared by a clan      never
//
// A one-word `full` alias — a Companion known by a single name, «أبان» — falls
// on the correct side of it too: as a lone word in running prose it is exactly
// as ambiguous as a bare ism, and it is left to selection.
//
// ---------------------------------------------------------------------------
// Nothing here resolves an ambiguity
//
// An alias can belong to several people; «أبو حفص» is many men. The index
// deliberately does not record WHICH entry a marked span belongs to — only that
// the span is worth offering. Tapping runs the same lookup the selection rail
// runs, and the sheet shows every candidate. Marking a span is a statement that
// this is a name, never a statement about which person it is.
// ---------------------------------------------------------------------------

/**
 * Longest alias, in words, that will be looked for.
 *
 * A full nasab runs to a dozen words in a biographical dictionary's heading but
 * is almost never written out at length in commentary — where it is, the
 * shorter ism+nasab inside it matches instead. The cap bounds the scan at six
 * lookups per candidate word rather than a dozen.
 */
const MAX_ALIAS_WORDS = 6;

/** Below this, a folded alias is too short to be evidence of anything. */
const MIN_ALIAS_LENGTH = 6;

export interface PersonIndex {
  /** Folded alias → the number of words it occupies. */
  byAlias: Map<string, number>;
  /** Folded first words, so most tokens are rejected with one lookup. */
  firstWords: Set<string>;
  longest: number;
}

export const EMPTY_PERSON_INDEX: PersonIndex = {
  byAlias: new Map(),
  firstWords: new Set(),
  longest: 0,
};

/**
 * Build the marking index from the biographical works that are imported.
 *
 * Aliases come from `deriveAliases`, already folded and already labelled by
 * kind, so this only has to apply the two-word rule and drop what is left.
 */
export function buildPersonIndex(entries: BiographyEntry[]): PersonIndex {
  const byAlias = new Map<string, number>();
  const firstWords = new Set<string>();
  let longest = 0;

  for (const entry of entries) {
    for (const alias of entry.aliases) {
      // `nisba` and `ism` are excluded by kind as well as by length: a nisba
      // can be two words in principle, and it still identifies a tribe rather
      // than a man.
      if (alias.kind === 'ism' || alias.kind === 'nisba') continue;
      if (alias.value.length < MIN_ALIAS_LENGTH) continue;

      const words = alias.value.split(' ').filter(Boolean);
      if (words.length < 2 || words.length > MAX_ALIAS_WORDS) continue;

      byAlias.set(alias.value, words.length);
      firstWords.add(words[0]);
      if (words.length > longest) longest = words.length;
    }
  }

  return { byAlias, firstWords, longest };
}

/** One marked name, as offsets into the ORIGINAL block text. */
export interface PersonSpan {
  start: number;
  end: number;
  /** The text as the book wrote it, honorifics excluded. */
  text: string;
  /** Folded, for the lookup the tap performs. */
  reference: string;
}

/** Characters that can sit against a name without being part of it. */
const EDGE_PUNCTUATION = /^[\s.,;:!?()[\]{}«»"'،؛؟‘’“”﴾﴿﴿﴾-]+|[\s.,;:!?()[\]{}«»"'،؛؟‘’“”﴾﴿﴿﴾-]+$/g;

interface Token {
  start: number;
  end: number;
  folded: string;
}

/**
 * Fold one word the way `deriveAliases` folded the index.
 *
 * `foldName` applies two rewrites that matter here — أبي/أبا → أبو, and ابن →
 * بن — and both are anchored on whitespace, `/(^|\s)ابن(?=\s)/`, so they cannot
 * fire inside a longer word. On a lone token neither fires: `normalize` trims,
 * so padding the input with spaces does not help either, and «ابن» comes back
 * unchanged while the index holds «بن».
 *
 * That is not cosmetic. «عمر ابن الخطاب» is an ordinary way to write the name,
 * and without this every nasab written with the full form silently fails to
 * match. The rewrites are therefore applied here, to a string that is a whole
 * word by construction, which is the condition the originals were expressing.
 */
function foldToken(word: string): string {
  const folded = foldName(word);
  if (folded === 'ابن') return 'بن';
  if (folded === 'ابي' || folded === 'ابا') return 'ابو';
  return folded;
}

function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const folded = foldToken(match[0]);
    // A token that folds away entirely is punctuation, or an honorific that
    // `foldName` removes. Either way it is not part of a name — and dropping it
    // rather than keeping an empty token is what lets «عمر بن الخطاب ﵁» match
    // without the honorific being dragged into the span.
    if (folded !== '') {
      tokens.push({ start: match.index, end: match.index + match[0].length, folded });
    }
  }

  return tokens;
}

/**
 * Every markable name in one block, longest match first, without overlaps.
 *
 * Longest-first matters at a shared starting word: «عمر بن الخطاب» and a
 * two-word alias beginning «عمر» can both begin at the same token, and marking
 * the shorter one would leave «بن الخطاب» outside the tappable span.
 */
export function detectPersonSpans(text: string, index: PersonIndex): PersonSpan[] {
  if (index.byAlias.size === 0) return [];

  const tokens = tokenise(text);
  const spans: PersonSpan[] = [];

  for (let i = 0; i < tokens.length; i++) {
    if (!index.firstWords.has(tokens[i].folded)) continue;

    for (let length = Math.min(index.longest, tokens.length - i); length >= 2; length--) {
      const candidate = tokens
        .slice(i, i + length)
        .map((token) => token.folded)
        .join(' ');

      if (!index.byAlias.has(candidate)) continue;

      const start = tokens[i].start;
      const end = tokens[i + length - 1].end;
      const raw = text.slice(start, end);
      const trimmed = raw.replace(EDGE_PUNCTUATION, '');
      const offset = raw.indexOf(trimmed);

      if (trimmed !== '') {
        spans.push({
          start: start + offset,
          end: start + offset + trimmed.length,
          text: trimmed,
          reference: candidate,
        });
      }

      // Past the match: names do not nest, and a second span inside the first
      // would give the reader two overlapping targets for one name.
      i += length - 1;
      break;
    }
  }

  return spans;
}
