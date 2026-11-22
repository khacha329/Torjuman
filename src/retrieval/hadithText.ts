import { letterFold } from '../lib/arabic';
import { stripApparatus } from './sharh';
import { agreement, agrees, NEIGHBOUR_WINDOW } from './hadithJson';

// Finding a ḥadīth by its words, in the imported hadith-json collections.
//
// ---------------------------------------------------------------------------
// Why text, and not the number
//
// Step 1 of docs/plans/hadith-text-matching.md measured the numbering: only
// Riyāḍ's and the Forty's dataset positions are the numbers a book prints.
// Bukhārī's drift 286 behind by the end, Muslim's match neither the standard
// nor sunnah.com's, and the other six were never checked. A number — printed
// in a sharḥ or recalled by the model — reaches the right ḥadīth only when it
// lands within ±10 of the dataset's position (`chooseCandidate`). Text does not
// care how the edition counted.
//
// ---------------------------------------------------------------------------
// The shape
//
// One index per collection: every folded four-word window of every ḥadīth,
// hashed to 32 bits (FNV-1a, plain JS: trap 9 — no crypto.subtle on plain-HTTP
// LAN dev), stored as two sorted typed arrays. Measured on the owner's PC for
// all ten files: 2.27 M windows and 15.2 MB of arrays, Bukhārī's alone 3.05
// MB; this code builds all ten in 2.5–3.1 s (the plan's 1.9 s was a
// radix-sort prototype; the comparator sort here is simpler, and the tablet's
// number is step 3's Settings line). Rejected: a Map<string, number[]> (tens
// of MB of objects on a tablet) and an anchor index like the Qurʾān's (a
// ḥadīth has no fixed anchor words).
//
// A hash hit is only a hint. Every hit is checked word by word against the
// candidate's own Arabic before it counts, so a hash collision costs a lookup
// and never a match. The Arabic is not in the index — it is in IndexedDB — so
// the caller first asks `candidateNumbers` which ḥadīth to read, and then
// passes their Arabic to `findHadithByText` through `arabicOf`. Both are pure.
//
// ---------------------------------------------------------------------------
// Repetitions and families
//
// Bukhārī repeats one matn under many numbers, each with its own isnād, and a
// matn often appears in Bukhārī, Muslim and the Sunan alike. Those are the
// same ḥadīth, not an ambiguity: candidates whose own Arabic agrees (the same
// `agreement` the number path uses) are one *family*. Two families that cover
// the same words of the query equally well are a real ambiguity, and nothing
// is chosen — showing the English of the wrong ḥadīth under a matn is far
// worse than showing none.
//
// Within a family the choice is, in order: the member whose chain covers most
// of the query (a printed isnād is what tells Bukhārī's repetitions apart, so
// the index keeps the isnād), then the caller's collection order, then the
// member nearest the printed or cited number, then the lowest number.
//
// A number never accepts a candidate. Its one other use is the proof the
// shipped path already relies on: when two families are ambiguous and exactly
// one holds a member within ±NEIGHBOUR_WINDOW of the cited number that also
// passes `agreement`, that family is chosen. That is number plus text, not
// number alone.
// ---------------------------------------------------------------------------

/**
 * The index format. Bump it when the fold, the hash, the window or the value
 * layout changes: a stored index of another version is rebuilt, never read.
 */
export const INDEX_VERSION = 1;

/** Words per window. The same four as `matnShingles`, so the two agree on what "a run" is. */
export const SHINGLE_WORDS = 4;

/**
 * A window found in more distinct ḥadīth than this is dropped from the index.
 *
 * Formulae — «قال رسول الله يقول», «حدثنا عبد الله بن» — occur in thousands of
 * ḥadīth and prove nothing, while costing a scan of every posting on every
 * query. Twenty-five is above Bukhārī's commonest repetition of one matn, so
 * a repeated matn keeps its windows.
 */
export const MAX_POSTINGS = 25;

/** Words a chain may skip between two matched windows, on either side. */
export const MAX_GAP = 6;

/** Fewest matched query words a chain needs. Under this a match is a formula, not a ḥadīth. */
export const MIN_RUN_WORDS = 6;

/** Fewest distinct windows a chain needs: one window can coincide, three in order do not. */
export const MIN_SHINGLE_HITS = 3;

