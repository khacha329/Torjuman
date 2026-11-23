// `npm run measure:short-quote` — the short-quotation rule
// (src/retrieval/hadithShortQuote.ts) measured over every hadith-json file in
// hadith-json/: docs/plans/hadith-short-quote.md, M1–M5, with the rule as
// shipped rather than a copy of it.
//
// Owner's PC only: reads the gitignored hadith-json/. Prints counts and
// numbers only, never a ḥadīth's text. Nothing is written. Seeded, so two runs
// over the same files print the same counts.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HadithJsonEntry } from '../src/types';

const { HADITH_JSON_COLLECTIONS, readHadithJson, citedWindowFor } = await import('../src/retrieval/hadithJson');
const { sameFamily, isnadEnd } = await import('../src/retrieval/hadithText');
const { chooseShortQuote, containsShortQuote, foldEntry, shortQuotePhrase } = await import(
  '../src/retrieval/hadithShortQuote'
);

const DATA = join(process.cwd(), 'hadith-json');
if (!existsSync(DATA)) {
  console.error('Needs hadith-json/ (gitignored). Nothing to measure.');
  process.exit(2);
}

interface Row {
  entry: HadithJsonEntry;
  folded: ReturnType<typeof foldEntry>;
  /** The folded words joined, space-padded: a cheap prefilter before containsShortQuote. */
  hay: string;
}

// ------------------------------------------------------------ M5: the cost

console.log('== M5: rows, size and fold time per collection ==');
const collections = new Map<string, Row[]>();
for (const collection of HADITH_JSON_COLLECTIONS) {
  const path = join(DATA, collection.fileName);
  if (!existsSync(path)) {
    console.log(`${collection.slug}: not in hadith-json/, skipped`);
    continue;
  }
  const reading = readHadithJson(JSON.parse(readFileSync(path, 'utf8')), collection.fileName);
  const started = performance.now();
  const rows = reading.entries.map(({ value }) => {
    const folded = foldEntry(value.arabic);
    return { entry: value, folded, hay: ` ${folded.words.join(' ')} ` };
  });
  const ms = performance.now() - started;
  const arabic = rows.reduce((sum, row) => sum + row.entry.arabic.length, 0);
  const folded = rows.reduce((sum, row) => sum + row.hay.length, 0);
  console.log(
    `${collection.slug.padEnd(15)} ${String(rows.length).padStart(5)} rows, Arabic ${(arabic / 1e6).toFixed(2)} M chars, folded ${(folded / 1e6).toFixed(2)} M, fold ${ms.toFixed(0)} ms`,
  );
  collections.set(collection.slug, rows);
}

/** Every row of a collection whose matn holds the phrase, as findShortQuote's full read keeps them. */
function hitsIn(slug: string, words: readonly string[]): HadithJsonEntry[] {
  // Every word but the first, which may carry a fused «و»/«ف» in the entry.
  const tail = words.length > 1 ? ` ${words.slice(1).join(' ')} ` : '';
  return (collections.get(slug) ?? [])
    .filter((row) => (tail === '' || row.hay.includes(tail)) && containsShortQuote(row.folded, words))
    .map((row) => row.entry);
}

const bukhari = collections.get('bukhari');
if (bukhari) {
  const words = foldEntry('إنما الأعمال بالخواتيم').words;
  const started = performance.now();
  for (let i = 0; i < 20; i++) hitsIn('bukhari', words);
  console.log(`one phrase scanned over folded Bukhārī: ${((performance.now() - started) / 20).toFixed(1)} ms`);
}

// --------------------------------------------- M4: the phrases in the plan

console.log('\n== M4: named phrases, under the rule as shipped (status, then the matched number) ==');
const PROBES: [string, string, number][] = [
  ['the owner’s case', 'إنما الأعمال بالخواتيم', 6607],
  ['the intentions ḥadīth, cited at 1', 'إنما الأعمال بالنيات', 1],
  ['the intentions ḥadīth, cited at 6607', 'إنما الأعمال بالنيات', 6607],
  ['a formula', 'قال رسول الله', 100],
  ['the honorific alone', 'صلى الله عليه وسلم', 100],
];
for (const [label, quotation, cited] of PROBES) {
  if (!bukhari) break;
  const phrase = shortQuotePhrase(quotation);
  if ('refused' in phrase) {
    console.log(`${label}: refused (${phrase.refused})`);
    continue;
  }
  const hits = hitsIn('bukhari', phrase.words);
  const choice = chooseShortQuote(hits, cited, citedWindowFor('bukhari'));
  const where = choice.status === 'matched' ? ` at ${choice.entry.number}, distance ${choice.distance}` : '';
  console.log(`${label}: ${hits.length} Bukhārī entries hold it; ${choice.status}${where}`);
}

