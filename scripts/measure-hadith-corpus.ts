// `npm run measure:hadith-corpus` — facts about every hadith-json file in
// hadith-json/, before any index is built (docs/plans/hadith-text-matching.md,
// step 1). Turns the plan's size estimates into measurements and records how
// each file's `idInBook` behaves, which decides whether the cumulative number
// the importer derives is a number anyone would cite.
//
// Owner's PC only: reads the gitignored hadith-json/. No fixtures needed, no
// DOM, nothing is written.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { letterFold } = await import('../src/lib/arabic');

const DATA = join(process.cwd(), 'hadith-json');
if (!existsSync(DATA)) {
  console.error('Needs hadith-json/ (gitignored). Nothing to measure.');
  process.exit(2);
}

/** The plan's starting values (docs/plans/hadith-text-matching.md, "The index"). */
const WINDOW = 4;
const MAX_POSTINGS = 25;

interface Row {
  idInBook: number;
  chapterId: number;
  arabic: string;
  english: { narrator: string; text: string };
}

/** 32-bit FNV-1a over UTF-16 code units: plain JS, the plan's choice (trap 9). */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const mb = (n: number) => (n / 1_048_576).toFixed(2) + ' MB';

/**
 * How `idInBook` relates to the file: the word the owner needs, not a number.
 * Evaluated over the rows in FILE order.
 */
function describeIdInBook(rows: Row[]): string {
  const ids = rows.map((row) => row.idInBook);
  const unique = new Set(ids).size === ids.length;
  const monotonic = ids.every((id, i) => i === 0 || id > ids[i - 1]);
  const continuous = unique && Math.max(...ids) === ids.length && Math.min(...ids) === 1;

  const byChapter = new Map<number, number[]>();
  for (const row of rows) {
    const list = byChapter.get(row.chapterId) ?? [];
    list.push(row.idInBook);
    byChapter.set(row.chapterId, list);
  }
  const restarts = [...byChapter.values()].filter((list) => list[0] === 1).length;

  const parts = [
    unique ? 'unique' : 'NOT unique',
    continuous ? `continuous 1–${ids.length}` : `range ${Math.min(...ids)}–${Math.max(...ids)}`,
    monotonic ? 'increasing in file order' : 'NOT increasing in file order',
  ];
  if (restarts > 1) parts.push(`restarts at 1 in ${restarts} of ${byChapter.size} chapters`);
  return parts.join(', ');
}

/** The chapter order the importer uses: chapter id, then idInBook. */
function cumulative(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => a.chapterId - b.chapterId || a.idInBook - b.idInBook);
}

/**
 * Known ḥadīth to test a numbering against, by their Arabic (folded). The
 * number printed beside each is the standard citation, stated where it is
 * certain and left out where it is not.
 */
const ANCHORS: { label: string; folded: string; standard?: string }[] = [
  { label: '«إنما الأعمال بالنيات»', folded: 'انما الاعمال بالنيات', standard: 'Bukhārī 1, Muslim 1907' },
  { label: '«بني الإسلام على خمس»', folded: 'بني الاسلام علي خمس', standard: 'Bukhārī 8, Muslim 16' },
  { label: '«كلمتان خفيفتان على اللسان»', folded: 'كلمتان خفيفتان علي اللسان', standard: 'Bukhārī 7563 (the last)' },
];

for (const file of readdirSync(DATA).filter((f) => f.endsWith('.json')).sort()) {
  const book = JSON.parse(readFileSync(join(DATA, file), 'utf8')) as {
    metadata: { length: number; english: { title: string }; arabic: { title: string } };
    chapters: { id: number }[];
    hadiths: Row[];
  };
  const rows = book.hadiths;

  let arabicBytes = 0;
  let englishBytes = 0;
  const wordCounts: number[] = [];
  const postings = new Map<number, number[]>();
  let positions = 0;

  rows.forEach((row, index) => {
    arabicBytes += bytes(row.arabic);
    englishBytes += bytes(row.english.narrator) + bytes(row.english.text);
    const words = letterFold(row.arabic).split(' ').filter(Boolean);
    wordCounts.push(words.length);
    for (let at = 0; at + WINDOW <= words.length; at++) {
      positions++;
      const key = fnv1a(words.slice(at, at + WINDOW).join(' '));
      const list = postings.get(key);
      if (!list) postings.set(key, [index]);
      else if (list[list.length - 1] !== index) list.push(index);
    }
  });

  const sorted = [...wordCounts].sort((a, b) => a - b);
  const shared = [...postings.values()].filter((list) => list.length > 1).length;
  const capped = [...postings.values()].filter((list) => list.length > MAX_POSTINGS);
  const droppedPostings = capped.reduce((total, list) => total + list.length, 0);
  const keptPositions = positions - droppedPostings;
  // Two parallel Uint32 arrays (key, packed number+word position): 8 bytes a
  // position, and base64 for the NDJSON-safe row costs a third more.
  const indexBytes = keptPositions * 8;

  console.log(`\n=== ${file} — ${book.metadata.english.title} / ${book.metadata.arabic.title} ===`);
  console.log(`  ḥadīth ${rows.length} (metadata.length ${book.metadata.length}), chapters ${book.chapters.length}`);
  console.log(`  Arabic ${mb(arabicBytes)}, English ${mb(englishBytes)}`);
  console.log(
    `  words ${wordCounts.reduce((a, b) => a + b, 0)}, median ${sorted[Math.floor(sorted.length / 2)]}, longest ${sorted[sorted.length - 1]}, under ${WINDOW} words: ${wordCounts.filter((n) => n < WINDOW).length}`,
  );
  console.log(
    `  ${WINDOW}-word positions ${positions}; distinct ${postings.size}; in more than one ḥadīth ${shared}; ` +
      `over the ${MAX_POSTINGS}-ḥadīth cap ${capped.length} (drops ${droppedPostings} positions, ${((100 * droppedPostings) / positions).toFixed(1)}%)`,
  );
  console.log(
    `  index ≈ ${mb(indexBytes)} raw, ${mb((indexBytes * 4) / 3)} as base64; collection in IndexedDB ≈ ${mb(arabicBytes + englishBytes + (indexBytes * 4) / 3)}`,
  );

  console.log(`  idInBook in file order: ${describeIdInBook(rows)}`);
  const chapterIds = book.chapters.map((chapter) => chapter.id);
  console.log(
    `  chapter ids listed ${chapterIds.slice(0, 3).join(',')}…${chapterIds.slice(-3).join(',')}; chapter 0 ${chapterIds.includes(0) ? `present, at position ${chapterIds.indexOf(0) + 1} of ${chapterIds.length}` : 'absent'}`,
  );

  const ordered = cumulative(rows);
  const disagree = ordered.filter((row, i) => row.idInBook !== i + 1).length;
  console.log(`  importer numbering (chapter id, then idInBook) differs from idInBook for ${disagree} of ${rows.length}`);

  for (const anchor of ANCHORS) {
    const hits = ordered
      .map((row, i) => ({ row, number: i + 1 }))
      .filter(({ row }) => letterFold(row.arabic).includes(anchor.folded))
      .slice(0, 4);
    if (hits.length === 0) continue;
    console.log(
      `  anchor ${anchor.label} [standard: ${anchor.standard ?? 'n/a'}] → importer number ${hits.map((h) => h.number).join(', ')}; idInBook ${hits.map((h) => h.row.idInBook).join(', ')}`,
    );
  }
}