/**
 * Fewest words past the entry's isnād the chain must cover.
 *
 * A chain of narrators says which route a report came by, not which report it
 * is: «حدثنا عبيد الله بن معاذ العنبري حدثنا ابي حدثنا شعبه» heads dozens of
 * different matns. Measured on the owner's PC (2026-11-22), 1,000 random
 * twelve-word excerpts searched across all ten collections: with neither this
 * rule nor the scope cap in `postingsFor`, 5 were matched to a different
 * ḥadīth; with the scope cap alone, 7 (fewer rivals were left to make the
 * match ambiguous). Every one inspected — three of the five, all seven —
 * matched on the isnād alone. A Muslim sharḥ prints chain-only blocks («ح
 * وحدثنا …») as a matter of course, so this is not only a sampling artefact. The isnād still counts
 * toward coverage — it is what tells Bukhārī's repetitions apart — but it can
 * no longer be the whole proof.
 */
export const MIN_MATN_WORDS = 6;

/** Segment mode: the fraction of the query the chain must cover. */
export const MIN_COVERAGE = 0.6;

/** Scan mode: matched words over the span the chain runs across, in the query. */
export const MIN_DENSITY = 0.7;

/**
 * Two families whose coverage of the query is within this of each other, over
 * the same words, are ambiguous. A tenth: a partial quotation that one ḥadīth
 * continues for two more words is not a reason to prefer it.
 */
export const AMBIGUITY_MARGIN = 0.1;

/**
 * Most candidates read and compared per query, by hash hits. Bounds the
 * IndexedDB reads a query costs. Candidates are kept by hash hits, and the
 * ḥadīth a query quotes normally has the most, so it should not be the one cut
 * off; that is an expectation from the hit counts, not a guarantee.
 */
export const MAX_CANDIDATES = 40;

/** Ḥadīth folded between two `onChunk` calls while an index is built. */
export const BUILD_CHUNK = 500;

/** Positions past this cannot be packed into 16 bits; Muslim's longest ḥadīth is 1,823 words. */
const MAX_POSITION = 0xffff;

// ---------------------------------------------------------------------- fold

/**
 * Honorifics, deleted from the folded word stream on both sides.
 *
 * One book prints ﷺ, the next «صلى الله عليه وسلم», the dataset sometimes
 * neither. `letterFold` already drops the ligature (it is not a letter), so
 * deleting the spelled-out forms makes all three the same stream of words.
 * Written as they come out of `letterFold` (ى → ي, ة → ه).
 */
const HONORIFICS: readonly (readonly string[])[] = [
  ['صلي', 'الله', 'عليه', 'وسلم'],
  ['عليه', 'الصلاه', 'والسلام'],
  ['رضي', 'الله', 'عنهما'],
  ['رضي', 'الله', 'عنهم'],
  ['رضي', 'الله', 'عنها'],
  ['رضي', 'الله', 'عنه'],
];

export interface FoldedText {
  /** The kept words. */
  words: string[];
  /** For each kept word, its index among the words of `letterFold(text)`. */
  source: number[];
}

/** `letterFold`, split into words, honorifics removed, with a map back to the folded words. */
export function foldForMatch(text: string): FoldedText {
  const all = letterFold(text).split(' ').filter(Boolean);
  const words: string[] = [];
  const source: number[] = [];
  let i = 0;
  outer: while (i < all.length) {
    for (const honorific of HONORIFICS) {
      if (honorific.every((word, k) => all[i + k] === word)) {
        i += honorific.length;
        continue outer;
      }
    }
    words.push(all[i]);
    source.push(i);
    i++;
  }
  return { words, source };
}

/**
 * Words that carry a chain, as `letterFold` leaves them: the transmission
 * verbs, «عن» and «أن», the «قال»/«قالا» between links, and the conjunction
 * forms printed between parallel chains.
 */
const TRANSMISSION = new Set([
  'حدثنا', 'حدثني', 'حدثناه', 'حدثه', 'حدثهم', 'وحدثنا', 'وحدثني', 'اخبرنا', 'اخبرني',
  'اخبرناه', 'واخبرنا', 'واخبرني', 'انبانا', 'انباني', 'وانبانا', 'سمعت', 'سمع', 'عن', 'وعن',
  'ان', 'انه', 'ح', 'قال', 'قالا', 'قالوا', 'قالت',
]);

