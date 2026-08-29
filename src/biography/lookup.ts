import type { BiographyEntry, Book } from '../types';
import { ALIAS_RANK, foldQuery, type AliasKind } from './names';

// Looking a name up across the imported biographical works.
//
// ---------------------------------------------------------------------------
// Ambiguity is the normal case, and is never resolved for the reader
//
// Many scholars share a name. «عمر» is dozens of people; «محمد بن أحمد» is
// hundreds. So this returns EVERY match, ranked and grouped by the work it came
// from, with enough on each row — the name as printed, the source, the ج/ص —
// for a reader to tell which is meant.
//
// It never picks one. That is the same rule the dorar grading lookup follows,
// for the same reason: presenting a single confident answer that happens to be
// the wrong Muḥammad is worse than presenting four and asking.
//
// No model is involved at any point. Ranking is a table lookup on how specific
// the matched alias was.
// ---------------------------------------------------------------------------

export interface BiographyHit {
  entry: BiographyEntry;
  /** Which kind of alias matched, and therefore how much to trust it. */
  matchedAs: AliasKind;
  /** True when the whole printed name equals the query. */
  exact: boolean;
}

export interface BiographyGroup {
  bookId: string;
  bookTitle: string;
  hits: BiographyHit[];
}

export interface BiographyLookup {
  query: string;
  /** Folded form actually searched, surfaced so a bad fold is visible. */
  folded: string;
  groups: BiographyGroup[];
  total: number;
}

/** Selections this short or this long are not names; do not even search. */
const MIN_QUERY_CHARS = 2;
const MAX_QUERY_WORDS = 12;

export function isLookupableSelection(selection: string): boolean {
  const words = selection.trim().split(/\s+/).filter(Boolean);
  return (
    words.length >= 1 &&
    words.length <= MAX_QUERY_WORDS &&
    selection.trim().length >= MIN_QUERY_CHARS
  );
}

/**
 * Match a folded query against one entry, returning the most specific alias
 * that matched, or null.
 *
 * Both directions of containment are accepted at token granularity: the reader
 * may select «عمر بن الخطاب» where the work prints the full nasab, or select
 * the full nasab where the work prints a short form. Token boundaries are
 * respected via the space padding so «عمر» does not match inside «عمرو».
 */
function matchEntry(entry: BiographyEntry, folded: string): BiographyHit | null {
  let best: AliasKind | null = null;
  let bestScore = Infinity;
  const padded = ` ${folded} `;

  for (const alias of entry.aliases) {
    const kind = alias.kind as AliasKind;
    const value = ` ${alias.value} `;

    const equal = alias.value === folded;
    // The alias is longer and contains the selection: «عمر بن الخطاب» inside
    // «عمر بن الخطاب بن نفيل القرشي». Always meaningful.
    const aliasContainsQuery = value.includes(padded);
    // The selection is longer and contains the alias. Meaningful for a nasab
    // or a kunya — but NOT for a bare ism, or selecting «عمر بن الخطاب» would
    // return every person in the book whose first name happens to be عمر,
    // which is the noise the ranking exists to avoid.
    const queryContainsAlias = kind !== 'ism' && padded.includes(value);

    if (!equal && !aliasContainsQuery && !queryContainsAlias) continue;

    // An alias the selection matches *exactly* beats one it merely sits
    // inside, whatever their kinds: selecting «عمر بن الخطاب» has matched the
    // ism+nasab precisely, and reporting that is more honest than reporting a
    // partial hit on the full name just because `full` outranks it.
    const score = (equal ? 0 : 10) + ALIAS_RANK[kind];
    if (score < bestScore) {
      bestScore = score;
      best = kind;
    }
  }

  if (best === null) return null;
  return { entry, matchedAs: best, exact: entry.nameNormalized === folded };
}

/**
 * Every entry matching a selection, ranked and grouped by book.
 *
 * `entries` is every biography entry across every imported work; `books` gives
 * the titles. Both come from storage, and this function is pure so the ranking
 * can be tested without a database.
 */
export function lookupBiography(
  selection: string,
  entries: BiographyEntry[],
  books: Pick<Book, 'id' | 'title'>[],
): BiographyLookup {
  const folded = foldQuery(selection);
  const titles = new Map(books.map((book) => [book.id, book.title]));

  const hits: BiographyHit[] = [];
  if (folded.length >= MIN_QUERY_CHARS) {
    for (const entry of entries) {
      const hit = matchEntry(entry, folded);
      if (hit) hits.push(hit);
    }
  }

  // Exact printed name first, then by how specific the matched alias was, then
  // alphabetically so the order is stable between lookups.
  hits.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    const rank = ALIAS_RANK[a.matchedAs] - ALIAS_RANK[b.matchedAs];
    if (rank !== 0) return rank;
    return a.entry.nameNormalized.localeCompare(b.entry.nameNormalized);
  });

  const byBook = new Map<string, BiographyHit[]>();
  for (const hit of hits) {
    const list = byBook.get(hit.entry.bookId);
    if (list) list.push(hit);
    else byBook.set(hit.entry.bookId, [hit]);
  }

  // Books whose best hit is strongest come first, so the work that actually
  // has the person leads rather than whichever imported first.
  const groups: BiographyGroup[] = [...byBook.entries()]
    .map(([bookId, bookHits]) => ({
      bookId,
      bookTitle: titles.get(bookId) ?? bookId,
      hits: bookHits,
    }))
    .sort((a, b) => {
      if (a.hits[0].exact !== b.hits[0].exact) return a.hits[0].exact ? -1 : 1;
      return ALIAS_RANK[a.hits[0].matchedAs] - ALIAS_RANK[b.hits[0].matchedAs];
    });

  return { query: selection, folded, groups, total: hits.length };
}
