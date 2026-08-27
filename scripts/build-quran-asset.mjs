// Builds the bundled Qurʾān asset: node scripts/build-quran-asset.mjs
//
// Run once; the output is committed and shipped with the app. The reader never
// fetches this at runtime from anywhere but its own origin, which is what makes
// verse resolution work with the device offline.
//
// Source: the Tanzil Uthmānī (Ḥafṣ) text, mirrored on jsDelivr. Uthmānī script
// with full diacritics, which is what gets displayed; the normalized form used
// for matching is derived in the app with the same function block search uses,
// so it can never drift from it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE =
  'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quranuthmanihaf.json';

/**
 * Dr. Mustafa Khattab, The Clear Qurʾān — the translation the spec asks for.
 *
 * It was withdrawn from the public quran.com API, which is why the *online*
 * retrieval path defaults to Saheeh International. It is still published as a
 * static export here, so the offline path can carry the translation actually
 * wanted rather than a substitute. Bundling it also means verses render with no
 * network at all, which is the whole point of the offline pipeline.
 */
const ENGLISH_SOURCE =
  'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/eng-mustafakhattaba.json';
const ENGLISH_NAME = 'Dr. Mustafa Khattab, The Clear Qurʾān';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'quran', 'uthmani.json');
const englishTarget = join(here, '..', 'public', 'quran', 'khattab.json');

const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`Failed to fetch the Qurʾān text: HTTP ${response.status}`);
  process.exit(1);
}

const payload = await response.json();
const verses = payload.quran;

if (!Array.isArray(verses) || verses.length !== 6236) {
  console.error(`Expected 6236 āyāt, got ${verses?.length}`);
  process.exit(1);
}

// Verses arrive in muṣḥaf order, so surah/ayah can be recovered from a flat
// index plus the per-surah counts. That is markedly smaller than repeating the
// two numbers on all 6,236 records.
const counts = new Array(114).fill(0);
const ayat = [];

let chapter = 0;
let verseNumber = 0;

for (const verse of verses) {
  // A new sūrah restarts at āyah 1; within a sūrah the numbers must run
  // consecutively. Checking both catches a truncated or reordered source.
  if (verse.chapter === chapter + 1 && verse.verse === 1) {
    chapter = verse.chapter;
    verseNumber = 1;
  } else if (verse.chapter === chapter && verse.verse === verseNumber + 1) {
    verseNumber = verse.verse;
  } else {
    console.error(
      `Out of order at ${verse.chapter}:${verse.verse} (after ${chapter}:${verseNumber})`,
    );
    process.exit(1);
  }

  if (typeof verse.text !== 'string' || verse.text.trim() === '') {
    console.error(`Empty text at ${verse.chapter}:${verse.verse}`);
    process.exit(1);
  }

  counts[verse.chapter - 1]++;
  ayat.push(verse.text);
}

if (chapter !== 114) {
  console.error(`Expected to end on sūrah 114, ended on ${chapter}`);
  process.exit(1);
}

const bundle = {
  edition: 'Tanzil Uthmānī (Ḥafṣ)',
  source: SOURCE,
  counts,
  ayat,
};

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(bundle), 'utf8');

const bytes = Buffer.byteLength(JSON.stringify(bundle), 'utf8');
console.log(`Wrote ${ayat.length} āyāt across ${counts.length} sūrahs`);
console.log(`  al-Fātiḥah: ${counts[0]} āyāt, al-Baqarah: ${counts[1]}, an-Nās: ${counts[113]}`);
console.log(`  ${(bytes / 1024 / 1024).toFixed(2)} MB -> public/quran/uthmani.json`);

// ---------------------------------------------------------------- English

const englishResponse = await fetch(ENGLISH_SOURCE);
if (!englishResponse.ok) {
  console.error(`Failed to fetch the English translation: HTTP ${englishResponse.status}`);
  process.exit(1);
}

const englishPayload = await englishResponse.json();
const englishVerses = englishPayload.quran;

if (!Array.isArray(englishVerses) || englishVerses.length !== 6236) {
  console.error(`Expected 6236 English āyāt, got ${englishVerses?.length}`);
  process.exit(1);
}

// Same flat muṣḥaf order as the Arabic, so one index serves both.
const english = [];
let checkChapter = 0;
let checkVerse = 0;
for (const verse of englishVerses) {
  if (verse.chapter === checkChapter + 1 && verse.verse === 1) {
    checkChapter = verse.chapter;
    checkVerse = 1;
  } else if (verse.chapter === checkChapter && verse.verse === checkVerse + 1) {
    checkVerse = verse.verse;
  } else {
    console.error(`English out of order at ${verse.chapter}:${verse.verse}`);
    process.exit(1);
  }
  english.push(verse.text);
}

const englishBundle = { translation: ENGLISH_NAME, source: ENGLISH_SOURCE, ayat: english };
writeFileSync(englishTarget, JSON.stringify(englishBundle), 'utf8');

const englishBytes = Buffer.byteLength(JSON.stringify(englishBundle), 'utf8');
console.log(`\nWrote ${english.length} English āyāt (${ENGLISH_NAME})`);
console.log(`  ${(englishBytes / 1024 / 1024).toFixed(2)} MB -> public/quran/khattab.json`);