/** Words that open a chain: a matn that begins «نهى رسول الله عن …» has no isnād. */
const CHAIN_OPENERS = new Set([
  'حدثنا', 'حدثني', 'وحدثنا', 'وحدثني', 'اخبرنا', 'اخبرني', 'واخبرنا', 'انبانا', 'عن', 'وعن',
]);

/** Said of the Prophet right after a chain: the matn starts after this. */
const PROPHET = [['رسول', 'الله'], ['النبي']] as const;

/** Said after the Prophet's name before his words; skipped when they follow it. */
const SPEECH = new Set(['قال', 'يقول', 'قالت']);

/**
 * Most words between two links of one chain: a narrator's name with its nasab
 * and a parallel narrator («عبيد الله بن محمد بن يزيد بن خنيس واحمد بن يوسف
 * الازدي قالا» is twelve).
 */
const LINK_SPAN = 12;

/** Most words after the last link at which the Prophet's mention still ends the chain. */
const PROPHET_AFTER_LINK = 2;

/**
 * Where an entry's isnād ends, in its folded words; 0 when it has none.
 *
 * A heuristic, used only to refuse a match made on the chain alone
 * (MIN_MATN_WORDS). An entry that opens with a chain word has an isnād: a run
 * of links (TRANSMISSION) no more than LINK_SPAN words apart. It ends at the
 * Prophet's mention right after a link — «قال رسول الله», «عن النبي», «أن رسول
 * الله» — with any «قال»/«يقول» after it, or else after the last link of the
 * run. A first version allowed seven words between links, and parallel
 * narrators broke it on real files: Muslim and al-Nasāʾī chains were read as
 * matn (measured, 2026-11-22). It errs long — «أن», «قال» and «عن» recur inside
 * a matn, so a report with no mention of the Prophet after its chain can have
 * much of its matn counted as isnād — and that refuses matches: with this
 * rule, 131 of 707 own-collection excerpts holding matn found nothing (mostly
 * too few matn words past the chain). Erring short would let a chain stand as
 * proof, which shows the wrong English; refusing shows none.
 */
export function isnadEnd(words: readonly string[]): number {
  if (!words.slice(0, 2).some((word) => CHAIN_OPENERS.has(word))) return 0;

  let last = words.findIndex((word) => CHAIN_OPENERS.has(word));
  for (let i = last + 1; i < words.length && i - last <= LINK_SPAN; i++) {
    if (i - last <= PROPHET_AFTER_LINK + 1) {
      const name = PROPHET.find((parts) => parts.every((word, k) => words[i + k] === word));
      if (name) {
        let end = i + name.length;
        while (end < words.length && SPEECH.has(words[end])) end++;
        return end;
      }
    }
    if (TRANSMISSION.has(words[i])) last = i;
  }
  return last + 1;
}

/** 32-bit FNV-1a over the UTF-16 code units. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function windowKey(words: readonly string[], at: number): number {
  return fnv1a(words.slice(at, at + SHINGLE_WORDS).join(' '));
}

// --------------------------------------------------------------------- index

/**
 * One collection's windows. Plain data, so it can be written to IndexedDB and
 * read back (step 3) or built by hand in a check.
 *
 * `keys` is sorted; `values[i]` belongs to `keys[i]` and packs the ḥadīth's
 * number in the high 16 bits and the window's word position in the low 16.
 * Every collection is under 65,536 ḥadīth.
 */
export interface HadithTextIndex {
  collection: string;
  version: number;
  keys: Uint32Array;
  values: Uint32Array;
  /** Entries given to the build, including any skipped for a number outside 1–65,535. */
  entries: number;
}

export interface IndexableEntry {
  number: number;
  arabic: string;
}

/**
 * Build one collection's index.
 *
 * `onChunk` is awaited after every BUILD_CHUNK ḥadīth, so an import screen can
 * yield to the event loop and keep painting while Bukhārī folds; without it the
 * build runs straight through.
 */