// ----------------------------------------------------------------- sampling

let seed = 20261123;
const random = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

/** k consecutive matn words of a row, or null when its matn is shorter. */
function phraseFrom(row: Row, k: number): string[] | null {
  const matn = row.folded.words.slice(row.folded.matnStart);
  if (matn.length < k) return null;
  const start = Math.floor(random() * (matn.length - k + 1));
  return matn.slice(start, start + k);
}

/**
 * Whether the matched family holds the source ḥadīth: any member agreeing
 * with it, as the design-time M3 counted. `sameFamily` is not transitive, so
 * testing only the chosen member would count a right family as wrong.
 */
function familyHolds(source: Row, hits: readonly HadithJsonEntry[], family: readonly number[]): boolean {
  const members = new Set(family);
  return hits.some((entry) => members.has(entry.number) && sameFamily(source.entry.arabic, entry.arabic));
}

/** What the rule says of these words, or null when shortQuotePhrase refuses them. */
function accepted(words: string[]): string[] | null {
  const phrase = shortQuotePhrase(words.join(' '));
  return 'refused' in phrase ? null : phrase.words;
}

// --------------------------------- M1: unique in its own collection (family)

console.log('\n== M1: a phrase from a matn, searched in its own collection (one family / phrases the rule accepts) ==');
for (const [slug, rows] of collections) {
  const cells: string[] = [];
  for (const k of [3, 4, 5]) {
    let tried = 0;
    let one = 0;
    for (let s = 0; s < 300; s++) {
      const row = pick(rows);
      const raw = phraseFrom(row, k);
      const words = raw && accepted(raw);
      if (!words) continue;
      tried++;
      const choice = chooseShortQuote(hitsIn(slug, words), row.entry.number, { behind: Infinity, ahead: Infinity });
      if (choice.status === 'matched') one++;
    }
    cells.push(`${k} words ${one}/${tried}`);
  }
  console.log(`${slug.padEnd(15)} ${cells.join('   ')}`);
}

// ---------------------- M3: Bukhārī, with a cited number (the rule as shipped)

if (bukhari) {
  console.log('\n== M3: Bukhārī, the whole rule: wrong accepts under a random citation, and recall ==');
  const others = [...collections.keys()].filter((slug) => slug !== 'bukhari');
  const window = citedWindowFor('bukhari');
  for (const k of [3, 4, 5]) {
    // Wrong: a phrase from another collection's matn, a uniformly random
    // citation (pessimistic), accepted, and not the source ḥadīth's family.
    let tried = 0;
    let wrong = 0;
    const attempts = 2000;
    for (let s = 0; s < attempts; s++) {
      const source = pick(collections.get(pick(others))!);
      const raw = phraseFrom(source, k);
      const words = raw && accepted(raw);
      if (!words) continue;
      tried++;
      const cited = 1 + Math.floor(random() * 7563);
      const hits = hitsIn('bukhari', words);
      const choice = chooseShortQuote(hits, cited, window);
      if (choice.status === 'matched' && !familyHolds(source, hits, choice.family)) wrong++;
    }
    // Recall: a Bukhārī phrase cited at a modelled standard number (the file
    // drifts to 286 behind by its end: a straight line through the anchors, a
    // model, not a measurement).
    let triedR = 0;
    let found = 0;
    for (let s = 0; s < 600; s++) {
      const source = pick(bukhari);
      const raw = phraseFrom(source, k);
      const words = raw && accepted(raw);
      if (!words) continue;
      triedR++;
      const cited = source.entry.number + Math.round((286 * source.entry.number) / 7277);
      const hits = hitsIn('bukhari', words);
      const choice = chooseShortQuote(hits, cited, window);
      if (choice.status === 'matched' && familyHolds(source, hits, choice.family)) found++;
    }
    console.log(`${k} words: wrong ${wrong} of ${tried} accepted phrases (${attempts} samples); found ${found} of ${triedR}`);
  }
}

// ------------------------------------------------------------ odds and ends

const malik = collections.get('malik');
if (malik) {
  const empty = malik.filter((row) => row.folded.words.length === 0).length;
  console.log(`\nMālik rows with no Arabic words (an empty phrase would match them; refused as empty): ${empty}`);
}
const chainOnly = bukhari ? bukhari.filter((row) => isnadEnd(row.folded.words) >= row.folded.words.length).length : 0;
if (bukhari) console.log(`Bukhārī rows read as all isnād (no short quotation can match them): ${chainOnly}`);
