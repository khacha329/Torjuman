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
import { letterFold } from '../src/lib/arabic';

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
// Under BUILD_CHUNK, so never called; the corpus past it is near the end.
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
    (result.chosen?.coverageOfEntry ?? 1) < 0.7,
    result.chosen,
  );
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

  const bare = find([indexAlpha], text(repeated));
  expect('repetitions, no isnād, no hint: the lowest number', chosenId(bare) === 'alpha:10', bare);
  const near30 = find([indexAlpha], text(repeated), { hints: [{ collection: 'alpha', number: 29 }] });
  expect('repetitions, no isnād: the member nearest the hint', chosenId(near30) === 'alpha:30', near30);
  const far = find([indexAlpha], text(repeated), { hints: [{ collection: 'alpha', number: 330 }] });
  expect('a hint 300 away still orders the family', chosenId(far) === 'alpha:30', far);
  const otherCollection = find([indexAlpha], text(repeated), { hints: [{ collection: 'beta', number: 29 }] });
  expect('a hint for another collection orders nothing here', chosenId(otherCollection) === 'alpha:10', otherCollection);
}
{
  const unrelated = text(words(20));
  const result = find([indexAlpha], unrelated, { hints: [{ collection: 'alpha', number: 11 }] });
  expect('a hint never makes a no-match a match', result.chosen === null && result.candidates.length === 0, result);
}
{
  const near100 = find([indexAlpha], text(shared), { hints: [{ collection: 'alpha', number: 105 }] });
  expect('ambiguous, one family within ±10 of the hint and agreeing: chosen', chosenId(near100) === 'alpha:100', near100);
  const between = find([indexAlpha], text(shared), { hints: [{ collection: 'alpha', number: 150 }] });
  expect('ambiguous, the hint near neither: still ambiguous', between.ambiguous && between.chosen === null, between);
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

// ------------------------------------------------------------------- summary

console.log(`check H: ${passed}/${passed + failures.length}`);
if (failures.length) {
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(1);
}