export async function buildHadithIndex(
  collection: string,
  entries: readonly IndexableEntry[],
  options: { onChunk?: (done: number) => Promise<void> | void } = {},
): Promise<HadithTextIndex> {
  const keys: number[] = [];
  const values: number[] = [];

  for (let n = 0; n < entries.length; n++) {
    const entry = entries[n];
    if (entry.number > 0 && entry.number <= 0xffff) {
      const { words } = foldForMatch(entry.arabic);
      const last = Math.min(words.length - SHINGLE_WORDS, MAX_POSITION);
      for (let at = 0; at <= last; at++) {
        keys.push(windowKey(words, at));
        values.push(((entry.number << 16) | at) >>> 0);
      }
    }
    if (options.onChunk && (n + 1) % BUILD_CHUNK === 0) await options.onChunk(n + 1);
  }

  const order = new Uint32Array(keys.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((a, b) => keys[a] - keys[b] || values[a] - values[b]);

  // Drop every window over the posting cap. Within one key the values are
  // sorted, so the ḥadīth numbers (the high bits) come grouped.
  const keptKeys: number[] = [];
  const keptValues: number[] = [];
  for (let start = 0; start < order.length; ) {
    const key = keys[order[start]];
    let end = start;
    let distinct = 0;
    let lastNumber = -1;
    while (end < order.length && keys[order[end]] === key) {
      const number = values[order[end]] >>> 16;
      if (number !== lastNumber) {
        distinct++;
        lastNumber = number;
      }
      end++;
    }
    if (distinct <= MAX_POSTINGS) {
      for (let i = start; i < end; i++) {
        keptKeys.push(key);
        keptValues.push(values[order[i]]);
      }
    }
    start = end;
  }

  return {
    collection,
    version: INDEX_VERSION,
    keys: Uint32Array.from(keptKeys),
    values: Uint32Array.from(keptValues),
    entries: entries.length,
  };
}

function lowerBound(keys: Uint32Array, key: number): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// --------------------------------------------------------------------- query

export type MatchMode = 'segment' | 'scan';

/** A number the book prints or the model cites, for one collection. */
export interface NumberHint {
  collection: string;
  number: number;
}

export interface TextMatchOptions {
  /**
   * 'segment': the text is meant to be one ḥadīth (a matn block, a `hadith`
   * segment); the chain must cover MIN_COVERAGE of it. 'scan': the text is
   * prose that may quote one (step 6); the chain must be dense, not long.
   */
  mode: MatchMode;
  /**
   * Orders members of a family the text already accepted, per collection; and
   * the one number-plus-text exception (header). Never accepts a candidate.
   */
  hints?: readonly NumberHint[];
}

export interface TextCandidate {
  collection: string;
  number: number;
  /** Query words the chain covers. */
  matchedWords: number;
  /** Distinct windows in the chain. */
  shingles: number;
  /** matchedWords over the query's words. */
  coverage: number;
  /** Entry words the chain covers, over the entry's words: under 1 is a partial quotation. */
  coverageOfEntry: number;
  /**
   * The same past the entry's isnād (`isnadEnd`). What "quoted in part" is
   * judged by: a sharḥ quotes the matn without the collection's chain, so
   * `coverageOfEntry` is under 1 for nearly every Bukhārī quotation.
   */
  coverageOfMatn: number;
  /** The chain's span in the query's folded words, end exclusive. */
  queryStart: number;
  queryEnd: number;
  entryStart: number;
  entryEnd: number;
}

export interface TextMatchResult {
  /** The ḥadīth, or null: nothing matched, or the match is ambiguous. */
  chosen: TextCandidate | null;
  /** The chosen family's members in other collections, in collection order. */
  also: TextCandidate[];
  /** Other members of the chosen family in the chosen collection. */
  repetitions: number;
  /** Every member of the chosen family, `chosen` first: repetitions and other collections alike. */
  family: TextCandidate[];
  ambiguous: boolean;
  /** When ambiguous: the best member of each contending family. */
  contenders: TextCandidate[];
  /** Every accepted candidate, best first. */
  candidates: TextCandidate[];
  /**
   * True when the match was made on the query with `stripApparatus` applied
   * (segment mode only, after the full text matched nothing).
   */
  stripped: boolean;
}

interface Posting {
  collection: string;
  /** Position of the collection in the caller's list: the priority. */
  rank: number;
  number: number;
  /** Distinct query windows that hashed to this ḥadīth. */
  windows: Set<number>;
}

function queryWindows(words: readonly string[]): number[] {
  const out: number[] = [];
  for (let at = 0; at + SHINGLE_WORDS <= words.length; at++) out.push(windowKey(words, at));
  return out;
}

function postingsFor(
  indexes: readonly HadithTextIndex[],
  words: readonly string[],
): Posting[] {
  const windows = queryWindows(words);

  // The posting cap again, over the whole scope. Each index caps its own
  // windows, but an isnād is shared across collections: «عن الزهري عن ابي سلمه
  // عن ابي هريره» can sit under the cap in each of ten files and still be in
  // a hundred ḥadīth between them. A window that common across what is
  // searched proves nothing here. Measured on the owner's PC (2026-11-22), with
  // MIN_MATN_WORDS in place, 1,000 random twelve-word excerpts across all ten:
  // 8 matched to a different ḥadīth with this cap and 17 without it, at the
  // cost of 15 more finding nothing (134 against 119). Searching one
  // collection, it changes nothing.
  const ranges = windows.map((key) =>
    indexes.map((index) => {
      const start = lowerBound(index.keys, key);
      let end = start;
      while (end < index.keys.length && index.keys[end] === key) end++;
      return [start, end] as const;
    }),
  );
  const common = windows.map((_, q) => {
    let distinct = 0;
    ranges[q].forEach(([start, end], k) => {
      let last = -1;
      for (let i = start; i < end; i++) {
        const number = indexes[k].values[i] >>> 16;
        if (number !== last) {
          distinct++;
          last = number;
        }
      }
    });
    return distinct > MAX_POSTINGS;
  });

  const byHadith = new Map<string, Posting>();
  indexes.forEach((index, rank) => {
    windows.forEach((_, q) => {
      if (common[q]) return;
      const [start, end] = ranges[q][rank];
      for (let i = start; i < end; i++) {
        const number = index.values[i] >>> 16;
        const id = `${index.collection}:${number}`;
        let posting = byHadith.get(id);
        if (!posting) {
          posting = { collection: index.collection, rank, number, windows: new Set() };
          byHadith.set(id, posting);
        }
        posting.windows.add(q);
      }
    });
  });
  return [...byHadith.values()]
    .filter((posting) => posting.windows.size >= MIN_SHINGLE_HITS)
    .sort(
      (a, b) =>
        b.windows.size - a.windows.size || a.rank - b.rank || a.number - b.number,
    )
    .slice(0, MAX_CANDIDATES);
}

/** The query as segment mode tries it: as given, then with the apparatus stripped. */
function queryPasses(text: string, mode: MatchMode): string[] {
  if (mode === 'scan') return [text];
  const stripped = stripApparatus(text);
  return stripped && stripped !== text ? [text, stripped] : [text];
}

/**
 * The ḥadīth whose Arabic `findHadithByText` will need, by collection, so the
 * caller can read them (one `getQulEntries` per collection) before calling it.
 */
export function candidateNumbers(
  indexes: readonly HadithTextIndex[],
  text: string,
  mode: MatchMode,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const pass of queryPasses(text, mode)) {
    for (const posting of postingsFor(indexes, foldForMatch(pass).words)) {
      const list = out.get(posting.collection) ?? [];
      if (!list.includes(posting.number)) list.push(posting.number);
      out.set(posting.collection, list);
    }
  }
  return out;
}

