// Merges the two glossary source files into one import-ready list.
//
//   npm run glossary
//
// Precedence: the Riyāḍ project glossary overwrites the retained-terms
// glossary wherever both define the same term. Terms only one file defines are
// kept as they are.
//
// Matching is done on the *normalized* Arabic — the same fold the reader's
// search uses — so ة/ه, ى/ي and hamza variants do not produce two entries for
// one term. The display form written out is the winning file's spelling.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from '../src/lib/arabic';

interface SourceEntry {
  arabic: string;
  english: string;
  note: string;
}

interface SourceFile {
  source: string;
  sections: { name: string; entries: SourceEntry[] }[];
  suggestedButNotInTables?: { note: string; entries: SourceEntry[] };
}

const ROOT = process.cwd();
const readSource = (name: string): SourceFile =>
  JSON.parse(readFileSync(join(ROOT, 'glossary-sources', name), 'utf8'));

const retained = readSource('retained.json');
const project = readSource('project.json');

const flatten = (file: SourceFile): SourceEntry[] =>
  file.sections.flatMap((section) => section.entries);

const retainedEntries = flatten(retained);
const projectEntries = flatten(project);

console.log(`retained: ${retainedEntries.length} entries`);
console.log(`project:  ${projectEntries.length} entries`);

// ---------------------------------------------------------------- sanity

let problems = 0;

function assertArabic(entries: SourceEntry[], label: string) {
  for (const entry of entries) {
    // Every term must be Arabic script (the ﷺ ligature lives in the Arabic
    // Presentation Forms block, so allow that range too). This is the guard
    // against a transcription slip leaving Latin text in the Arabic column.
    if (!/^[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿\s]+$/u.test(entry.arabic)) {
      console.log(`  PROBLEM ${label}: non-Arabic in the Arabic column — "${entry.arabic}"`);
      problems++;
    }
    if (entry.english.trim() === '') {
      console.log(`  PROBLEM ${label}: empty English for "${entry.arabic}"`);
      problems++;
    }
  }
}

assertArabic(retainedEntries, 'retained');
assertArabic(projectEntries, 'project');

function findInternalDuplicates(entries: SourceEntry[], label: string) {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const key = normalize(entry.arabic);
    const previous = seen.get(key);
    if (previous !== undefined && previous !== entry.english) {
      console.log(
        `  NOTE ${label}: "${entry.arabic}" appears twice — "${previous}" then "${entry.english}"`,
      );
    }
    seen.set(key, entry.english);
  }
}

findInternalDuplicates(retainedEntries, 'retained');
findInternalDuplicates(projectEntries, 'project');

// ----------------------------------------------------------------- merge

const merged = new Map<string, SourceEntry & { from: 'retained' | 'project' }>();

for (const entry of retainedEntries) {
  merged.set(normalize(entry.arabic), { ...entry, from: 'retained' });
}

interface Override {
  arabic: string;
  was: string;
  now: string;
}

const overrides: Override[] = [];
const additions: SourceEntry[] = [];

for (const entry of projectEntries) {
  const key = normalize(entry.arabic);
  const existing = merged.get(key);

  if (existing) {
    if (existing.english !== entry.english) {
      overrides.push({ arabic: entry.arabic, was: existing.english, now: entry.english });
    }
  } else {
    additions.push(entry);
  }

  merged.set(key, { ...entry, from: 'project' });
}

// ---------------------------------------------------------------- report

console.log(`\n=== ${overrides.length} entries overwritten by the project glossary ===`);
const width = Math.max(...overrides.map((o) => o.was.length));
for (const override of overrides) {
  console.log(`  ${override.arabic.padEnd(22)} ${override.was.padEnd(width)}  ->  ${override.now}`);
}

console.log(`\n=== ${additions.length} entries added by the project glossary ===`);
console.log(
  '  ' + additions.map((entry) => entry.arabic).join('، '),
);

const kept = [...merged.values()].filter((entry) => entry.from === 'retained');
console.log(`\n=== ${kept.length} entries kept from the retained glossary (project has no term) ===`);
console.log('  ' + kept.map((entry) => entry.arabic).join('، '));

// Near-duplicates worth the user's eye: different terms, same English.
const byEnglish = new Map<string, string[]>();
for (const entry of merged.values()) {
  const list = byEnglish.get(entry.english) ?? [];
  list.push(entry.arabic);
  byEnglish.set(entry.english, list);
}
const collisions = [...byEnglish.entries()].filter(([, terms]) => terms.length > 1);
if (collisions.length > 0) {
  console.log(`\n=== ${collisions.length} English glosses used by more than one term ===`);
  for (const [english, terms] of collisions) {
    console.log(`  "${english}" <- ${terms.join('، ')}`);
  }
}

// How many of the final entries carry a transliteration rather than plain
// English. The two source files take different approaches to this, so the
// merged list is a blend; worth surfacing rather than discovering later.
const final = [...merged.values()];
const transliterated = final.filter((entry) =>
  /[āīūḥṣḍṭẓʿʾṢḤĪĀ]/u.test(entry.english),
).length;
const leaveInArabic = final.filter((entry) => entry.english.startsWith('(leave')).length;

console.log(`\n=== Final list ===`);
console.log(`  total entries:                  ${final.length}`);
console.log(`  plain-English gloss:            ${final.length - transliterated - leaveInArabic}`);
console.log(`  transliterated gloss:           ${transliterated}`);
console.log(`  "(leave in Arabic)" instruction:${String(leaveInArabic).padStart(4)}`);

// ----------------------------------------------------------------- write

const output = final
  .sort((a, b) => a.arabic.localeCompare(b.arabic, 'ar'))
  .map((entry) => ({
    arabic: entry.arabic,
    english: entry.english,
    note: entry.note || null,
  }));

const target = join(ROOT, 'glossary-import.json');
writeFileSync(target, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(`\nWrote ${output.length} entries to glossary-import.json`);
console.log(problems === 0 ? 'No problems found.' : `${problems} PROBLEM(S) — see above.`);
process.exit(problems === 0 ? 0 : 1);
