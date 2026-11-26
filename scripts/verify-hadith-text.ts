// Check H: the pure ḥadīth text matcher (src/retrieval/hadithText.ts).
//
//   npm run verify:hadith-text
//
// Runs anywhere: no fixtures, no network, no browser. Built by Vite's SSR
// build like `verify:requests` and run in Node.
//
// The corpora are synthetic on purpose. The repository is public and no book
// or dataset text may be committed beyond what already is, so every "ḥadīth"
// here is a run of made-up Arabic-letter words from a seeded generator. The
// only real Arabic is the honorific formulae, which are what one case is about.
// The matcher sees letters, not meaning, so made-up words exercise exactly the
// same code a real matn does; what they cannot show is the thresholds' fit to
// real data, which is step 5's report on the owner's PC.
//
// Since lane B3 it also holds the on-device cut (`segmentSelection`), the one
// place the ḥadīth invariant is enforced, so that it is checked without
// fixtures and without downloading a model: the cut is pure, and the model
// only ever receives what the cut calls prose.

import {
  buildHadithIndex,
  candidateNumbers,
  findHadithByText,
  foldForMatch,
  INDEX_VERSION,
  isnadEnd,
  MAX_POSTINGS,
  type HadithTextIndex,
  type IndexableEntry,
  type TextMatchOptions,
  type TextMatchResult,
} from '../src/retrieval/hadithText';
import {
  decodeIndex,
  encodeIndex,
  forgetLoadedIndexes,
  hadithIndexStatus,
  INDEX_PARTS,
  loadHadithIndexes,
  searchHadithText,
} from '../src/retrieval/hadithTextIndex';
import { citedWindowFor, sharhCollectionFor } from '../src/retrieval/hadithJson';
import {
  chooseShortQuote,
  containsShortQuote,
  findShortQuote,
  foldEntry,
  shortQuotePhrase,
} from '../src/retrieval/hadithShortQuote';
import { hadithScopeFor } from '../src/ui/reader/hadithScope';
import { letterFold } from '../src/lib/arabic';
import { entityText } from '../src/quran/entityService';
import type { StorageAdapter } from '../src/platform/storage/StorageAdapter';
import type { HttpClient } from '../src/platform/http/HttpClient';
import { findShortByReference, lookupByText, lookupHadith } from '../src/retrieval/HadithSource';
import {
  enrichSegments,
  HADITH_KEY_WOULD_HELP,
  HADITH_NEEDS_KEY,
  HADITH_QUOTED_IN_PART,
  hadithImportedMissNote,
  hadithShortAmbiguousNote,
  hadithShortQuoteNote,
} from '../src/retrieval/enrich';
import type { QuranLookupOptions } from '../src/retrieval/quran';
import {
  HADITH_NO_OFFLINE_SOURCE,
  segmentSelection,
  type SegmentedSelection,
} from '../src/translation/offline/segmentSelection';
import { splitSentences } from '../src/translation/offline/sentences';
import { QuranEnglish, QuranIndex } from '../src/quran/quranIndex';
import { stripApparatus } from '../src/retrieval/sharh';
import type {
  Block,
  BlockType,
  Entity,
  HadithIndexPart,
  HadithJsonEntry,
  HadithRecord,
  QulEntry,
  QulResource,
} from '../src/types';

let passed = 0;
const failures: string[] = [];

function expect(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
  } else {
    failures.push(detail === undefined ? name : `${name}\n      ${JSON.stringify(detail)}`);
  }
}

// ------------------------------------------------------------- the corpus