/**
 * The longest ordered chain of verified windows between the query and one
 * entry, gaps of at most MAX_GAP words on either side.
 */
interface Chain {
  matchedWords: number;
  /** Entry words the chain covers. */
  entryMatched: number;
  /** Of those, the ones at or past `matnFrom`: the entry's matn. */
  matnMatched: number;
  shingles: number;
  queryStart: number;
  queryEnd: number;
  entryStart: number;
  entryEnd: number;
}

function chainFor(
  query: readonly string[],
  entry: readonly string[],
  matnFrom: number,
): Chain | null {
  // Every window position in the entry, by its four words: the word-by-word
  // proof the hash only hinted at.
  const positions = new Map<string, number[]>();
  for (let e = 0; e + SHINGLE_WORDS <= entry.length; e++) {
    const window = entry.slice(e, e + SHINGLE_WORDS).join(' ');
    const list = positions.get(window);
    if (list) list.push(e);
    else positions.set(window, [e]);
  }

  const pairs: { q: number; e: number }[] = [];
  for (let q = 0; q + SHINGLE_WORDS <= query.length; q++) {
    for (const e of positions.get(query.slice(q, q + SHINGLE_WORDS).join(' ')) ?? []) {
      pairs.push({ q, e });
    }
  }
  if (pairs.length === 0) return null;

  // Sorted by query position, so a predecessor is only ever a few pairs back:
  // the walk stops once the query gap alone is too wide.
  const reach = SHINGLE_WORDS + MAX_GAP;
  const matchedQ = new Array<number>(pairs.length);
  const matchedE = new Array<number>(pairs.length);
  const count = new Array<number>(pairs.length);
  const first = new Array<number>(pairs.length);
  const previous = new Array<number>(pairs.length);
  let best = 0;
  for (let b = 0; b < pairs.length; b++) {
    matchedQ[b] = SHINGLE_WORDS;
    matchedE[b] = SHINGLE_WORDS;
    count[b] = 1;
    first[b] = b;
    previous[b] = -1;
    for (let a = b - 1; a >= 0 && pairs[b].q - pairs[a].q <= reach; a--) {
      const dq = pairs[b].q - pairs[a].q;
      const de = pairs[b].e - pairs[a].e;
      if (dq <= 0 || de <= 0 || de > reach) continue;
      const total = matchedQ[a] + Math.min(SHINGLE_WORDS, dq);
      if (total > matchedQ[b]) {
        matchedQ[b] = total;
        matchedE[b] = matchedE[a] + Math.min(SHINGLE_WORDS, de);
        count[b] = count[a] + 1;
        first[b] = first[a];
        previous[b] = a;
      }
    }
    if (matchedQ[b] > matchedQ[best]) best = b;
  }

  // The entry words the best chain covers past its isnād, walked back link by link.
  const covered = new Set<number>();
  for (let p = best; p !== -1; p = previous[p]) {
    for (let k = 0; k < SHINGLE_WORDS; k++) {
      if (pairs[p].e + k >= matnFrom) covered.add(pairs[p].e + k);
    }
  }

  return {
    matchedWords: matchedQ[best],
    entryMatched: matchedE[best],
    matnMatched: covered.size,
    shingles: count[best],
    queryStart: pairs[first[best]].q,
    queryEnd: pairs[best].q + SHINGLE_WORDS,
    entryStart: pairs[first[best]].e,
    entryEnd: pairs[best].e + SHINGLE_WORDS,
  };
}

