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
import type { StorageAdapter } from '../src/platform/storage/StorageAdapter';
import type { HttpClient } from '../src/platform/http/HttpClient';
import { lookupByText, lookupHadith } from '../src/retrieval/HadithSource';
import {
  enrichSegments,
  HADITH_QUOTED_IN_PART,
  hadithShortAmbiguousNote,
  hadithShortQuoteNote,
} from '../src/retrieval/enrich';
import type { QuranLookupOptions } from '../src/retrieval/quran';
import type { HadithIndexPart, HadithJsonEntry, HadithRecord, QulEntry, QulResource } from '../src/types';

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
  const resource: QulResource = {
    id: 'qul-short', kind: 'hadith-json', name: 'bukhari', fileName: 'bukhari.json', byteSize: 0,
    entryCount: COUNT, format: 'json', importedAt: 1, collection: 'bukhari',
  };
  const shortStorage = {
    async listQulResources() {
      return [resource];
    },
    async getQulEntries(resourceId: string, keys: string[]) {
      calls++;
      if (failReads) throw new Error('read failed');
      if (failFullRead && keys.length === 500) throw new Error('full read failed');
      const out = keys.map((key) => store.get(`${resourceId}|${key}`)).filter((r): r is QulEntry => r !== undefined);
      rowsServed += out.length;
      return out;
    },
    // The text search self-heals the synthetic collection's index on first use.
    async putQulEntries(entries: QulEntry[]) {
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

  put(withQuote(100));
  const ambiguousCard = await card('bukhari:1000');
  expect(
    'S3: in two ḥadīth of the cited collection: no English, the ambiguity note',
    ambiguousCard.english === '' && ambiguousCard.note === hadithShortAmbiguousNote('Ṣaḥīḥ al-Bukhārī'),
    ambiguousCard,
  );
  const alsoMuslim = await card('bukhari:1000; muslim:5');
  expect(
    'S3: ambiguous while a collection not imported is cited: the reference path runs',
    alsoMuslim.english === '' && alsoMuslim.note !== hadithShortAmbiguousNote('Ṣaḥīḥ al-Bukhārī') && (alsoMuslim.note ?? '').includes('sunnah.com'),
    alsoMuslim,
  );
  put(row(100, [...chain, ...words(20)]));

  // Only the short search's full read fails: the old number path reads the
  // same store, and a store that fails every read was never survivable.
  failFullRead = true;
  const failedCard = await card('bukhari:1000');
  failFullRead = false;
  expect('S3: a failed full read falls back to the reference path, not a thrown card', failedCard.english === '' && (failedCard.note ?? '').includes('sunnah.com'), failedCard);
  const noneNear = await card('bukhari:3000');
  expect('S3: nothing near the citation: the reference path runs as before', noneNear.english === '' && noneNear.source === undefined, noneNear);
}

// ------------------------------------------------------------------- summary

console.log(`check H: ${passed}/${passed + failures.length}`);
if (failures.length) {
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(1);
}