/** mulberry32: a small seeded generator, so every run builds the same words. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Letters only, none of the ones `normalize` folds, so a word folds to itself.
const LETTERS = 'بتثجحخدذرزسشصضطظعغفقكلمنهوي';
const random = generator(20261122);

function word(): string {
  const length = 3 + Math.floor(random() * 4);
  let out = '';
  for (let i = 0; i < length; i++) out += LETTERS[Math.floor(random() * LETTERS.length)];
  return out;
}

function words(count: number): string[] {
  return Array.from({ length: count }, word);
}

const text = (parts: readonly string[]) => parts.join(' ');

// A filler collection, so a query always has unrelated ḥadīth beside it.
function filler(from: number, count: number): IndexableEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    number: from + i,
    arabic: text(words(20 + Math.floor(random() * 30))),
  }));
}

const matnA = words(30);
const matnB = words(26);
const shared = words(14);
const familyOne = [...words(12), ...shared, ...words(12)];
const familyTwo = [...words(12), ...shared, ...words(12)];
const honorificMatn = [...words(8), 'صلى', 'الله', 'عليه', 'وسلم', ...words(10)];
const repeated = words(24);
const chains = [words(7), words(7), words(7)];
const formula = ['قال', 'رسول', 'الله', 'صلى', 'الله', 'عليه', 'وسلم'];
const common = words(4);

const alpha: IndexableEntry[] = [
  ...filler(1, 9),
  { number: 10, arabic: text([...chains[0], ...repeated]) },
  { number: 11, arabic: text(matnA) },
  { number: 12, arabic: text(honorificMatn) },
  ...filler(13, 7),
  { number: 20, arabic: text([...chains[1], ...repeated]) },
  ...filler(21, 9),
  { number: 30, arabic: text([...chains[2], ...repeated]) },
  ...filler(31, 69),
  { number: 100, arabic: text(familyOne) },
  ...filler(101, 99),
  { number: 200, arabic: text(familyTwo) },
  { number: 201, arabic: text([...formula, ...words(12)]) },
  { number: 202, arabic: text([...formula, ...words(12)]) },
  { number: 203, arabic: text([...formula, ...words(12)]) },
  // Under four words: indexed as nothing, matched by nothing.
  { number: 204, arabic: text(words(3)) },
  { number: 205, arabic: text(words(1)) },
  { number: 206, arabic: '' },
];
// Past the posting cap: one phrase in more than MAX_POSTINGS ḥadīth.
for (let i = 0; i <= MAX_POSTINGS; i++) {
  alpha.push({ number: 300 + i, arabic: text([...words(6), ...common, ...words(6)]) });
}

const beta: IndexableEntry[] = [
  ...filler(1, 40),
  // matnB is in both collections: one family, two collections.
  { number: 41, arabic: text(matnB) },
  ...filler(42, 20),
];
const gamma: IndexableEntry[] = [
  ...filler(1, 4),
  { number: 5, arabic: text(matnB) },
  ...filler(6, 10),
];

const arabicByCollection = new Map<string, Map<number, string>>([
  ['alpha', new Map(alpha.map((e) => [e.number, e.arabic]))],
  ['beta', new Map(beta.map((e) => [e.number, e.arabic]))],
  ['gamma', new Map(gamma.map((e) => [e.number, e.arabic]))],
]);
const arabicOf = (collection: string, number: number) =>
  arabicByCollection.get(collection)?.get(number);

let chunks = 0;
const indexAlpha = await buildHadithIndex('alpha', alpha, {
  onChunk: () => {
    chunks++;
  },
});
const indexBeta = await buildHadithIndex('beta', beta);
const indexGamma = await buildHadithIndex('gamma', gamma);

function find(
  indexes: HadithTextIndex[],
  query: string,
  options: Partial<TextMatchOptions> = {},
): TextMatchResult {
  // The two-phase contract: the numbers `candidateNumbers` names are the only
  // Arabic the matcher may ask for.
  const allowed = candidateNumbers(indexes, query, options.mode ?? 'segment');
  return findHadithByText(indexes, query, {
    mode: 'segment',
    ...options,
    arabicOf: (collection, number) => {
      if (!allowed.get(collection)?.includes(number)) {
        failures.push(`arabicOf asked for ${collection}:${number}, not named by candidateNumbers`);
      }
      return arabicOf(collection, number);
    },
  });
}

const foldedIsnadEnd = (input: string) => isnadEnd(foldForMatch(input).words);

const chosenId = (result: TextMatchResult) =>
  result.chosen ? `${result.chosen.collection}:${result.chosen.number}` : null;

// ------------------------------------------------------------------ the index

expect('index carries INDEX_VERSION', indexAlpha.version === INDEX_VERSION);
expect('index records its entry count', indexAlpha.entries === alpha.length);
expect('index keys are sorted', indexAlpha.keys.every((key, i, all) => i === 0 || all[i - 1] <= key));
expect('keys and values are the same length', indexAlpha.keys.length === indexAlpha.values.length);
{
  const again = await buildHadithIndex('alpha', alpha);
  expect(
    'the build is deterministic',
    again.keys.every((key, i) => key === indexAlpha.keys[i]) &&
      again.values.every((value, i) => value === indexAlpha.values[i]),
  );
}
// Under BUILD_CHUNK, so never called here; the case with a corpus past it is at the end of the file.
expect('onChunk: not called under BUILD_CHUNK ḥadīth', chunks === 0 && alpha.length < 500, chunks);
{
  const numbers = new Set([...indexAlpha.values].map((value) => value >>> 16));
  expect('entries under four words leave no posting', ![204, 205, 206].some((n) => numbers.has(n)));
}
{
  // The phrase in MAX_POSTINGS + 1 ḥadīth is gone; the ḥadīth themselves stay
  // findable by their other windows.
  // The phrase sits at word 6 of each; its window there must have no posting,
  // while the window before it (unique words) keeps one.
  const values = new Set(indexAlpha.values);
  const capped = Array.from({ length: MAX_POSTINGS + 1 }, (_, i) => (((300 + i) << 16) | 6) >>> 0);
  expect('a window in more than MAX_POSTINGS ḥadīth is dropped', capped.every((v) => !values.has(v)));
  expect('a window in one ḥadīth is kept', values.has(((300 << 16) | 0) >>> 0));
  const result = find([indexAlpha], text([...alpha.find((e) => e.number === 310)!.arabic.split(' ')]));
  expect('a ḥadīth holding the capped phrase is still found by its other words', chosenId(result) === 'alpha:310', result);
}

// ------------------------------------------------------------------ the fold

{
  const input = 'قال ﷺ: «إنما» صلى الله عليه وسلم يا رضي الله عنهما ثم';
  const folded = foldForMatch(input);
  const all = letterFold(input).split(' ');
  expect(
    'fold: the word map leads back to the folded words',
    folded.words.every((w, k) => all[folded.source[k]] === w),
    folded,
  );
  expect(
    'fold: honorifics and the ligature are gone',
    folded.words.join(' ') === 'قال انما يا ثم',
    folded.words,
  );
}

// ------------------------------------------------------------ approved cases

{
  const result = find([indexAlpha], text(matnA));
  expect('bare matn: found', chosenId(result) === 'alpha:11', result);
  expect('bare matn: whole query covered', result.chosen?.coverage === 1, result.chosen);
  expect('bare matn: whole ḥadīth covered', result.chosen?.coverageOfEntry === 1, result.chosen);
}
{
  const result = find([indexAlpha], `${text(formula)}: ${text(matnA)}`);
  expect('lead-in formula before the matn: found', chosenId(result) === 'alpha:11', result);
}
{
  const prose = `${text(words(25))} ${text(matnA)} ${text(words(25))}`;
  const result = find([indexAlpha], prose, { mode: 'scan' });
  expect('woven into prose (scan mode): found', chosenId(result) === 'alpha:11', result);
  const segment = find([indexAlpha], prose, { mode: 'segment' });
  expect('woven into prose (segment mode): coverage too low', segment.chosen === null, segment.chosen);
}
{
  const withLigature = text([...honorificMatn.slice(0, 8), 'ﷺ', ...honorificMatn.slice(12)]);
  const result = find([indexAlpha], withLigature);
  expect('ﷺ against the spelled-out formula: found', chosenId(result) === 'alpha:12', result);
  expect('ﷺ against the spelled-out formula: fully covered', result.chosen?.coverage === 1, result.chosen);
}
{
  const gapped = [...matnA.slice(0, 13), ...matnA.slice(16)];
  const result = find([indexAlpha], text(gapped));
  expect('three words missing mid-matn: found', chosenId(result) === 'alpha:11', result);
}
{
  const prefix = matnA.slice(0, 18);
  const result = find([indexAlpha], text(prefix));
  expect('a quoted opening: found', chosenId(result) === 'alpha:11', result);
  expect(
    'a quoted opening: partial of the ḥadīth',
    (result.chosen?.coverageOfEntry ?? 1) < 0.7 && (result.chosen?.coverageOfMatn ?? 1) < 0.7,
    result.chosen,
  );
  expect('the whole matn: its matn fully covered', find([indexAlpha], text(matnA)).chosen?.coverageOfMatn === 1);
}
{
  // 21 words then 9: the chain keeps order, so only the longer part counts.
  const reordered = [...matnA.slice(9), ...matnA.slice(0, 9)];
  const result = find([indexAlpha], text(reordered));
  expect('reordered: found on the ordered part', chosenId(result) === 'alpha:11', result);
  expect(
    'reordered: coverage is the ordered part only',
    Math.abs((result.chosen?.coverage ?? 0) - 21 / 30) < 1e-9,
    result.chosen,
  );
  const halves = [...matnA.slice(15), ...matnA.slice(0, 15)];
  expect('reordered halves: neither half covers enough', find([indexAlpha], text(halves)).chosen === null);
}
{
  const result = find([indexAlpha], text(formula));
  expect('formula only: no match', result.chosen === null && !result.ambiguous, result);
}
{
  const result = find([indexAlpha, indexBeta, indexGamma], text(matnB));
  expect('one family in two collections: none in alpha, so beta (listed first)', chosenId(result) === 'beta:41', result);
  expect(
    'one family in two collections: gamma is in `also`',
    result.also.length === 1 && result.also[0].collection === 'gamma' && result.also[0].number === 5,
    result.also,
  );
  expect('one family in two collections: not ambiguous', !result.ambiguous);
  const reversed = find([indexGamma, indexBeta], text(matnB));
  expect('one family: the caller’s order is the priority', chosenId(reversed) === 'gamma:5', reversed);
}
{
  const result = find([indexAlpha], text(shared));
  expect('two families sharing a wording: ambiguous', result.ambiguous && result.chosen === null, result);
  expect(
    'two families sharing a wording: both named',
    result.contenders.map((c) => c.number).sort((a, b) => a - b).join() === '100,200',
    result.contenders,
  );
}
{
  const result = find([indexAlpha], text(matnA.slice(0, 5)));
  expect('under the minimum run: no match', result.chosen === null && result.candidates.length === 0, result);
}
{
  // A hand-built index whose keys are the query's own windows, pointing at a
  // ḥadīth with other words: every hash "hits" and the word check refuses all.
  const query = words(12);
  const target = 11;
  const forged = await buildHadithIndex('alpha', [{ number: target, arabic: text(query) }]);
  const result = findHadithByText([forged], text(query), {
    mode: 'segment',
    arabicOf: (collection, number) => arabicOf(collection, number),
  });
  expect('forced hash collision: refused by the word check', result.chosen === null, result.chosen);
}

// ------------------------------------------------------------------ new cases

{
  // One matn under three numbers, each with its own isnād.
  const withChain = find([indexAlpha], text([...chains[1], ...repeated]));
  expect('repetitions: the printed isnād picks its own', chosenId(withChain) === 'alpha:20', withChain);
  expect('repetitions: two others counted', withChain.repetitions === 2, withChain.repetitions);
  expect(
    'repetitions: the family lists all three, the chosen first',
    withChain.family[0] === withChain.chosen &&
      withChain.family.map((m) => m.number).sort((a, b) => a - b).join() === '10,20,30',
    withChain.family.map((m) => m.number),
  );

  const bare = find([indexAlpha], text(repeated));
  expect('repetitions, no isnād, no hint: the lowest number', chosenId(bare) === 'alpha:10', bare);
  const near30 = find([indexAlpha], text(repeated), { hints: [{ collection: 'alpha', number: 29, inDatasetNumbering: true }] });
  expect('repetitions, no isnād: the member nearest the hint', chosenId(near30) === 'alpha:30', near30);
  const far = find([indexAlpha], text(repeated), { hints: [{ collection: 'alpha', number: 330, inDatasetNumbering: true }] });
  expect('a hint 300 away still orders the family', chosenId(far) === 'alpha:30', far);
  const otherCollection = find([indexAlpha], text(repeated), { hints: [{ collection: 'beta', number: 29, inDatasetNumbering: true }] });
  expect('a hint for another collection orders nothing here', chosenId(otherCollection) === 'alpha:10', otherCollection);
}
{
  const unrelated = text(words(20));
  const result = find([indexAlpha], unrelated, { hints: [{ collection: 'alpha', number: 11, inDatasetNumbering: true }] });
  expect('a hint never makes a no-match a match', result.chosen === null && result.candidates.length === 0, result);
}
{
  const near100 = find([indexAlpha], text(shared), { hints: [{ collection: 'alpha', number: 105, inDatasetNumbering: true }] });
  expect('ambiguous, one family within ±10 of the hint and agreeing: chosen', chosenId(near100) === 'alpha:100', near100);
  const between = find([indexAlpha], text(shared), { hints: [{ collection: 'alpha', number: 150, inDatasetNumbering: true }] });
  expect('ambiguous, the hint near neither: still ambiguous', between.ambiguous && between.chosen === null, between);
  // The owner's answer (2026-11-22): a number not in the dataset's numbering
  // (a printed Bukhārī or Muslim number) never settles two ḥadīth.
  const printed = find([indexAlpha], text(shared), { hints: [{ collection: 'alpha', number: 105, inDatasetNumbering: false }] });
  expect('ambiguous, a hint outside the dataset numbering settles nothing', printed.ambiguous && printed.chosen === null, printed);
  const orders = find([indexAlpha], text(repeated), { hints: [{ collection: 'alpha', number: 29, inDatasetNumbering: false }] });
  expect('a hint outside the dataset numbering still orders one ḥadīth’s copies', chosenId(orders) === 'alpha:30', orders);
}
{
  const result = find([indexBeta, indexGamma], text(matnA));
  expect('a scope without the right collection: no match, not a wrong one', result.chosen === null && !result.ambiguous, result);
}
{
  const tiny = alpha.find((e) => e.number === 204)!.arabic;
  const result = find([indexAlpha], tiny);
  expect('a ḥadīth under four words is matched by nothing', result.chosen === null, result);
}
{
  // Apparatus the dataset cannot contain, enough to sink the coverage: the
  // stripped retry finds it.
  const takhrij = `${text(matnA.slice(0, 12))} رواه ${text(words(14))}`;
  const result = find([indexAlpha], takhrij);
  expect('a takhrīj tail: found on the stripped retry', chosenId(result) === 'alpha:11' && result.stripped, result);
}

{
  // Two ḥadīth under one chain of narrators. The transmission words are real
  // (they are what `isnadEnd` reads); the names and both matns are made up.
  const chain = ['حدثنا', ...words(3), 'قال', 'حدثنا', ...words(2), 'عن', ...words(2), 'عن', ...words(2), 'قال'];
  const matnX = words(20);
  const matnY = words(20);
  const delta: IndexableEntry[] = [
    ...filler(1, 10),
    { number: 11, arabic: text([...chain, ...matnX]) },
    { number: 12, arabic: text([...chain, ...matnY]) },
    ...filler(13, 10),
  ];
  const indexDelta = await buildHadithIndex('delta', delta);
  arabicByCollection.set('delta', new Map(delta.map((e) => [e.number, e.arabic])));

  expect('isnadEnd: the matn starts after the closer past the last link', foldedIsnadEnd(text([...chain, ...matnX])) === chain.length);
  expect('isnadEnd: a matn opening without a chain has none', foldedIsnadEnd(text(['نهى', 'رسول', 'الله', 'عن', ...words(8)])) === 0);

  const chainOnly = find([indexDelta], text(chain));
  expect('the isnād alone proves no ḥadīth', chainOnly.chosen === null && chainOnly.candidates.length === 0, chainOnly);
  const chainAndOpening = find([indexDelta], text([...chain, ...matnY.slice(0, 8)]));
  expect('isnād plus the opening of the matn: that ḥadīth', chosenId(chainAndOpening) === 'delta:12', chainAndOpening);
  const matnOnly = find([indexDelta], text(matnY));
  expect('the matn without the collection’s isnād: its matn is wholly covered', matnOnly.chosen?.coverageOfMatn === 1 && (matnOnly.chosen?.coverageOfEntry ?? 1) < 1, matnOnly.chosen);
  const chainAndLittle = find([indexDelta], text([...chain, ...matnY.slice(0, 4)]));
  expect('isnād plus under MIN_MATN_WORDS of matn: refused', chainAndLittle.chosen === null && chainAndLittle.candidates.length === 0, chainAndLittle);
}

{
  // The cap across the scope: a phrase in 13 ḥadīth of each of two collections
  // is under MAX_POSTINGS in each and over it in both together.
  const phrase = words(8);
  const sharing = (from: number): IndexableEntry[] =>
    Array.from({ length: 13 }, (_, i) => ({
      number: from + i,
      arabic: text([...words(6), ...phrase, ...words(6)]),
    }));
  const indexEps = await buildHadithIndex('eps', [...filler(1, 20), ...sharing(21)]);
  const indexZeta = await buildHadithIndex('zeta', [...filler(1, 20), ...sharing(21)]);
  const named = (indexes: HadithTextIndex[]) =>
    [...candidateNumbers(indexes, text(phrase), 'segment').values()].reduce((n, list) => n + list.length, 0);
  expect('scope cap: the phrase names candidates in one collection', named([indexEps]) === 13, named([indexEps]));
  expect('scope cap: and in the other alone', named([indexZeta]) === 13, named([indexZeta]));
  expect('scope cap: over MAX_POSTINGS across both, it names none', named([indexEps, indexZeta]) === 0, named([indexEps, indexZeta]));
}
{
  // `onChunk` across a corpus past BUILD_CHUNK twice.
  const calls: number[] = [];
  await buildHadithIndex('big', filler(1, 1200), {
    onChunk: (done) => {
      calls.push(done);
    },
  });
  expect('onChunk: called after each 500 ḥadīth, with the count done', calls.join() === '500,1000', calls);
}

// ------------------------------------------------------- stored (step 3)

{
  // encode → JSON → decode: the whole-tablet transfer writes rows as NDJSON.
  const parts = encodeIndex(indexAlpha, 123);
  expect('encode: sixteen parts', parts.length === INDEX_PARTS);
  expect('encode: part 0 carries the counts and build time', parts[0].positions === indexAlpha.keys.length && parts[0].builtMs === 123 && parts[0].entries === alpha.length);
  const throughJson = JSON.parse(JSON.stringify(parts)) as HadithIndexPart[];
  const decoded = decodeIndex('alpha', throughJson);
  expect(
    'decode: the same arrays after a JSON round trip',
    decoded !== null &&
      decoded.keys.length === indexAlpha.keys.length &&
      decoded.keys.every((key, i) => key === indexAlpha.keys[i]) &&
      decoded.values.every((value, i) => value === indexAlpha.values[i]),
  );
  expect(
    'decode: the same answers from the decoded index',
    decoded !== null && chosenId(find([decoded], text(matnA))) === 'alpha:11',
  );
  expect('decode: a part of another version is refused', decodeIndex('alpha', throughJson.map((p, i) => (i === 3 ? { ...p, v: INDEX_VERSION + 1 } : p))) === null);
  expect('decode: a missing part is refused', decodeIndex('alpha', throughJson.map((p, i) => (i === 5 ? undefined : p))) === null);
  expect('decode: another collection’s parts are refused', decodeIndex('beta', throughJson) === null);
  expect('decode: a part holding another part’s keys is refused', decodeIndex('alpha', throughJson.map((p, i) => (i === 1 ? { ...throughJson[2], part: 1 } : p))) === null);
}
{
  // The loader over an in-memory store: only the QUL methods it uses. The cast
  // is the check's, not the app's: the adapter interface has ninety methods and
  // a missing one would throw loudly here, which is what a check wants.
  const resources = new Map<string, QulResource>();
  const rows = new Map<string, QulEntry>();
  const cachedHadiths = new Map<string, HadithRecord>();
  let reads = 0;
  const storage = {
    async listQulResources() {
      return [...resources.values()];
    },
    async putQulResource(resource: QulResource) {
      resources.set(resource.id, resource);
    },
    async deleteQulResource(id: string) {
      for (const key of [...rows.keys()]) if (rows.get(key)!.resourceId === id) rows.delete(key);
      resources.delete(id);
    },
    async putQulEntries(entries: QulEntry[]) {
      for (const entry of entries) rows.set(entry.id, entry);
    },
    async getQulEntry(resourceId: string, key: string) {
      return rows.get(`${resourceId}|${key}`);
    },
    // lookupHadith reads the cache first; empty unless a case puts a record in.
    async getHadith(reference: string) {
      return cachedHadiths.get(reference);
    },
    async getQulEntries(resourceId: string, keys: string[]) {
      reads++;
      return keys.map((key) => rows.get(`${resourceId}|${key}`)).filter((row): row is QulEntry => row !== undefined);
    },
  } as unknown as StorageAdapter;

  // A collection imported before the index existed: ḥadīth rows, no parts.
  const resource: QulResource = {
    id: 'qul-old', kind: 'hadith-json', name: 'alpha', fileName: 'alpha.json', byteSize: 0,
    entryCount: alpha.length, format: 'json', importedAt: 1, collection: 'alpha',
  };
  await storage.putQulResource(resource);
  // Numbers 1..n so the loader's read-back by number finds every row.
  const numbered = alpha.map((entry, i) => ({ ...entry, number: i + 1 }));
  await storage.putQulEntries(
    numbered.map((entry) => ({
      id: `qul-old|alpha:${entry.number}`,
      resourceId: 'qul-old',
      key: `alpha:${entry.number}`,
      value: { t: 'hadith-json', number: entry.number, idInBook: entry.number, chapterId: 0, chapterEnglish: '', narrator: '', text: 'english', arabic: entry.arabic },
    })),
  );
  expect('status: an old import has no index', (await hadithIndexStatus(storage, resource)).built === false);

  forgetLoadedIndexes();
  const stages = new Set<string>();
  const [first] = await loadHadithIndexes(storage, ['alpha', 'missing'], (p) => stages.add(p.stage));
  expect('self-heal: the old import is read back and indexed', first?.index.keys.length === (await buildHadithIndex('alpha', numbered)).keys.length);
  expect('self-heal: progress reports reading', stages.has('reading'));
  const status = await hadithIndexStatus(storage, resource);
  expect('self-heal: the parts are written', status.built === true && status.positions === first.index.keys.length, status);

  const readsBefore = reads;
  const [again] = await loadHadithIndexes(storage, ['alpha']);
  expect('memo: a second load reads nothing', again.index === first.index && reads === readsBefore);

  forgetLoadedIndexes();
  const [fromParts] = await loadHadithIndexes(storage, ['alpha']);
  expect('a cold load decodes the stored parts in one read', reads === readsBefore + 1 && fromParts.index.keys.length === first.index.keys.length);

  const matnNumber = numbered[alpha.findIndex((e) => e.number === 11)].number;
  const found = await searchHadithText(storage, [fromParts], text(matnA), { mode: 'segment' });
  expect('search over storage: found, with its row', found.chosen?.number === matnNumber && found.entries.get(`alpha:${matnNumber}`)?.text === 'english', found.chosen);

  // T1: the sheet's lookup, offline (no dorar, no sunnah.com), with a scope.
  {
    const http = { get: async () => { throw new Error('no network in check H'); } } as unknown as HttpClient;
    const options = { online: false, preferred: 'hadith-json' as const, sunnahApiKey: '' };
    const matched = await lookupHadith(http, storage, { reference: 'book-x#11', arabicText: text(matnA), scope: { collection: 'alpha', numberHint: 11 } }, options);
    expect('T1: a book-scoped matn is found by its text in the scope', matched.text?.status === 'matched' && matched.record?.english === 'english', matched.text);
    expect('T1: and shows no dataset number or link (alpha is no registered collection, so not citable)', matched.record?.number === '' && matched.record?.sourceUrl === null, matched.record);
    const missing = await lookupHadith(http, storage, { reference: 'book-x#1', arabicText: text(words(20)), scope: { collection: 'alpha' } }, options);
    expect('T1: an unknown text is no match, with no English', missing.text?.status === 'no-match' && !missing.record?.english, missing.text);
    const absent = await lookupHadith(http, storage, { reference: 'book-x#1', arabicText: text(matnA), scope: { collection: 'zeta-not-imported' } }, options);
    expect('T1: a scope that is not imported says so', absent.text?.status === 'not-imported', absent.text);
    const unscoped = await lookupHadith(http, storage, { reference: 'book-x#11', arabicText: text(matnA) }, options);
    expect('T1: without a scope nothing is searched by text', unscoped.text === undefined && !unscoped.record?.english, unscoped);

    // T2: lookupByText called the way runOffline calls it — the hint read from
    // the reference with the same pattern, the matn block's whole text — gives
    // the English the sheet's lookupHadith gives. (The hook's ordering and its
    // cache map are read-only here; check P cannot reach a finished on-device
    // card, since it has no model.)
    {
      const reference = 'book-x#11';
      const printed = /[#:](\d+)$/.exec(reference)?.[1];
      const offline = await lookupByText(storage, { collection: 'alpha', numberHint: printed !== undefined ? Number(printed) : undefined }, text(matnA));
      expect('T2: the on-device lookup finds what the sheet finds, the same row', offline.local?.english === matched.record?.english && offline.local?.number === 11 && matched.text?.status === 'matched', offline);
      const offlineMiss = await lookupByText(storage, { collection: 'alpha' }, text(words(20)));
      expect('T2: an unknown text gives no English on device', offlineMiss.local === null && offlineMiss.text.status === 'no-match');
      const offlineAbsent = await lookupByText(storage, { collection: 'zeta-not-imported' }, text(matnA));
      expect('T2: a collection not imported gives no English on device', offlineAbsent.local === null && offlineAbsent.text.status === 'not-imported');
    }

    // A cached sunnah.com English wins over the text match (withLocalEnglish),
    // so nothing may say the text identified it (review of 78a5be2).
    cachedHadiths.set('book-x#11', {
      reference: 'book-x#11', collection: 'alpha', number: '11', arabic: '', english: 'cached sunnah.com English',
      grade: null, sourceUrl: null, fetchedAt: 1, sourceId: 'sunnah', gradings: [],
    });
    const cachedWins = await lookupHadith(http, storage, { reference: 'book-x#11', arabicText: text(matnA), scope: { collection: 'alpha', numberHint: 11 } }, options);
    expect(
      'T1: a cached English that wins leaves no "identified by its text"',
      cachedWins.record?.english === 'cached sunnah.com English' && cachedWins.text === undefined,
      cachedWins,
    );
    cachedHadiths.clear();
  }

  // Rows lost from an old import: the rebuild refuses rather than storing a
  // partial index as complete, and the failure is not remembered.
  {
    const lost = { ...resource, id: 'qul-lost', collection: 'beta', entryCount: 3 };
    await storage.putQulResource(lost);
    await storage.putQulEntries(
      [1, 2].map((n) => ({
        id: `qul-lost|beta:${n}`, resourceId: 'qul-lost', key: `beta:${n}`,
        value: { t: 'hadith-json', number: n, idInBook: n, chapterId: 0, chapterEnglish: '', narrator: '', text: '', arabic: text(words(10)) },
      })),
    );
    const errors: string[] = [];
    const partly = await loadHadithIndexes(storage, ['beta', 'alpha'], undefined, (collection) => errors.push(collection));
    expect('self-heal: a collection missing rows is refused, not indexed', errors.join() === 'beta', errors);
    expect('self-heal: the others still load', partly.length === 1 && partly[0].index.collection === 'alpha');
    expect('self-heal: and nothing is written for it', !rows.has('qul-lost|idx:beta:0'));
    await storage.putQulEntries([{
      id: 'qul-lost|beta:3', resourceId: 'qul-lost', key: 'beta:3',
      value: { t: 'hadith-json', number: 3, idInBook: 3, chapterId: 0, chapterEnglish: '', narrator: '', text: '', arabic: text(words(10)) },
    }]);
    const [healed] = await loadHadithIndexes(storage, ['beta']);
    expect('self-heal: the failure was not memoised; complete rows index', healed?.index.collection === 'beta');
    await storage.deleteQulResource('qul-lost');
  }

  // Removed while its rebuild runs: the parts are not written after the purge.
  {
    const doomed = { ...resource, id: 'qul-doomed', collection: 'gamma', entryCount: 2 };
    await storage.putQulResource(doomed);
    await storage.putQulEntries(
      [1, 2].map((n) => ({
        id: `qul-doomed|gamma:${n}`, resourceId: 'qul-doomed', key: `gamma:${n}`,
        value: { t: 'hadith-json', number: n, idInBook: n, chapterId: 0, chapterEnglish: '', narrator: '', text: '', arabic: text(words(10)) },
      })),
    );
    let removed = false;
    await loadHadithIndexes(storage, ['gamma'], (progress) => {
      // The read-back is done and the build is next: remove it now.
      if (progress.stage === 'reading' && !removed) {
        removed = true;
        void storage.deleteQulResource('qul-doomed');
      }
    });
    expect('self-heal: no parts written for a collection removed meanwhile', ![...rows.keys()].some((key) => key.startsWith('qul-doomed|')));
  }

  // A re-import replaces the resource: the memo must not serve the old arrays.
  await storage.putQulResource({ ...resource, importedAt: 2 });
  const [afterReimport] = await loadHadithIndexes(storage, ['alpha']);
  expect('memo: a re-import is not served the old index', afterReimport.index !== fromParts.index);

  await storage.deleteQulResource('qul-old');
  expect('delete: the index parts go with the collection', ![...rows.keys()].some((key) => key.includes('idx:')));
  expect('delete: nothing is loaded afterwards', (await loadHadithIndexes(storage, ['alpha'])).length === 0);
}

// --------------------------------------------- the sharḥ's collection (4a)

{
  // Titles only, from public/catalog.json (already committed metadata), and
  // made-up titles built from the same fragments. No book text.
  const commentary = 'شروح الحديث';
  const sharh = (title: string, category = commentary) => sharhCollectionFor({ title, category });
  expect('4a: Fatḥ al-Bārī in «شروح الحديث» is a sharḥ of Bukhārī', sharh('فتح الباري بشرح البخاري') === 'bukhari');
  expect('4a: the same title outside the category is no one’s', sharh('فتح الباري بشرح البخاري', 'كتب السنة') === null);
  expect('4a: al-Minhāj is a sharḥ of Muslim', sharh('المنهاج شرح صحيح مسلم بن الحجاج') === 'muslim');
  expect('4a: a sharḥ of Riyāḍ is left to the citable path', sharh('شرح رياض الصالحين') === null);
  expect('4a: the Forty likewise', sharh('شرح الأربعين النووية') === null);
  expect('4a: a title naming two collections is no one’s', sharh('زوائد سنن ابن ماجه على صحيح البخاري') === null);
  expect('4a: «مسلم» alone is not Muslim', sharh('شرح حديث المسلم أخو المسلم') === null);
  expect('4a: Abū Dāwūd, with ى or ي', sharh('عون المعبود شرح سنن أبى داود') === 'abudawud' && sharh('شرح سنن أبي داود') === 'abudawud');
  expect('4a: at-Tirmidhī', sharh('تحفة الأحوذي بشرح جامع الترمذي') === 'tirmidhi');
  expect('4a: an-Nasāʾī by name or as al-Mujtabā', sharh('حاشية السندي على سنن النسائي') === 'nasai' && sharh('شرح المجتبى') === 'nasai');
  expect('4a: Ibn Mājah, with ه or ة', sharh('شرح سنن ابن ماجه') === 'ibnmajah' && sharh('شرح سنن ابن ماجة') === 'ibnmajah');
  expect('4a: Mālik and Aḥmad are not recognised yet (Q16)', sharh('شرح الموطأ') === null && sharh('شرح مسند أحمد') === null);

  const book = (title: string, category = commentary, hadithCollection: string | null = null) => ({ title, category, hadithCollection });
  expect('4a: scope prefers the collection stored at import', hadithScopeFor(book('فتح الباري بشرح البخاري', commentary, 'riyadussalihin')) === 'riyadussalihin');
  expect('4a: then the title (Riyāḍ)', hadithScopeFor(book('شرح رياض الصالحين')) === 'riyadussalihin');
  expect('4a: then the sharḥ rule', hadithScopeFor(book('فتح الباري بشرح البخاري')) === 'bukhari');
  expect('4a: any other book has no scope', hadithScopeFor(book('كتاب المثال في الطهارة', 'الفقه')) === null);
}

// ------------------------------------------- short quotations: the pure rule

{
  // docs/plans/hadith-short-quote.md, step 1. Made-up words again; the only
  // real Arabic is the chain words `isnadEnd` keys on and the honorific.
  const longWord = () => {
    let out = '';
    for (let i = 0; i < 5; i++) out += LETTERS[Math.floor(random() * LETTERS.length)];
    return out;
  };
  const quote = [longWord(), longWord(), longWord()];
  const chain = ['حدثنا', longWord(), 'عن', longWord(), 'قال', 'رسول', 'الله'];
  const row = (number: number, arabic: string[]): HadithJsonEntry => ({
    t: 'hadith-json',
    number,
    idInBook: number,
    chapterId: 1,
    chapterEnglish: '',
    narrator: '',
    text: `english ${number}`,
    arabic: text(arabic),
  });
  const withQuote = (number: number, matn = words(20)) => row(number, [...chain, ...matn.slice(0, 10), ...quote, ...matn.slice(10)]);
  const scan = (entries: readonly HadithJsonEntry[], phrase: readonly string[]) =>
    entries.filter((entry) => containsShortQuote(foldEntry(entry.arabic), phrase));
  const bukhari = citedWindowFor('bukhari');
  const phrase = shortQuotePhrase(text(quote));
  const phraseWords = 'words' in phrase ? phrase.words : [];
  expect('S1: a three-word quotation of fifteen letters is a phrase', phraseWords.length === 3, phrase);

  const others = Array.from({ length: 30 }, (_, i) => row(2000 + i, [...chain, ...words(25)]));
  const lone = [withQuote(1000), ...others];
  const choose = (entries: readonly HadithJsonEntry[], cited: number, window = bukhari) =>
    chooseShortQuote(scan(entries, phraseWords), cited, window);

  const far = choose(lone, 1240);
  expect('S1: one entry 240 behind the cited number is matched', far.status === 'matched' && far.entry.number === 1000 && far.distance === -240, far);
  expect('S1: 400 behind is not near', choose(lone, 1400).status === 'none-near');
  expect('S1: 20 ahead is not near', choose(lone, 980).status === 'none-near');
  expect('S1: exactly 300 behind is near', choose(lone, 1300).status === 'matched');
  expect('S1: 301 behind is not', choose(lone, 1301).status === 'none-near');
  expect('S1: exactly 10 ahead is near', choose(lone, 990).status === 'matched');
  expect('S1: 11 ahead is not', choose(lone, 989).status === 'none-near');
  expect('S1: ±10 elsewhere: 240 behind is not near', choose(lone, 1240, citedWindowFor('muslim')).status === 'none-near');
  expect('S1: Bukhārī’s window is 300 behind and 10 ahead', bukhari.behind === 300 && bukhari.ahead === 10);
  expect('S1: every other collection keeps ±10', citedWindowFor('muslim').behind === 10 && citedWindowFor('muslim').ahead === 10);

  const twoHadith = [withQuote(1000), withQuote(1100), ...others];
  const ambiguous = choose(twoHadith, 1240);
  expect('S1: the phrase in two unrelated ḥadīth is ambiguous', ambiguous.status === 'ambiguous' && ambiguous.families === 2, ambiguous);
  const farOnly = choose([withQuote(1000), withQuote(5000), ...others], 1240);
  expect('S1: ambiguous even when only one of the two is near', farOnly.status === 'ambiguous', farOnly);

  const matn = words(20);
  const copies = [withQuote(1000, matn), withQuote(1100, matn), ...others];
  const nearer = choose(copies, 1240);
  expect(
    'S1: two copies of one matn are one family; the nearer is chosen',
    nearer.status === 'matched' && nearer.entry.number === 1100 && nearer.family.join() === '1000,1100',
    nearer,
  );

  const formula = Array.from({ length: MAX_POSTINGS + 1 }, (_, i) => withQuote(3000 + i));
  const tooMany = choose(formula, 3010);
  expect('S1: in more than MAX_POSTINGS entries the phrase is a formula', tooMany.status === 'common' && tooMany.entries === MAX_POSTINGS + 1, tooMany);

  const inChain = row(1000, ['حدثنا', ...quote, 'عن', longWord(), 'قال', 'رسول', 'الله', ...words(20)]);
  expect('S1: a phrase only in the isnād does not count', !containsShortQuote(foldEntry(inChain.arabic), phraseWords));
  const fused = row(1000, [...chain, ...words(5), `و${quote[0]}`, quote[1], quote[2], ...words(5)]);
  expect('S1: «و» fused to the first word on the entry’s side counts', containsShortQuote(foldEntry(fused.arabic), phraseWords));
  const fusedFa = row(1000, [...chain, ...words(5), `ف${quote[0]}`, quote[1], quote[2], ...words(5)]);
  expect('S1: «ف» likewise', containsShortQuote(foldEntry(fusedFa.arabic), phraseWords));
  const fusedMiddle = row(1000, [...chain, ...words(5), quote[0], `و${quote[1]}`, quote[2], ...words(5)]);
  expect('S1: on a middle word it does not', !containsShortQuote(foldEntry(fusedMiddle.arabic), phraseWords));
  const partWord = row(1000, [...chain, ...words(5), `${quote[0]}${quote[1]}`, quote[2], ...words(5)]);
  expect('S1: words must be whole', !containsShortQuote(foldEntry(partWord.arabic), phraseWords));

  const refused = (input: string) => {
    const result = shortQuotePhrase(input);
    return 'refused' in result ? result.refused : 'phrase';
  };
  expect('S1: two words are too short', refused(text(quote.slice(0, 2))) === 'too-short');
  expect('S1: three words under twelve letters are too short', refused('بتث جحخ دذر') === 'too-short');
  expect('S1: the honorific alone is empty', refused('صلى الله عليه وسلم') === 'empty');
  expect('S1: six words belong to the text search', refused(text(words(6))) === 'too-long');
  // A long matn the takhrīj stripper cuts back to the three quoted words: only
  // the raw-word guard (FOUND_ISSUES 74) refuses it.
  expect(
    'S1: a long text stripped down to three words is not a short quotation',
    refused(`${text(quote)} رواه ${text(words(10))}`) === 'too-long' && refused(`${text(quote)} رواه`) === 'phrase',
  );
  expect('S1: a printed number before the quotation is not counted as a word', refused(`١٢ - ${text(quote)}`) === 'phrase');
  expect('S1: no hits at all is none-near', chooseShortQuote([], 1000, bukhari).status === 'none-near');

  // ------------------------------------------- step 2: the read over storage
  // A fake store holding one synthetic collection under the slug «bukhari», so
  // the registry's window applies. Counts rows read and calls made.
  const COUNT = 1200;
  const store = new Map<string, QulEntry>();
  let calls = 0;
  let rowsServed = 0;
  let failReads = false;
  let failFullRead = false;
  let failIndex = false;
  const resource: QulResource = {
    id: 'qul-short', kind: 'hadith-json', name: 'bukhari', fileName: 'bukhari.json', byteSize: 0,
    entryCount: COUNT, format: 'json', importedAt: 1, collection: 'bukhari',
  };
  // A Mālik import with no rows, switched on for one S4 case only.
  let includeMalik = false;
  const malikResource: QulResource = { ...resource, id: 'qul-malik', name: 'malik', fileName: 'malik.json', entryCount: 0, collection: 'malik' };
  const shortStorage = {
    async listQulResources() {
      return includeMalik ? [resource, malikResource] : [resource];
    },
    async getQulEntries(resourceId: string, keys: string[]) {
      calls++;
      if (failReads) throw new Error('read failed');
      if (failFullRead && keys.length === 500) throw new Error('full read failed');
      if (failIndex && keys.some((key) => key.startsWith('idx:'))) throw new Error('index unreadable');
      const out = keys.map((key) => store.get(`${resourceId}|${key}`)).filter((r): r is QulEntry => r !== undefined);
      rowsServed += out.length;
      return out;
    },
    // The text search self-heals the synthetic collection's index on first use.
    async putQulEntries(entries: QulEntry[]) {
      if (failIndex) throw new Error('index unwritable');
      for (const entry of entries) store.set(entry.id, entry);
    },
    async getQulEntry(resourceId: string, key: string) {
      return store.get(`${resourceId}|${key}`);
    },
    // The reference path reads the sunnah.com cache first; always empty here.
    async getHadith() {
      return undefined;
    },
  } as unknown as StorageAdapter;
  const joinNotesForCheck = (...parts: string[]) => parts.join(' ');
  const put = (entry: HadithJsonEntry) =>
    store.set(`qul-short|bukhari:${entry.number}`, { id: `qul-short|bukhari:${entry.number}`, resourceId: 'qul-short', key: `bukhari:${entry.number}`, value: entry });
  for (let n = 1; n <= COUNT; n++) put(row(n, [...chain, ...words(20)]));
  // Two unrelated ḥadīth sharing a long run, for a long quotation the text
  // search finds ambiguous (step 4's review of 15bcf20).
  const sharedRun = words(14);
  put(row(600, [...chain, ...words(12), ...sharedRun, ...words(12)]));
  put(row(700, [...chain, ...words(12), ...sharedRun, ...words(12)]));
  const reset = () => {
    calls = 0;
    rowsServed = 0;
  };
  const search = (cited: number, quotation = text(quote)) => findShortQuote(shortStorage, 'bukhari', cited, quotation);

  const repeated = words(20);
  put(withQuote(200, repeated));
  reset();
  const notNear = await search(1000);
  expect('S2: no candidate in the window: only the window is read', notNear.result.status === 'none-near' && calls === 1 && rowsServed === 311 && notNear.rowsRead === 311, { notNear, calls, rowsServed });

  put(withQuote(900, repeated));
  reset();
  const found = await search(1000);
  expect(
    'S2: a candidate in the window: the family is found over the whole collection',
    found.result.status === 'matched' && found.result.entry.number === 900 && found.result.family.join() === '200,900' && found.result.distance === -100,
    found.result,
  );
  expect('S2: rows read are the window plus every row, once', rowsServed === 311 + COUNT && found.rowsRead === rowsServed && calls === 1 + Math.ceil(COUNT / 500), { calls, rowsServed });

  put(withQuote(100));
  const twoFamilies = await search(1000);
  expect('S2: an unrelated ḥadīth far outside the window with the phrase makes it ambiguous', twoFamilies.result.status === 'ambiguous', twoFamilies.result);
  put(row(100, [...chain, ...words(20)]));

  reset();
  const short = await search(1000, text(quote.slice(0, 2)));
  expect('S2: a refused phrase reads nothing', short.result.status === 'too-short' && calls === 0);
  const absent = await findShortQuote(shortStorage, 'muslim', 1000, text(quote));
  expect('S2: a collection not imported reads nothing', absent.result.status === 'not-imported' && calls === 0);
  const pastEnd = await search(COUNT + 400);
  expect('S2: a cited number far past the file reads nothing and is not near', pastEnd.result.status === 'none-near' && calls === 0);

  const lost = store.get('qul-short|bukhari:50')!;
  store.delete('qul-short|bukhari:50');
  let refusedShort = false;
  try {
    await search(1000);
  } catch {
    refusedShort = true;
  }
  store.set('qul-short|bukhari:50', lost);
  expect('S2: a collection with a lost row is not judged (a lost row may hide a second family)', refusedShort);

  failReads = true;
  let threw = false;
  try {
    await search(1000);
  } catch {
    threw = true;
  }
  failReads = false;
  expect('S2: a read that throws reaches the caller', threw);

  // --------------------------------------------------- step 3: the card path
  // enrichSegments over the same store, no sunnah.com key: the text search
  // finds nothing for three words, so the short quotation decides.
  const deps = {
    http: { get: async () => { throw new Error('no network in check H'); } } as unknown as HttpClient,
    storage: shortStorage,
    quran: {} as QuranLookupOptions,
    sunnahApiKey: '',
    hadithScope: null,
  };
  const card = async (reference: string) =>
    (await enrichSegments([{ type: 'hadith', arabic: text(quote), english: '', reference }], deps))[0];

  const farCard = await card('bukhari:1000');
  expect(
    'S3: a short quotation 100 behind the citation: its English under the collection’s name',
    farCard.source === 'hadith-json' && farCard.english === 'english 900' && farCard.reference === 'Ṣaḥīḥ al-Bukhārī',
    farCard,
  );
  expect(
    'S3: …with the short-quotation note, the model’s citation and “quoted in part”',
    farCard.note === joinNotesForCheck(hadithShortQuoteNote('Ṣaḥīḥ al-Bukhārī'), 'The model cited bukhari:1000.', HADITH_QUOTED_IN_PART),
    farCard.note,
  );
  const closeCard = await card('bukhari:905');
  expect('S3: within ten of a family member the model’s citation stands', closeCard.reference === 'bukhari:905' && closeCard.note === HADITH_QUOTED_IN_PART, closeCard);

  // The owner's answer of 2026-11-23 (review of 13604c5): an ambiguity in the
  // whole collection does not end the card. Here the phrase is in two
  // families (200/900 and 1000), but the cited 1000 has it and none of its
  // ten neighbours do, so the old exact-number rule still gives 1000's
  // English, under the model's reference and with no short-quotation note.
  put(withQuote(1000));
  expect('S3: (the setup: the short search alone is ambiguous here)', (await search(1000)).result.status === 'ambiguous');
  const exactHolds = await card('bukhari:1000');
  expect(
    'S3: ambiguous in the collection, but the old exact-number rule holds: its English',
    exactHolds.english === 'english 1000' && exactHolds.source === 'hadith-json' && exactHolds.reference === 'bukhari:1000' && exactHolds.note === undefined,
    exactHolds,
  );
  put(row(1000, [...chain, ...words(20)]));

  const BUKHARI = 'Ṣaḥīḥ al-Bukhārī';
  put(withQuote(100));
  const ambiguousCard = await card('bukhari:1000');
  expect(
    'S4: in two ḥadīth and not at the cited number: no English, the ambiguity note and the key sentence',
    ambiguousCard.english === '' && ambiguousCard.note === joinNotesForCheck(hadithShortAmbiguousNote(BUKHARI), HADITH_KEY_WOULD_HELP),
    ambiguousCard,
  );
  const alsoMuslim = await card('bukhari:1000; muslim:5');
  expect(
    'S4: a collection not imported also cited: the same note (the reference path ran and found nothing)',
    alsoMuslim.english === '' && alsoMuslim.note === ambiguousCard.note,
    alsoMuslim,
  );
  put(row(100, [...chain, ...words(20)]));

  // Only the short search's full read fails: the old number path reads the
  // same store, and a store that fails every read was never survivable.
  failFullRead = true;
  const failedCard = await card('bukhari:1000');
  failFullRead = false;
  expect('S3: a failed full read counts as not searched: the old key note, not a thrown card', failedCard.english === '' && failedCard.note === HADITH_NEEDS_KEY, failedCard);

  // ---------------------------------------------- step 4: the truthful notes
  const noneNear = await card('bukhari:3000');
  expect(
    'S4: nothing near the cited number: says so, with the key sentence',
    noneNear.english === '' && noneNear.source === undefined &&
      noneNear.note === joinNotesForCheck(hadithImportedMissNote({ status: 'none-near', name: BUKHARI, number: '3000', entryCount: COUNT }), HADITH_KEY_WOULD_HELP),
    noneNear,
  );
  expect('S4: …and that note names the number and the file', (noneNear.note ?? '').startsWith(`No ḥadīth of the imported ${BUKHARI} near number 3000 contains these words`), noneNear.note);
  const tooShort = (await enrichSegments([{ type: 'hadith', arabic: text(quote.slice(0, 2)), english: '', reference: 'bukhari:900' }], deps))[0];
  expect('S4: two words: too short to identify, in the imported collection', (tooShort.note ?? '').startsWith(`The quotation is too short to identify by its text in the imported ${BUKHARI}.`), tooShort);
  const long = text(words(20));
  const different = (await enrichSegments([{ type: 'hadith', arabic: long, english: '', reference: 'bukhari:500' }], deps))[0];
  expect(
    'S4: a long quotation that matched nothing: the ḥadīth at the cited number and its neighbours are different ones',
    (different.note ?? '').startsWith(`No ḥadīth in the imported ${BUKHARI} matched this text, and the ḥadīth at and around number 500 (up to 10 either side) are different ones.`) && (different.note ?? '').endsWith(HADITH_KEY_WOULD_HELP),
    different,
  );
  const pastTheEnd = (await enrichSegments([{ type: 'hadith', arabic: long, english: '', reference: 'bukhari:5000' }], deps))[0];
  expect('S4: …and past the file’s end: the file has no ḥadīth of that number', (pastTheEnd.note ?? '').startsWith(`No ḥadīth in the imported ${BUKHARI} matched this text, and the file has no ḥadīth numbered 5000.`), pastTheEnd);
  // The review of 15bcf20: the "matched nothing" note only where the text
  // search really searched the collection and found no candidate, and "the
  // ḥadīth at N … are different ones" only where the number path compared
  // text.
  forgetLoadedIndexes();
  failIndex = true;
  const unloaded = (await enrichSegments([{ type: 'hadith', arabic: long, english: '', reference: 'bukhari:500' }], deps))[0];
  failIndex = false;
  forgetLoadedIndexes();
  expect('S4: the index would not load: no claim that nothing matched, the old note', unloaded.note === HADITH_NEEDS_KEY, unloaded);
  const sharedQuote = text(sharedRun);
  const ambiguousBeside = (await enrichSegments([{ type: 'hadith', arabic: sharedQuote, english: '', reference: 'bukhari:500; muslim:5' }], deps))[0];
  expect(
    'S4: the text search ambiguous beside a citation it did not search: no claim that nothing matched',
    ambiguousBeside.english === '' && ambiguousBeside.note === HADITH_NEEDS_KEY,
    ambiguousBeside,
  );
  const cutShort = (await enrichSegments([{ type: 'hadith', arabic: `${text(quote)} رواه ${text(words(10))}`, english: '', reference: 'bukhari:500' }], deps))[0];
  expect(
    'S4: a long text the stripper cuts to three words: nothing said about the ḥadīth at the number',
    cutShort.note === joinNotesForCheck(`No ḥadīth in the imported ${BUKHARI} matched this text. A model-generated translation is deliberately not substituted.`, HADITH_KEY_WOULD_HELP),
    cutShort,
  );
  expect(
    'S4: too common is its own note',
    hadithImportedMissNote({ status: 'common', name: BUKHARI, number: '1', entryCount: COUNT }).startsWith(`These words are too common in the imported ${BUKHARI}`),
  );

  // With a key set, sunnah.com was asked (and failed here): no key sentence.
  const withKey = {
    ...deps,
    sunnahApiKey: 'fake-key-for-check-h',
    http: { get: async () => ({ ok: false, status: 500, body: '' }) } as unknown as HttpClient,
  };
  const keyed = (await enrichSegments([{ type: 'hadith', arabic: text(quote), english: '', reference: 'bukhari:3000' }], withKey))[0];
  expect('S4: a key set: the reason, and no key sentence', keyed.note === hadithImportedMissNote({ status: 'none-near', name: BUKHARI, number: '3000', entryCount: COUNT }), keyed);

  // Mālik is never asked of sunnah.com: an imported Mālik miss gets no key sentence.
  includeMalik = true;
  const malik = (await enrichSegments([{ type: 'hadith', arabic: text(quote), english: '', reference: 'malik:900' }], deps))[0];
  includeMalik = false;
  expect(
    'S4: Mālik cited and imported: the reason, and no key sentence',
    (malik.note ?? '').startsWith('No ḥadīth of the imported') && !(malik.note ?? '').includes(HADITH_KEY_WOULD_HELP),
    malik,
  );
  const nothingImported = (await enrichSegments([{ type: 'hadith', arabic: text(quote), english: '', reference: 'abudawud:5' }], deps))[0];
  expect('S4: the cited collection not imported: the old key note, unchanged', nothingImported.note === HADITH_NEEDS_KEY, nothingImported);

  // ------------------------------------------ step 5: taps and on device
  // The sheet (lookupByText, lookupHadith) and the on-device translator
  // (findShortByReference, then lookupByText) over the same store: the same
  // ḥadīth as the card for the same quotation and number.
  const scoped = await lookupByText(shortStorage, { collection: 'bukhari', numberHint: 1000 }, text(quote));
  expect(
    'S5: a tap in a sharḥ with the book’s number: the card’s ḥadīth, marked a short quotation, quoted in part',
    scoped.local?.english === farCard.english && scoped.text.status === 'matched' && scoped.text.short === true && scoped.text.partial && scoped.text.repetitions === 1,
    scoped,
  );
  const unnumbered = await lookupByText(shortStorage, { collection: 'bukhari' }, text(quote));
  expect('S5: with no number the short search cannot run: no match', unnumbered.local === null && unnumbered.text.status === 'no-match', unnumbered.text);
  const twoWords = await lookupByText(shortStorage, { collection: 'bukhari', numberHint: 1000 }, text(quote.slice(0, 2)));
  expect('S5: two words: too short', twoWords.text.status === 'too-short', twoWords.text);
  const twoWordsUnnumbered = await lookupByText(shortStorage, { collection: 'bukhari' }, text(quote.slice(0, 2)));
  expect('S5: …too short with no number as well', twoWordsUnnumbered.text.status === 'too-short', twoWordsUnnumbered.text);
  const farNumber = await lookupByText(shortStorage, { collection: 'bukhari', numberHint: 3000 }, text(quote));
  expect('S5: nothing near the book’s number: none-near', farNumber.text.status === 'none-near', farNumber.text);

  const byReference = await findShortByReference(shortStorage, 'bukhari:1000', text(quote));
  expect('S5: on device, by the collection reference: the same English', byReference?.local.english === farCard.english, byReference);
  expect('S5: a book-scoped reference is not a collection reference', (await findShortByReference(shortStorage, 'book-x#1000', text(quote))) === null);
  const tapped = await lookupHadith(
    deps.http,
    shortStorage,
    { reference: 'bukhari:1000', arabicText: text(quote) },
    { online: false, preferred: 'hadith-json', sunnahApiKey: '' },
  );
  expect(
    'S5: a tap on a collection reference: the same English, "identified by a short quotation"',
    tapped.record?.english === farCard.english && tapped.record?.sourceId === 'hadith-json' && tapped.text?.status === 'matched' && tapped.text.short === true,
    { record: tapped.record, text: tapped.text },
  );
  failFullRead = true;
  const tapFailed = await findShortByReference(shortStorage, 'bukhari:1000', text(quote));
  failFullRead = false;
  expect('S5: a failed read on device is no match, not a thrown translation', tapFailed === null);

  // The review of 677c4df: the tap keeps "old rules first" (findLocalHadith
  // at the exact number wins over an ambiguous short search), and a phrase in
  // more than MAX_POSTINGS ḥadīth reads `common` on the sheet, not "no match".
  put(withQuote(1000));
  const tapExact = await lookupHadith(
    deps.http,
    shortStorage,
    { reference: 'bukhari:1000', arabicText: text(quote) },
    { online: false, preferred: 'hadith-json', sunnahApiKey: '' },
  );
  expect(
    'S5: a tap where the short search is ambiguous but the exact number holds: that ḥadīth, not marked short',
    tapExact.record?.english === 'english 1000' && tapExact.text === undefined,
    { record: tapExact.record, text: tapExact.text },
  );
  put(row(1000, [...chain, ...words(20)]));
  for (let n = 1100; n < 1100 + MAX_POSTINGS; n++) put(withQuote(n));
  const tooCommon = await lookupByText(shortStorage, { collection: 'bukhari', numberHint: 1000 }, text(quote));
  expect('S5: in more than MAX_POSTINGS ḥadīth: common, not “no match”', tooCommon.text.status === 'common', tooCommon.text);
  for (let n = 1100; n < 1100 + MAX_POSTINGS; n++) put(row(n, [...chain, ...words(20)]));

  // On device (useTranslator): the matn given to the lookups is now the
  // entity's own words (entityText), as on a tap, not its whole block. The
  // block holds the three quoted words inside a longer paragraph (review of
  // 677c4df; the owner's answer, 2026-11-23).
  const paragraph = [...words(8), ...quote, ...words(8)];
  const quoteStart = text(paragraph.slice(0, 8)).length + 1;
  const block = { id: 'b1', order: 1, text: text(paragraph) } as unknown as Block;
  const quoteEntity = {
    id: 'e1', type: 'hadith', reference: 'bukhari:1000',
    startBlockId: 'b1', startOffset: quoteStart, endBlockId: 'b1', endOffset: quoteStart + text(quote).length,
  } as unknown as Entity;
  expect('S5: entityText gives the quoted words', entityText(quoteEntity, [block]) === text(quote), entityText(quoteEntity, [block]));
  const fromEntity = await findShortByReference(shortStorage, 'bukhari:1000', entityText(quoteEntity, [block]));
  const fromBlock = await findShortByReference(shortStorage, 'bukhari:1000', block.text);
  expect(
    'S5: on device the entity’s words find the card’s ḥadīth; the whole block would not',
    fromEntity?.local.english === farCard.english && fromBlock === null,
    { fromEntity, fromBlock },
  );
}

// ------------------------------------------- the on-device cut (lane B3)
//
// `segmentSelection` decides what the on-device model may see: only the spans
// it returns as `prose`. Every case below asserts that first. Blocks and
// entities are built here as the parser and the detector build them; the
// Qurʾān index and its English are two made-up āyāt, so nothing from the
// bundled muṣḥaf is needed either.
{
  const seg = {
    quran: new QuranIndex({ edition: 'synthetic', counts: [2], ayat: [text(words(5)), text(words(5))] }),
    english: new QuranEnglish({ translation: 'synthetic', ayat: ['Synthetic āyah one.', 'Synthetic āyah two.'] }),
  };
  const blockOf = (
    id: string,
    order: number,
    type: BlockType,
    body: string,
    extra: Partial<Block> = {},
  ): Block => ({
    id,
    bookId: 'seg',
    pageId: 'seg:p1',
    order,
    type,
    text: body,
    normalized: body,
    contentHash: '',
    hadithNumber: null,
    tocNodeId: null,
    spans: [],
    anchor: null,
    ...extra,
  });
  /** As the detector marks a matn block: the whole block, numbered or not. */
  const matnEntity = (block: Block, reference: string, extra: Partial<Entity> = {}): Entity => ({
    id: `ent-${block.id}`,
    bookId: 'seg',
    startBlockId: block.id,
    startOffset: 0,
    endBlockId: block.id,
    endOffset: block.text.length,
    type: 'hadith',
    reference,
    matchQuality: reference ? 'exact' : 'unresolved',
    detectedAt: 0,
    ...extra,
  });
  const cut = (
    blocks: Block[],
    entities: Entity[],
    from: [string, number],
    to: [string, number],
    hadithLookup: (reference: string) => { arabic: string; english: string; source?: 'sunnah.com' | 'hadith-json' } | null = () => null,
  ): SegmentedSelection =>
    segmentSelection({
      blocks,
      entities,
      startBlockId: from[0],
      startOffset: from[1],
      endBlockId: to[0],
      endOffset: to[1],
      ...seg,
      hadithLookup,
    });
  /** Whether any whole word of `body` is in the text handed to the model. */
  const reachesModel = (segmented: SegmentedSelection, body: string): boolean => {
    const offered = new Set(segmented.prose.flatMap((span) => span.text.split(/\s+/)));
    return body.split(' ').some((part) => offered.has(part));
  };
  const types = (segmented: SegmentedSelection) => segmented.segments.map((segment) => segment.type);

  // FOUND_ISSUES 71. The reader's entities start as [] and load afterwards
  // (or never: a failed load, a shared chapter without them). The cut must
  // not depend on them: a matn block is ḥadīth by its type.
  {
    const before = text(words(8));
    const matn = text(words(14));
    const after = text(words(8));
    const blocks = [
      blockOf('s1', 1, 'sharh', before),
      blockOf('m1', 2, 'hadith_matn', matn, { hadithNumber: '12' }),
      blockOf('s2', 3, 'sharh', after),
    ];
    const looked: string[] = [];
    const lookup = (reference: string) => {
      looked.push(reference);
      return null;
    };

    const unloaded = cut(blocks, [], ['s1', 0], ['s2', after.length], lookup);
    expect('71: no entities yet: THE MATN NEVER REACHES THE MODEL', !reachesModel(unloaded, matn), unloaded.prose);
    expect('71: …prose, ḥadīth, prose', JSON.stringify(types(unloaded)) === '["prose","hadith","prose"]', types(unloaded));
    expect('71: …the ḥadīth in the book’s Arabic', unloaded.segments[1]?.arabic === matn, unloaded.segments[1]);
    expect('71: …with the no-offline-source note and no English', unloaded.segments[1]?.note === HADITH_NO_OFFLINE_SOURCE && unloaded.segments[1]?.english === '', unloaded.segments[1]);
    expect('71: …and nothing is looked up: there is no reference to look up', looked.length === 0, looked);
    expect('71: …the commentary on both sides is still offered', reachesModel(unloaded, before) && reachesModel(unloaded, after), unloaded.prose);

    const midway = cut(blocks, [], ['m1', matn.indexOf(' ') + 1], ['m1', matn.length]);
    expect('71: no entities, a selection inside the matn: all ḥadīth, nothing offered', JSON.stringify(types(midway)) === '["hadith"]' && midway.prose.length === 0, midway);

    // Once they load, the detector's entity covers the block and the cut is
    // the same, now with the reference looked up.
    const loaded = cut(blocks, [matnEntity(blocks[1], 'seg#12')], ['s1', 0], ['s2', after.length], lookup);
    expect('71: entities loaded: the same cut', JSON.stringify(types(loaded)) === JSON.stringify(types(unloaded)) && !reachesModel(loaded, matn), loaded);
    expect('71: …and its reference is looked up', looked.join() === 'seg#12', looked);

    // An entity that covers only part of its matn block (stored before a
    // re-parse moved the text): the rest of the block is ḥadīth too.
    const shortEntity = matnEntity(blocks[1], 'seg#12', { endOffset: matn.indexOf(' ') });
    const partial = cut(blocks, [shortEntity], ['s1', 0], ['s2', after.length]);
    expect('71: an entity short of its matn block: no word of the matn is offered', !reachesModel(partial, matn), partial.prose);
    expect(
      '71: …and the block’s text is all in ḥadīth segments, once',
      partial.segments.filter((segment) => segment.type === 'hadith').map((segment) => segment.arabic).join('') === matn,
      partial.segments,
    );

    // A verse entity inside the matn and no ḥadīth entity (stored entities
    // from before a re-detection): the verse is not cover, so the ḥadīth piece
    // encloses it and it is read in the ḥadīth's Arabic, as under the
    // detector's whole-block entity (FOUND_ISSUES 61).
    const verseAt = matn.indexOf(' ') + 1;
    const verseEnd = matn.indexOf(' ', matn.indexOf(' ', verseAt) + 1);
    const verse: Entity = {
      ...matnEntity(blocks[1], '1:1'),
      id: 'ent-verse-in-matn',
      type: 'quran',
      startOffset: verseAt,
      endOffset: verseEnd,
      textUthmani: matn.slice(verseAt, verseEnd),
    };
    const verseOnly = cut(blocks, [verse], ['s1', 0], ['s2', after.length]);
    expect('71: a verse entity in a matn with no ḥadīth entity: prose, ḥadīth, prose', JSON.stringify(types(verseOnly)) === '["prose","hadith","prose"]', types(verseOnly));
    expect('71: …the verse inside the ḥadīth’s Arabic, the matn whole, none of it offered', verseOnly.segments[1]?.arabic === matn && !reachesModel(verseOnly, matn), verseOnly);

    // Two matn blocks in one selection, with nothing between them: two
    // ḥadīth, not one, and nothing offered.
    const second = text(words(9));
    const twoMatns = [blocks[0], blocks[1], blockOf('m2', 3, 'hadith_matn', second, { hadithNumber: '13' })];
    const both = cut(twoMatns, [], ['s1', 0], ['m2', second.length]);
    expect('71: two matn blocks, no entities: prose, ḥadīth, ḥadīth', JSON.stringify(types(both)) === '["prose","hadith","hadith"]', types(both));
    expect('71: …neither matn offered', !reachesModel(both, matn) && !reachesModel(both, second), both.prose);

    // Two ḥadīth entities that overlap, with a gap before the first and after
    // the second: the gaps are ḥadīth too, the overlap shown once.
    const cuts = [0, 3, 6, 9].map((n) => matn.split(' ').slice(0, n).join(' ').length + (n ? 1 : 0));
    const overlapping = [
      matnEntity(blocks[1], 'seg#12', { id: 'ent-a', startOffset: cuts[1], endOffset: cuts[3] - 1 }),
      matnEntity(blocks[1], 'seg#12', { id: 'ent-b', startOffset: cuts[2], endOffset: matn.length - 4 }),
    ];
    const overlapped = cut(blocks, overlapping, ['m1', 0], ['m1', matn.length]);
    expect('71: overlapping ḥadīth entities with gaps: nothing offered', overlapped.prose.length === 0, overlapped);
    expect(
      '71: …and the matn is shown once, end to end',
      overlapped.segments.map((segment) => segment.arabic).join('') === matn,
      overlapped.segments.map((segment) => segment.arabic),
    );
  }

  // FOUND_ISSUES 69. A verse across a block edge has a share in each block;
  // it is one segment, not one per share.
  {
    const first = text(words(6));
    const verseA = text(words(3));
    const verseB = text(words(3));
    const last = text(words(6));
    const mushaf = text(words(6));
    const a = blockOf('v1', 1, 'sharh', `${first} ${verseA}`, { pageId: 'seg:p1' });
    const b = blockOf('v2', 2, 'sharh', `${verseB} ${last}`, { pageId: 'seg:p2' });
    const verse = (extra: Partial<Entity> = {}): Entity => ({
      id: 'ent-verse-across',
      bookId: 'seg',
      startBlockId: 'v1',
      startOffset: first.length + 1,
      endBlockId: 'v2',
      endOffset: verseB.length,
      type: 'quran',
      reference: '1:1',
      matchQuality: 'exact',
      detectedAt: 0,
      ...extra,
    });
    const verses = (segmented: SegmentedSelection) => segmented.segments.filter((segment) => segment.type === 'quran');

    const across = cut([a, b], [verse({ textUthmani: mushaf })], ['v1', 0], ['v2', b.text.length]);
    expect('69: a verse across a page break: prose, verse, prose', JSON.stringify(types(across)) === '["prose","quran","prose"]', types(across));
    expect(
      '69: …its muṣḥaf text and bundled English once',
      verses(across).length === 1 && verses(across)[0].arabic === mushaf && verses(across)[0].english === 'Synthetic āyah one.',
      verses(across),
    );
    expect('69: …and neither share is offered', !reachesModel(across, verseA) && !reachesModel(across, verseB), across.prose);

    const fromSecond = cut([a, b], [verse({ textUthmani: mushaf })], ['v2', 0], ['v2', b.text.length]);
    expect('69: a selection holding only the second share: the verse once', verses(fromSecond).length === 1 && verses(fromSecond)[0].arabic === mushaf, fromSecond.segments);

    // With no muṣḥaf text the segment shows the book's words, and the second
    // share carries them on: by a space across a page break, by a newline
    // between two paragraphs of one page.
    const bare = cut([a, b], [verse()], ['v1', 0], ['v2', b.text.length]);
    expect(
      '69: a verse with no muṣḥaf text across a page break: one segment, its two shares joined by a space',
      verses(bare).length === 1 && verses(bare)[0].arabic === `${verseA} ${verseB}`,
      verses(bare),
    );
    const onePage = cut([a, { ...b, pageId: 'seg:p1' }], [verse()], ['v1', 0], ['v2', b.text.length]);
    expect(
      '69: …and across two paragraphs of one page, by a newline',
      verses(onePage).length === 1 && verses(onePage)[0].arabic === `${verseA}\n${verseB}`,
      verses(onePage),
    );

    // The guard (review of 8e22e5b): a verse with no muṣḥaf text over three
    // blocks whose middle one is a matn. The middle share is read inside the
    // ḥadīth, so the verse's segment is no longer the last when the third
    // share comes; that share becomes a segment of its own rather than vanish.
    const middle = text(words(5));
    const third = text(words(3));
    const threeBlocks = [
      a,
      blockOf('v2m', 2, 'hadith_matn', middle, { pageId: 'seg:p2' }),
      blockOf('v3', 3, 'sharh', `${third} ${last}`, { pageId: 'seg:p3' }),
    ];
    const longVerse = verse({ endBlockId: 'v3', endOffset: third.length });
    const overThree = cut(threeBlocks, [longVerse, matnEntity(threeBlocks[1], '')], ['v1', 0], ['v3', threeBlocks[2].text.length]);
    expect('69: a verse over three blocks, a matn between: prose, verse, ḥadīth, verse, prose', JSON.stringify(types(overThree)) === '["prose","quran","hadith","quran","prose"]', types(overThree));
    expect('69: …the third share’s words are in the card, and not offered', verses(overThree)[1]?.arabic === third && !reachesModel(overThree, third), overThree.segments);
  }

  // FOUND_ISSUES 70. Prose that runs from one block into the next is one
  // span, and the two blocks' edge words stay two words.
  {
    const partA = text(words(7));
    const partB = text(words(7));
    const pageBreak = [
      blockOf('p1', 1, 'sharh', partA, { pageId: 'seg:p1' }),
      blockOf('p2', 2, 'sharh', partB, { pageId: 'seg:p2' }),
    ];
    const lastOfA = partA.split(' ').at(-1)!;
    const firstOfB = partB.split(' ')[0];
    const across = cut(pageBreak, [], ['p1', 0], ['p2', partB.length]);
    expect('70: two blocks of prose: one span', across.prose.length === 1 && across.segments.length === 1, across);
    expect(
      '70: …across a page break, joined by a space: the edge words stay apart',
      across.prose[0]?.text === `${partA} ${partB}` && reachesModel(across, lastOfA) && reachesModel(across, firstOfB),
      across.prose,
    );
    expect('70: …and a sentence Shamela broke at the page stays one sentence', splitSentences(across.prose[0]?.text ?? '').length === 1, splitSentences(across.prose[0]?.text ?? ''));

    const onePage = cut([pageBreak[0], { ...pageBreak[1], pageId: 'seg:p1' }], [], ['p1', 0], ['p2', partB.length]);
    expect('70: two paragraphs of one page: joined by a newline', onePage.prose[0]?.text === `${partA}\n${partB}`, onePage.prose);
    expect('70: …so the model gets them as two sentences', splitSentences(onePage.prose[0]?.text ?? '').length === 2, splitSentences(onePage.prose[0]?.text ?? ''));

    // Prose on both sides of a matn is not joined across it.
    const withMatn = cut(
      [pageBreak[0], blockOf('pm', 2, 'hadith_matn', text(words(9))), { ...pageBreak[1], order: 3 }],
      [],
      ['p1', 0],
      ['p2', partB.length],
    );
    expect('70: prose before and after a matn: two spans, not one', withMatn.prose.length === 2 && JSON.stringify(types(withMatn)) === '["prose","hadith","prose"]', withMatn);
  }

  // FOUND_ISSUES 73. A verified translation is of the whole ḥadīth: shown
  // whole only when the selection holds it; a part keeps the selected words,
  // with the whole English and the "quoted in part" note (the owner's answer,
  // 2026-11-26).
  {
    const before = text(words(6));
    const matn = text(words(12));
    const after = text(words(6));
    const blocks = [
      blockOf('h1', 1, 'sharh', before),
      blockOf('h2', 2, 'hadith_matn', matn, { hadithNumber: '7' }),
      blockOf('h3', 3, 'sharh', after),
    ];
    const entity = matnEntity(blocks[1], 'seg#7');
    const verifiedArabic = text(words(12));
    const sunnah = () => ({ arabic: verifiedArabic, english: 'Synthetic verified English 7.' });
    const dataset = () => ({ arabic: '', english: 'Synthetic dataset English 7.', source: 'hadith-json' as const });
    const hadithOf = (segmented: SegmentedSelection) => segmented.segments.find((segment) => segment.type === 'hadith');
    const midway = matn.indexOf(' ', matn.indexOf(' ') + 1) + 1;

    const wholeMatn = hadithOf(cut(blocks, [entity], ['h2', 0], ['h2', matn.length], sunnah));
    expect(
      '73: the whole ḥadīth selected: the verified Arabic and English, no note',
      wholeMatn?.arabic === verifiedArabic && wholeMatn?.english === 'Synthetic verified English 7.' && wholeMatn?.note === undefined,
      wholeMatn,
    );
    const wholeAndMore = hadithOf(cut(blocks, [entity], ['h1', 2], ['h3', 3], sunnah));
    expect('73: …and with commentary on both sides, still whole', wholeAndMore?.arabic === verifiedArabic && wholeAndMore?.note === undefined, wholeAndMore);

    const fromMidway = cut(blocks, [entity], ['h2', midway], ['h3', after.length], sunnah);
    const tailPart = hadithOf(fromMidway);
    expect(
      '73: part of it selected: the selected words, the whole English, "quoted in part"',
      tailPart?.arabic === matn.slice(midway) &&
        tailPart?.english === 'Synthetic verified English 7.' &&
        tailPart?.note === HADITH_QUOTED_IN_PART &&
        tailPart?.source === 'sunnah.com' &&
        tailPart?.reference === 'seg#7',
      tailPart,
    );
    expect('73: …and still not offered', !reachesModel(fromMidway, matn), fromMidway.prose);
    const headPart = hadithOf(cut(blocks, [entity], ['h1', 0], ['h2', midway - 1], sunnah));
    expect('73: a selection ending inside it: its opening words, "quoted in part"', headPart?.arabic === matn.slice(0, midway - 1) && headPart?.note === HADITH_QUOTED_IN_PART, headPart);

    // The imported dataset gives English only; the Arabic was the book's
    // words already, and a part now says so.
    const datasetPart = hadithOf(cut(blocks, [entity], ['h2', midway], ['h2', matn.length], dataset));
    expect(
      '73: hadith-json, part of it: the selected words, its English, "quoted in part"',
      datasetPart?.arabic === matn.slice(midway) && datasetPart?.source === 'hadith-json' && datasetPart?.note === HADITH_QUOTED_IN_PART,
      datasetPart,
    );
    const datasetWhole = hadithOf(cut(blocks, [entity], ['h2', 0], ['h2', matn.length], dataset));
    expect('73: hadith-json, all of it: the book’s matn, its English, no note', datasetWhole?.arabic === matn && datasetWhole?.note === undefined, datasetWhole);

    // No verified English: the note is still the no-offline-source one.
    const unverifiedPart = hadithOf(cut(blocks, [entity], ['h2', midway], ['h2', matn.length]));
    expect('73: no verified English, part of it: the no-offline-source note', unverifiedPart?.note === HADITH_NO_OFFLINE_SOURCE && unverifiedPart?.english === '', unverifiedPart);
  }
}