function accepted(candidate: TextCandidate, mode: MatchMode): boolean {
  if (candidate.matchedWords < MIN_RUN_WORDS || candidate.shingles < MIN_SHINGLE_HITS) return false;
  if (mode === 'segment') return candidate.coverage >= MIN_COVERAGE;
  return candidate.matchedWords / (candidate.queryEnd - candidate.queryStart) >= MIN_DENSITY;
}

function sameFamily(a: string, b: string): boolean {
  return agrees(agreement(a, b)) || agrees(agreement(b, a));
}

/** Query spans that share at least half of the shorter one. */
function overlaps(a: TextCandidate, b: TextCandidate): boolean {
  const shared = Math.min(a.queryEnd, b.queryEnd) - Math.max(a.queryStart, b.queryStart);
  const shorter = Math.min(a.queryEnd - a.queryStart, b.queryEnd - b.queryStart);
  return shared * 2 >= shorter;
}

/** A fresh empty result each time, so no caller can change another's arrays. */
function noMatch(): TextMatchResult {
  return {
    chosen: null,
    also: [],
    repetitions: 0,
    family: [],
    ambiguous: false,
    contenders: [],
    candidates: [],
    stripped: false,
  };
}

/**
 * Identify the ḥadīth `text` is, within `indexes` (the scope, in priority
 * order). `arabicOf` returns a candidate's Arabic, read beforehand by the
 * caller for the numbers `candidateNumbers` named; a candidate it cannot
 * return is skipped.
 */
export function findHadithByText(
  indexes: readonly HadithTextIndex[],
  text: string,
  options: TextMatchOptions & { arabicOf: (collection: string, number: number) => string | undefined },
): TextMatchResult {
  const passes = queryPasses(text, options.mode);
  for (let p = 0; p < passes.length; p++) {
    const result = matchPass(indexes, passes[p], options);
    if (result.candidates.length > 0) return { ...result, stripped: p > 0 };
  }
  return noMatch();
}

function matchPass(
  indexes: readonly HadithTextIndex[],
  text: string,
  options: TextMatchOptions & { arabicOf: (collection: string, number: number) => string | undefined },
): TextMatchResult {
  const query = foldForMatch(text).words;
  if (query.length < MIN_RUN_WORDS) return noMatch();

  const rank = new Map(indexes.map((index, i) => [index.collection, i]));
  const arabic = new Map<TextCandidate, string>();
  const candidates: TextCandidate[] = [];

  for (const posting of postingsFor(indexes, query)) {
    const source = options.arabicOf(posting.collection, posting.number);
    if (source === undefined) continue;
    const entry = foldForMatch(source).words;
    const matnFrom = isnadEnd(entry);
    const chain = chainFor(query, entry, matnFrom);
    if (!chain || chain.matnMatched < MIN_MATN_WORDS) continue;
    const candidate: TextCandidate = {
      collection: posting.collection,
      number: posting.number,
      matchedWords: chain.matchedWords,
      shingles: chain.shingles,
      queryStart: chain.queryStart,
      queryEnd: chain.queryEnd,
      entryStart: chain.entryStart,
      entryEnd: chain.entryEnd,
      coverage: chain.matchedWords / query.length,
      coverageOfEntry: entry.length ? Math.min(1, chain.entryMatched / entry.length) : 0,
      coverageOfMatn: Math.min(1, chain.matnMatched / Math.max(1, entry.length - matnFrom)),
    };
    if (!accepted(candidate, options.mode)) continue;
    candidates.push(candidate);
    arabic.set(candidate, source);
  }
  if (candidates.length === 0) return noMatch();

  const hintFor = (candidate: TextCandidate) =>
    options.hints?.find((hint) => hint.collection === candidate.collection);
  const hintDistance = (candidate: TextCandidate) => {
    const hint = hintFor(candidate);
    return hint ? Math.abs(candidate.number - hint.number) : Number.POSITIVE_INFINITY;
  };
  const byPreference = (a: TextCandidate, b: TextCandidate) =>
    b.matchedWords - a.matchedWords ||
    (rank.get(a.collection) ?? 0) - (rank.get(b.collection) ?? 0) ||
    hintDistance(a) - hintDistance(b) ||
    a.number - b.number;
  candidates.sort(byPreference);

  // Families: union of every pair whose Arabic agrees.
  const parent = candidates.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (root(i) === root(j)) continue;
      if (sameFamily(arabic.get(candidates[i])!, arabic.get(candidates[j])!)) parent[root(j)] = root(i);
    }
  }
  const families = new Map<number, TextCandidate[]>();
  candidates.forEach((candidate, i) => {
    const members = families.get(root(i)) ?? [];
    members.push(candidate);
    families.set(root(i), members);
  });
  // Each family's members are already in preference order; families by their best.
  const ordered = [...families.values()].sort((a, b) => byPreference(a[0], b[0]));

  const top = ordered[0];
  const contending = ordered.filter(
    (family) =>
      family === top ||
      (family[0].coverage >= top[0].coverage - AMBIGUITY_MARGIN && overlaps(family[0], top[0])),
  );

  let chosenFamily: TextCandidate[] | null = top;
  if (contending.length > 1) {
    // The one exception (header): number plus text, as `chooseCandidate` proves it.
    const proved = contending.filter((family) =>
      family.some((member) => {
        const hint = hintFor(member);
        return (
          hint !== undefined &&
          Math.abs(member.number - hint.number) <= NEIGHBOUR_WINDOW &&
          agrees(agreement(text, arabic.get(member)!))
        );
      }),
    );
    chosenFamily = proved.length === 1 ? proved[0] : null;
  }

  if (!chosenFamily) {
    return {
      ...noMatch(),
      ambiguous: true,
      contenders: contending.map((family) => family[0]),
      candidates,
    };
  }

  const chosen = chosenFamily[0];
  const also: TextCandidate[] = [];
  for (const member of chosenFamily.slice(1)) {
    if (member.collection !== chosen.collection && !also.some((c) => c.collection === member.collection)) {
      also.push(member);
    }
  }
  also.sort((a, b) => (rank.get(a.collection) ?? 0) - (rank.get(b.collection) ?? 0));
  return {
    chosen,
    also,
    repetitions: chosenFamily.filter(
      (member) => member !== chosen && member.collection === chosen.collection,
    ).length,
    family: chosenFamily,
    ambiguous: false,
    contenders: [],
    candidates,
    stripped: false,
  };
}