// ------------------------------------------- the apparatus stripper (lane B3)
//
// `stripApparatus` (retrieval/sharh.ts) feeds every matcher above. Its
// formulae are the only real Arabic here besides the honorifics; the narrators
// and the matn are made-up words, as everywhere in this check.
{
  const matn = text(words(10));
  const tail = text(words(3));
  const strip = (input: string) => stripApparatus(input);

  // FOUND_ISSUES 74: the cut falls at a word's edge.
  expect('74: «رواه» cuts the takhrīj tail', strip(`${matn} رواه ${tail}`) === matn, strip(`${matn} رواه ${tail}`));
  for (const formula of ['ورواه', 'فرواه', 'وأخرجه', 'فأخرجه', 'ومتفق عليه']) {
    expect(
      `74: «${formula}» goes with its conjunction: no «${formula[0]}» is left on the matn`,
      strip(`${matn} ${formula} ${tail}`) === matn,
      strip(`${matn} ${formula} ${tail}`),
    );
  }
  const insideWord = `${matn} ك${'رواه'} ${tail}`;
  expect('74: a formula inside a longer word does not cut', strip(insideWord) === insideWord, strip(insideWord));

  const chain = `عن ${text(words(3))} رضي الله عنه`;
  expect('74: «أنه قال» still closes the isnād', strip(`${chain} أنه قال ${matn}`) === matn, strip(`${chain} أنه قال ${matn}`));
  expect(
    '74: «قالوا» is not «قال»: the isnād ends at the colon after it, leaving no «وا»',
    strip(`${chain} أن قالوا: ${matn}`) === matn,
    strip(`${chain} أن قالوا: ${matn}`),
  );

  // FOUND_ISSUES 75: vowelled text. Each made-up word takes a fatḥa on every
  // letter; the formulae carry their usual ḥarakāt.
  const vowel = (bare: string) => [...bare].map((char) => (char === ' ' ? char : `${char}َ`)).join('');
  const vMatn = vowel(matn);
  const vTail = vowel(tail);
  expect('75: an unvowelled matn is left alone', strip(matn) === matn && strip(vMatn) === vMatn, [strip(matn), strip(vMatn)]);
  for (const formula of ['رَوَاهُ', 'وَرَوَاهُ', 'أَخْرَجَهُ', 'فَأَخْرَجَهُ', 'مُتَّفَقٌ عَلَيْهِ', 'وَفِي رِوَايَةٍ']) {
    expect(`75: a vowelled «${formula}» cuts the takhrīj tail`, strip(`${vMatn} ${formula} ${vTail}`) === vMatn, strip(`${vMatn} ${formula} ${vTail}`));
  }
  const vChain = `عَنْ ${vowel(text(words(3)))} رَضِيَ اللَّهُ عَنْهُمَا قَالَ:`;
  expect('75: a vowelled isnād closes at «قَالَ:»', strip(`${vChain} ${vMatn}`) === vMatn, strip(`${vChain} ${vMatn}`));
  expect(
    '75: …and at «أَنَّهُ قَالَ»',
    strip(`عَنْ ${vowel(text(words(3)))} رَضِيَ اللَّهُ عَنْهُ أَنَّهُ قَالَ ${vMatn}`) === vMatn,
    strip(`عَنْ ${vowel(text(words(3)))} رَضِيَ اللَّهُ عَنْهُ أَنَّهُ قَالَ ${vMatn}`),
  );

  // The isnād's window counts letters, not code points: a chain under 160
  // letters but, vowelled, over 160 code points still closes.
  const longChain = vowel(text(words(20)));
  // «عن » and the chain's letters and spaces, as the window counts them.
  const longBare = 3 + longChain.replace(/َ/g, '').length;
  expect(
    '75: a long vowelled chain (over 160 code points, under 160 letters) is still stripped',
    longChain.length > 160 && longBare < 160 && strip(`عَنْ ${longChain} رَضِيَ اللَّهُ عَنْهُ قَالَ: ${vMatn}`) === vMatn,
    { codePoints: longChain.length, letters: longBare },
  );

  // Only marks are tolerated, no letter variant (review of 6e195fd): a
  // variant-folded «أن رسول الله» matched the «ان» at the end of «كان» and cut
  // the matn after the next «قال:». A narrative opening is not an isnād, bare
  // or vowelled.
  const name = text(words(2));
  const narrative = `${name} كان رسول الله ${text(words(4))} قال: ${text(words(3))}`;
  expect('75: «كان رسول الله … قال:» opens no isnād', strip(narrative) === narrative, strip(narrative));
  const vNarrative = `${vowel(name)} كَانَ رَسُولُ اللَّهِ ${vowel(text(words(4)))} قَالَ: ${vowel(text(words(3)))}`;
  expect('75: …nor vowelled', strip(vNarrative) === vNarrative, strip(vNarrative));
  const bareAlif = `عن ${name} ان رسول الله قال: ${matn}`;
  expect('75: a bare «ان رسول الله» is left as before 75 (no variant folding)', strip(bareAlif) === bareAlif, strip(bareAlif));

  // A letter is one character and its marks, read one way only. A window
  // that let `.` take a mark too had more ways to divide a vowelled run the
  // longer it ran, and on 400 vowelled letters with no closer it ran past a
  // minute in Node (measured while writing 75); this one is linear.
  const noCloser = [...text(words(80))].map((char) => (char === ' ' ? char : `${char}َّ`)).join('');
  const startedAt = performance.now();
  const untouched = strip(`عَنْ ${noCloser}`);
  const elapsed = performance.now() - startedAt;
  expect('75: a long vowelled text with no closer is searched quickly, and left whole', elapsed < 250 && untouched === `عَنْ ${noCloser}`, { elapsed });
}

// ------------------------------------------------------------------- summary

console.log(`check H: ${passed}/${passed + failures.length}`);
if (failures.length) {
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(1);
}
