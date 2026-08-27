// Runs the real parsers over real fetched Shamela HTML.
//
//   npm run verify
//
// The fixtures in fixtures/ are unmodified responses from shamela.ws. This is
// how the "inspect real markup, don't guess selectors" rule is kept honest: if
// Shamela changes its templates, this fails loudly instead of the app silently
// importing empty pages.
//
// jsdom is a devDependency used only here; nothing in src/ imports it.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const g = globalThis as Record<string, unknown>;
g.DOMParser = dom.window.DOMParser;
g.Node = dom.window.Node;
g.document = dom.window.document;
// Selection resolution reads window.getSelection(), so the reader's own
// globals have to be present for those tests to exercise the real code.
g.window = dom.window;
g.NodeFilter = dom.window.NodeFilter;
g.HTMLElement = dom.window.HTMLElement;

const { parseBookPage } = await import('../src/shamela/parseBook');
const { parsePage, parseBlocks } = await import('../src/shamela/parsePage');
const { detectBlockType } = await import('../src/shamela/structure');
const { normalize, parseArabicNumber } = await import('../src/lib/arabic');
const { parseCitation } = await import('../src/shamela/quranRefs');
const { sha256 } = await import('../src/lib/hash');

const FIXTURES = join(process.cwd(), 'fixtures');
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok    ${label} = ${JSON.stringify(actual)}`);
  }
}

function expect(label: string, condition: boolean, detail = ''): void {
  checks++;
  if (!condition) {
    failures++;
    console.log(`  FAIL  ${label} ${detail}`);
  } else {
    console.log(`  ok    ${label} ${detail}`);
  }
}

// ---------------------------------------------------------------- arabic

console.log('\n=== Arabic normalization ===');
check('harakat stripped', normalize('مُحَمَّدٌ'), 'محمد');
check('alef forms folded', normalize('أإآٱ'), 'اااا');
check('alef maqsura → ya', normalize('على'), 'علي');
check('ta marbuta → ha', normalize('صلاة'), 'صلاه');
check('hamza carriers folded', normalize('مؤمن ملائكة'), 'مومن ملايكه');
check('tatweel stripped', normalize('محـــمد'), 'محمد');
check('whitespace collapsed', normalize('  a   b  '), 'a b');

// The acceptance criterion: a query typed without harakāt must find text with them.
const vocalised = 'وَإِذْ تَأَذَّنَ رَبُّكُمْ لَئِنْ شَكَرْتُمْ لَأَزِيدَنَّكُمْ';
expect(
  'undiacritised query matches diacritised text',
  normalize(vocalised).includes(normalize('لئن شكرتم')),
  `→ "${normalize(vocalised)}"`,
);

check('arabic numerals parsed', parseArabicNumber('٦٨١'), 681);
check('sha256 is real sha256', sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

// ------------------------------------------------------------- citations

console.log('\n=== Qurʾān citations (both typographic styles in 9260) ===');
check('(البينة: ٥)', parseCitation('(البينة: ٥)')?.reference, '98:5');
check('(الحج: من الآية٣٧)', parseCitation('(الحج: من الآية٣٧)')?.reference, '22:37');
check('(الشعراء: ٢١٨/٢١٩)', parseCitation('(الشعراء: ٢١٨/٢١٩)')?.reference, '26:218');
check('[الزمر: ٥٣]', parseCitation('[الزمر: ٥٣]')?.reference, '39:53');
check('[الأعراف: ١٥٦]', parseCitation('[الأعراف: ١٥٦]')?.reference, '7:156');
check('(آل عمران: ٥)', parseCitation('(آل عمران: ٥)')?.reference, '3:5');
check('(إبراهيم: ٧)', parseCitation('(إبراهيم: ٧)')?.reference, '14:7');
check('prose is not a citation', parseCitation('وقال تعالى: إن الله'), null);

// ----------------------------------------------------------- book page

console.log('\n=== Book landing page (9260) ===');
const book = parseBookPage(read('book-9260.html'), 9260);
if (!book) {
  failures++;
  console.log('  FAIL  parseBookPage returned null');
} else {
  check('title', book.title, 'شرح رياض الصالحين');
  check('author', book.author, 'محمد بن صالح بن محمد العثيمين (ت ١٤٢١هـ)');
  check('publisher', book.publisher, 'دار الوطن للنشر، الرياض');
  check('edition', book.edition, '١٤٢٦ هـ');
  check('volumeCount', book.volumeCount, 6);
  check('category', book.category, 'شروح الحديث');
  check('structureProfile', book.structureProfile, 'hadith-commentary');
  expect('toc nodes parsed', book.toc.length > 300, `(${book.toc.length} nodes)`);
  expect('toc is nested', book.toc.some((n) => n.depth === 1), '');
  expect(
    'toc root has the expected first entry',
    book.toc[0].title === 'المقدمة' && book.toc[0].pageIndex === 1,
    `→ "${book.toc[0].title}" p${book.toc[0].pageIndex}`,
  );
  expect(
    'no branch left collapsed (9260 ships the full tree inline)',
    book.collapsedBranches.length === 0,
    `(${book.collapsedBranches.length} collapsed)`,
  );
}

// ---------------------------------------------------------- content pages

console.log('\n=== Content pages ===');
const pageFiles = readdirSync(FIXTURES)
  .filter((f) => f.startsWith('page-9260-'))
  .sort((a, b) => Number(a.match(/-(\d+)\.html/)![1]) - Number(b.match(/-(\d+)\.html/)![1]));

for (const file of pageFiles) {
  const index = Number(file.match(/-(\d+)\.html/)![1]);
  const page = parsePage(read(file), 9260);
  if (!page) {
    failures++;
    console.log(`  FAIL  ${file}: parsePage returned null`);
    continue;
  }
  checks++;
  const ok = page.pageIndex === index && page.blocks.length > 0;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  p${String(index).padStart(4)}  ` +
      `ص=${String(page.printPage).padStart(4)} ج=${page.volume}  ` +
      `blocks=${String(page.blocks.length).padStart(2)}  ` +
      `totalPages=${page.totalPages}  vols=[${page.volumeStarts.join(',')}]`,
  );
}

const p500 = parsePage(read('page-9260-500.html'), 9260)!;
check('p500 print page (ص)', p500.printPage, 505);
check('p500 volume (ج)', p500.volume, 1);
check('total pages discovered from pager', p500.totalPages, 3784);
check('volume start pages', p500.volumeStarts, [1, 587, 1201, 1871, 2559, 3080]);
expect(
  'contentHtml is the nass container only, not the whole page',
  p500.contentHtml.startsWith('<div class="nass') && p500.contentHtml.length < 6000,
  `(${p500.contentHtml.length} bytes vs ${read('page-9260-500.html').length} on the wire)`,
);
expect(
  'copy-button furniture removed from block text',
  !p500.blocks.some((b) => b.text.includes('fa-copy')),
  '',
);
expect('anchors preserved', p500.blocks[0].anchor === 'p1', `→ ${p500.blocks[0].anchor}`);

// --------------------------------------------------- structure detection

console.log('\n=== Structure detection on real pages ===');

function classify(file: string, profile: 'generic' | 'hadith-commentary') {
  const page = parsePage(read(file), 9260)!;
  return page.blocks.map((block) => ({
    ...detectBlockType({
      text: block.text,
      spans: block.spans,
      wholeBlockIsHeading: block.wholeBlockIsHeading,
      profile,
    }),
    text: block.text,
    spans: block.spans,
  }));
}

for (const [file, label] of [
  ['page-9260-8.html', 'p8 — start of bāb 1 (heading + Qurʾān + الشرح marker)'],
  ['page-9260-1500.html', 'p1500 — start of bāb 51 (heading, verses, two hadiths)'],
  ['page-9260-30.html', 'p30 — mid-commentary with a numbered hadith'],
] as const) {
  console.log(`\n  ${label}`);
  for (const block of classify(file, 'hadith-commentary')) {
    const preview = block.text.slice(0, 62).replace(/\s+/g, ' ');
    const num = block.hadithNumber ? ` #${block.hadithNumber}` : '';
    const quran = block.spans.filter((s) => s.kind === 'quran').length;
    const refs = block.spans
      .filter((s) => s.kind === 'quran_ref' && s.reference)
      .map((s) => s.reference)
      .join(',');
    console.log(
      `    ${block.type.padEnd(14)}${num.padEnd(6)} ` +
        `${quran ? `q×${quran} ` : '     '}${refs ? `[${refs}] ` : ''}${preview}…`,
    );
  }
}

const p1500 = classify('page-9260-1500.html', 'hadith-commentary');
expect('p1500 first block is the bāb heading', p1500[0].type === 'chapter_title', `→ ${p1500[0].type}`);
expect(
  'p1500 finds both numbered matns plus the variant narration',
  p1500.filter((b) => b.type === 'hadith_matn').length === 3,
  `→ ${p1500.filter((b) => b.type === 'hadith_matn').length}`,
);
// The four "وقال تعالى: (verse) [ref]." paragraphs are typographically
// identical in the print and must not be typed inconsistently.
check(
  'p1500 types its four verse paragraphs alike',
  p1500.slice(1, 5).map((b) => b.type),
  ['quran', 'quran', 'quran', 'quran'],
);
check(
  'p1500 captures the book-wide hadith numbers (١/٤١٢ → 412)',
  p1500.filter((b) => b.hadithNumber).map((b) => b.hadithNumber),
  ['412', '413'],
);
expect(
  'p1500 verses carry resolved references',
  p1500.flatMap((b) => b.spans).filter((s) => s.kind === 'quran_ref' && s.reference).length >= 4,
  '',
);
expect(
  'p1500 commentary blocks typed as sharh, not body',
  p1500.some((b) => b.type === 'sharh') || p1500.every((b) => b.type !== 'body'),
  '',
);

const p30 = classify('page-9260-30.html', 'hadith-commentary');
check('p30 hadith number ٤ captured', p30.filter((b) => b.hadithNumber).map((b) => b.hadithNumber), ['4']);

// The generic profile must not paint hadith-commentary types onto other books.
console.log('\n  Generic profile on the same page (a tafsīr/fiqh book must still render):');
const generic = classify('page-9260-1500.html', 'generic');
for (const block of generic) {
  console.log(`    ${block.type.padEnd(14)} ${block.text.slice(0, 58).replace(/\s+/g, ' ')}…`);
}
expect(
  'generic profile emits no hadith_matn / takhrij / sharh',
  generic.every((b) => !['hadith_matn', 'takhrij', 'sharh'].includes(b.type)),
  '',
);
expect(
  'generic profile still finds the chapter heading',
  generic[0].type === 'chapter_title',
  `→ ${generic[0].type}`,
);

// ------------------------------------------------- ingest pipeline (offline)

console.log('\n=== Ingest pipeline ===');

const { storePage, reparsePage, TocIndex } = await import('../src/ingest/importer');

type AnyRecord = Record<string, unknown>;

/** In-memory stand-in for the parts of StorageAdapter the ingest path uses. */
function makeFakeStorage() {
  const pages = new Map<string, AnyRecord>();
  const blocks = new Map<string, AnyRecord>();
  const counters = new Map<string, number>();

  return {
    pages,
    blocks,
    async putPage(page: AnyRecord) {
      pages.set(page.id as string, page);
    },
    async getPage(bookId: string, pageIndex: number) {
      return pages.get(`${bookId}:p${pageIndex}`);
    },
    async listBlocksForPage(pageId: string) {
      return [...blocks.values()]
        .filter((b) => b.pageId === pageId)
        .sort((a, b) => (a.order as number) - (b.order as number));
    },
    async deleteBlocksForPage(pageId: string) {
      for (const [id, block] of blocks) if (block.pageId === pageId) blocks.delete(id);
    },
    async putBlocks(rows: AnyRecord[]) {
      for (const row of rows) blocks.set(row.id as string, row);
    },
    async reserveBlockCounters(bookId: string, count: number) {
      const current = counters.get(bookId) ?? 0;
      counters.set(bookId, current + count);
      return current;
    },
  };
}

const fakeBook = {
  id: 'shamela-9260',
  shamelaId: 9260,
  title: 'شرح رياض الصالحين',
  author: '',
  publisher: '',
  edition: '',
  volumeCount: 6,
  category: 'شروح الحديث',
  structureProfile: 'hadith-commentary' as const,
  importedAt: 0,
  importStatus: 'in-progress' as const,
  totalPages: 3784,
  fetchedPages: 0,
  volumeStarts: [1, 587, 1201, 1871, 2559, 3080],
};

{
  const storage = makeFakeStorage();
  const tocIndex = new TocIndex(
    (book?.toc ?? []).map((node) => ({
      id: `shamela-9260:toc${node.order}`,
      bookId: 'shamela-9260',
      parentId: null,
      title: node.title,
      pageIndex: node.pageIndex,
      order: node.order,
      depth: node.depth,
    })),
  );

  // Ingest three pages, as the crawler would.
  for (const p of [8, 500, 1500]) {
    const parsed = parsePage(read(`page-9260-${p}.html`), 9260)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await storePage(storage as any, fakeBook as any, parsed as any, tocIndex);
  }

  expect('pages stored', storage.pages.size === 3, `(${storage.pages.size})`);
  expect('blocks stored', storage.blocks.size === 15, `(${storage.blocks.size})`);

  const all = [...storage.blocks.values()];
  expect(
    'every block has a normalized field and a content hash',
    all.every((b) => typeof b.normalized === 'string' && (b.contentHash as string).length === 64),
    '',
  );
  expect(
    'display text keeps its harakāt (normalization never touched it)',
    all.some((b) => /[ً-ْ]/.test(b.text as string)),
    '',
  );
  expect(
    'normalized field has no harakāt',
    all.every((b) => !/[ً-ْ]/.test(b.normalized as string)),
    '',
  );
  expect(
    'blocks are globally ordered across pages',
    all.every((b) => Number.isFinite(b.order)) &&
      new Set(all.map((b) => b.order)).size === all.length,
    '',
  );
  expect(
    'volume resolved from the ج dropdown',
    storage.pages.get('shamela-9260:p1500')!.volume === 3,
    `→ ج${storage.pages.get('shamela-9260:p1500')!.volume}`,
  );
  expect(
    'blocks carry a TOC node',
    all.every((b) => b.tocNodeId !== null),
    '',
  );

  // Block IDs are derived, not allocated, so they are reproducible on any
  // device and in any order — which is what makes a user's work portable.
  const sample = [...storage.blocks.values()][0];
  expect(
    'block IDs are derived from book, page and position',
    /^shamela-9260:p\d+:\d+$/.test(sample.id as string),
    `→ ${sample.id}`,
  );
  expect(
    'IDs carry no allocation counter',
    ![...storage.blocks.values()].some((b) => /:b\d+$/.test(b.id as string)),
    '',
  );

  // THE point of the exercise: re-parsing must not renumber anything, or every
  // translation card anchored to this page is orphaned.
  const before = new Map([...storage.blocks.values()].map((b) => [b.id as string, b.text as string]));
  for (const p of [8, 500, 1500]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reparsePage(storage as any, fakeBook as any, p, tocIndex);
  }
  const after = new Map([...storage.blocks.values()].map((b) => [b.id as string, b.text as string]));

  check('re-parse produces the same block count', after.size, before.size);
  expect(
    're-parse reuses every block ID (anchors survive)',
    [...before.keys()].every((id) => after.has(id)),
    '',
  );
  expect(
    're-parse leaves the text identical',
    [...before.entries()].every(([id, text]) => after.get(id) === text),
    '',
  );

  // Re-fetching a page the crawler already has (a retry, an overlapping resume)
  // goes through storePage, not reparsePage — same guarantee required.
  const parsed500 = parsePage(read('page-9260-500.html'), 9260)!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await storePage(storage as any, fakeBook as any, parsed500 as any, tocIndex);
  expect(
    're-fetching an already-stored page also reuses its block IDs',
    [...before.keys()].every((id) => storage.blocks.has(id)),
    '',
  );
  check('no duplicate blocks after re-fetch', storage.blocks.size, before.size);

  // A second, independent import — a different device — must produce byte-
  // identical IDs, or a work backup restored onto it would anchor to nothing.
  const secondDevice = makeFakeStorage();
  for (const p of [8, 500, 1500]) {
    const parsed = parsePage(read(`page-9260-${p}.html`), 9260)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await storePage(secondDevice as any, fakeBook as any, parsed as any, tocIndex);
  }
  check(
    'a fresh import on another device yields the same IDs',
    [...secondDevice.blocks.keys()].sort(),
    [...before.keys()].sort(),
  );
}

// ------------------------------------------------- bidi run isolation

console.log('\n=== Bidi: Arabic runs inside English ===');

const { splitBidiRuns } = await import('../src/components/BidiText');

const SALAWAT = 'صلى الله عليه وسلم';
const RADIYA = 'رضي الله عنهما';

// The regression the spec calls out: without the trailing alternation these
// split into one isolate per word, and adjacent isolates render out of order.
const salawatRuns = splitBidiRuns(SALAWAT);
check('ṣalawāt is ONE run, not five', salawatRuns.length, 1);
check('ṣalawāt run is intact', salawatRuns[0]?.text, SALAWAT);
expect('ṣalawāt run is marked Arabic', salawatRuns[0]?.arabic === true, '');

const radiyaRuns = splitBidiRuns(RADIYA);
check('raḍiya llāhu ʿanhumā is ONE run', radiyaRuns.length, 1);
check('raḍiya llāhu ʿanhumā run is intact', radiyaRuns[0]?.text, RADIYA);

// The paragraph from the bug report.
const mixed =
  'Since this chapter is about إخلاص (sincerity) — that is, making the نية ' +
  '(intention) sincerely for Allah عز وجل (Mighty and Majestic)…';
const mixedRuns = splitBidiRuns(mixed);
check(
  'mixed paragraph splits into the right Arabic runs',
  mixedRuns.filter((run) => run.arabic).map((run) => run.text),
  ['إخلاص', 'نية', 'عز وجل'],
);
expect(
  'parentheses stay OUT of the Arabic runs',
  mixedRuns.every((run) => !run.arabic || !/[()]/.test(run.text)),
  '',
);
expect(
  'reassembling the runs reproduces the original exactly',
  mixedRuns.map((run) => run.text).join('') === mixed,
  '',
);

// Harakāt live inside the Arabic block, so they must not break a run in two.
const vocalisedRuns = splitBidiRuns('the term عِبَادَة means worship');
check('a vocalised term stays one run', vocalisedRuns.filter((r) => r.arabic).length, 1);
check('harakāt are preserved in the run', vocalisedRuns.find((r) => r.arabic)?.text, 'عِبَادَة');

// A card with no Arabic must render exactly as before.
const plainRuns = splitBidiRuns('An entirely English sentence, with punctuation.');
check('pure English yields one non-Arabic run', plainRuns.length, 1);
expect('pure English run is not marked Arabic', plainRuns[0].arabic === false, '');

// The ﷺ ligature sits in the Presentation Forms block, not the main Arabic one.
const ligatureRuns = splitBidiRuns('the Prophet ﷺ said');
check('the ﷺ ligature is recognised as Arabic', ligatureRuns.filter((r) => r.arabic).length, 1);

// ------------------------------------------------- provider cache keys

console.log('\n=== Cache key covers provider and model ===');

const { cacheKeyFor } = await import('../src/translation/prompt');
const { maxTokensFor } = await import('../src/translation/models');

const baseKey = {
  startBlockId: 'shamela-9260:b1',
  startOffset: 0,
  endBlockId: 'shamela-9260:b1',
  endOffset: 100,
  profileId: 'profile-study-circle',
  profileVersion: 1,
  glossaryHash: 'abc123',
};

const geminiKey = cacheKeyFor({ ...baseKey, providerId: 'gemini', model: 'gemini-3.7-flash' });
const sonnetKey = cacheKeyFor({ ...baseKey, providerId: 'anthropic', model: 'claude-sonnet-5' });
const opusKey = cacheKeyFor({ ...baseKey, providerId: 'anthropic', model: 'claude-opus-5' });

expect('same selection on two providers -> different keys', geminiKey !== sonnetKey, '');
expect('same provider, different model -> different keys', sonnetKey !== opusKey, '');
expect(
  'identical inputs -> identical key',
  cacheKeyFor({ ...baseKey, providerId: 'gemini', model: 'gemini-3.7-flash' }) === geminiKey,
  '',
);
expect(
  'a glossary change still invalidates',
  cacheKeyFor({ ...baseKey, glossaryHash: 'changed', providerId: 'gemini', model: 'gemini-3.7-flash' }) !==
    geminiKey,
  '',
);

expect('max_tokens has a floor', maxTokensFor('قصير') === 2048, `→ ${maxTokensFor('قصير')}`);
expect('max_tokens has a cap', maxTokensFor('ا'.repeat(200000)) === 32000, '');
expect(
  'max_tokens scales with the passage',
  maxTokensFor('ا'.repeat(5000)) > 1024 && maxTokensFor('ا'.repeat(5000)) < 16000,
  `→ ${maxTokensFor('ا'.repeat(5000))}`,
);

// --------------------------------------------- card markers and scoping

console.log('\n=== Card markers, scoping, filtering ===');

const { buildMarkers, scopeToVisible, filterCards, coveredBlockIds, blockOrderIndex } =
  await import('../src/ui/reader/cardLayout');

// Minimal blocks: index i lives at order i*10.
const fakeBlocks = Array.from({ length: 200 }, (_, i) => ({
  id: `b${i}`,
  bookId: 'book',
  pageId: 'book:p1',
  order: i * 10,
  type: 'sharh' as const,
  text: '',
  normalized: '',
  contentHash: '',
  hadithNumber: null,
  tocNodeId: null,
  spans: [],
  anchor: null,
}));

const makeCard = (id: string, startIndex: number, endIndex = startIndex, extra = {}) => ({
  id,
  bookId: 'book',
  kind: 'translation',
  startBlockId: `b${startIndex}`,
  startOffset: 0,
  endBlockId: `b${endIndex}`,
  endOffset: 10,
  createdAt: 0,
  collapsed: false,
  ...extra,
});

// Two cards starting in the same block must produce ONE marker with a count,
// not two markers stacked in the margin.
const sameBlock = [makeCard('c1', 5), makeCard('c2', 5, 6), makeCard('c3', 40)];
const builtMarkers = buildMarkers(sameBlock);
check('markers are one per starting block', builtMarkers.size, 2);
check('two cards in one block share a marker', builtMarkers.get('b5')?.cards.length, 2);
check('a lone card gets a count of one', builtMarkers.get('b40')?.cards.length, 1);
check('marker exposes card kinds for v2 typing', builtMarkers.get('b5')?.kinds, ['translation']);

// The range indication still covers every block a card spans.
const covered = coveredBlockIds([makeCard('c2', 5, 8)], fakeBlocks);
check('a multi-block card marks every block it covers', covered.size, 4);
expect('covered set is the right blocks', covered.has('b5') && covered.has('b8'), '');

// Scoping: the panel follows the reader.
const spread = [makeCard('near', 50), makeCard('far', 150)];
const scopedHere = scopeToVisible(spread, fakeBlocks, { startIndex: 45, endIndex: 55 });
check('scoping keeps cards in the visible region', scopedHere.map((c) => c.id), ['near']);

const scopedThere = scopeToVisible(spread, fakeBlocks, { startIndex: 145, endIndex: 155 });
check('scrolling elsewhere swaps the panel contents', scopedThere.map((c) => c.id), ['far']);

// The buffer either side must be generous enough not to churn on small
// scrolls. Since Amendment 13 it is half a screen rather than a fixed count,
// so a taller viewport carries a proportionally wider buffer.
const scopedMargin = scopeToVisible(spread, fakeBlocks, { startIndex: 56, endIndex: 75 });
expect(
  'a card just above the viewport is still in scope',
  scopedMargin.some((c) => c.id === 'near'),
  '(20 blocks on screen → a 10-block buffer reaches back to 46)',
);

const scopedTight = scopeToVisible(spread, fakeBlocks, { startIndex: 70, endIndex: 75 });
expect(
  'and a shorter viewport carries a proportionally smaller one',
  !scopedTight.some((c) => c.id === 'near'),
  '(6 on screen → a 3-block buffer, so block 50 is well outside)',
);

check(
  'no visible range yet -> everything shows',
  scopeToVisible(spread, fakeBlocks, null).length,
  2,
);

// Scoping and marker building must never mutate or drop cards.
expect(
  'scoping does not mutate the cards it filters',
  spread.length === 2 && spread[0].id === 'near',
  '',
);

// Filtering in "all cards" mode matches source Arabic and translated English.
const filterable = [
  makeCard('f1', 1, 1, { sourceText: 'باب الإخلاص', segments: [{ english: 'the chapter on sincerity' }] }),
  makeCard('f2', 2, 2, { sourceText: 'باب التوبة', segments: [{ english: 'the chapter on repentance' }] }),
];
check('filter matches English', filterCards(filterable, 'repentance').map((c) => c.id), ['f2']);
check('filter matches Arabic', filterCards(filterable, 'الإخلاص').map((c) => c.id), ['f1']);
check('empty filter keeps everything', filterCards(filterable, '  ').length, 2);

// Collapse is presentation only: it must not touch the anchor or the cache key.
const expanded = makeCard('cc', 5);
const collapsed = { ...expanded, collapsed: true };
check(
  'collapsing leaves the anchor untouched',
  [collapsed.startBlockId, collapsed.startOffset, collapsed.endBlockId, collapsed.endOffset],
  [expanded.startBlockId, expanded.startOffset, expanded.endBlockId, expanded.endOffset],
);
expect(
  'collapsing does not change which marker a card belongs to',
  buildMarkers([collapsed]).get('b5')?.cards.length === 1,
  '',
);

check('block order index covers every block', blockOrderIndex(fakeBlocks).size, 200);

// ------------------------------------- Qurʾān index and entity detection

console.log('\n=== Bundled Qurʾān index ===');

const { buildQuranIndex } = await import('../src/quran/quranIndex');
const { detectEntities, hadithCollectionFor } = await import('../src/quran/detectEntities');

const quranBundle = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'quran', 'uthmani.json'), 'utf8'),
);
const quran = buildQuranIndex(quranBundle);

check('index holds every āyah', quran.ayahCount, 6236);
check('1:1 maps back correctly', quran.refAt(0), { surah: 1, ayah: 1 });
check('2:1 follows al-Fātiḥah', quran.refAt(7), { surah: 2, ayah: 1 });
check('114:6 is the last āyah', quran.refAt(6235), { surah: 114, ayah: 6 });

// Resolution must work on text taken from the *sharḥ*, whose orthography
// differs from the muṣḥaf — that is exactly what normalization is for.
const ayatAlKursi = quran.match(
  'اللَّهُ لا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ لا تَأْخُذُهُ سِنَةٌ وَلا نَوْمٌ',
);
check('Āyat al-Kursī resolves from sharḥ orthography', ayatAlKursi?.reference, '2:255');
check('and is marked exact', ayatAlKursi?.quality, 'exact');

const multi = quran.match(
  'الَّذِي يَرَاكَ حِينَ تَقُومُ وَتَقَلُّبَكَ فِي السَّاجِدِينَ',
);
check('a quotation spanning two āyāt resolves as a range', multi?.reference, '26:218-26:219');

expect('a too-short quotation is refused', quran.match('الله') === null, '');
expect('text that is not Qurʾān does not match', quran.match('وقال المؤلف رحمه الله تعالى في هذا الباب') === null, '');

console.log('\n=== Entity detection over the first 50 pages of 9260 ===');

const nassPages: Record<string, string> = JSON.parse(
  readFileSync(join(FIXTURES, 'nass-9260-1-50.json'), 'utf8'),
);

const detectionBlocks: Awaited<ReturnType<typeof buildBlocksForTest>> = [];
let blockCounter = 0;

function buildBlocksForTest(pageIndex: number, nassHtml: string) {
  return parseBlocks(nassHtml).map((parsed) => {
    const detection = detectBlockType({
      text: parsed.text,
      spans: parsed.spans,
      wholeBlockIsHeading: parsed.wholeBlockIsHeading,
      profile: 'hadith-commentary' as const,
    });
    return {
      id: `shamela-9260:b${blockCounter++}`,
      bookId: 'shamela-9260',
      pageId: `shamela-9260:p${pageIndex}`,
      order: pageIndex * 1000,
      type: detection.type,
      text: parsed.text,
      normalized: normalize(parsed.text),
      contentHash: '',
      hadithNumber: detection.hadithNumber,
      tocNodeId: null,
      spans: parsed.spans,
      anchor: parsed.anchor,
    };
  });
}

for (let p = 1; p <= 50; p++) {
  const html = nassPages[String(p)];
  if (!html) continue;
  detectionBlocks.push(...buildBlocksForTest(p, html));
}

check('hadith collection inferred from the title', hadithCollectionFor('شرح رياض الصالحين'), 'riyadussalihin');
check('an unrelated title infers nothing', hadithCollectionFor('تفسير ابن كثير'), null);

// Detection must not depend on delimiters. These probe the exact failure modes
// the amendment lists, each against a synthetic block.
function detectIn(text: string, spans: never[] = []) {
  const block = {
    id: 'x1',
    bookId: 'b',
    pageId: 'b:p1',
    order: 1,
    type: 'sharh' as const,
    text,
    normalized: normalize(text),
    contentHash: '',
    hadithNumber: null,
    tocNodeId: null,
    spans,
    anchor: null,
  };
  return detectEntities('b', [block] as never, { quran, hadithCollection: null }).filter(
    (e) => e.type === 'quran',
  );
}

const TAWBAH_123 =
  'يَا أَيُّهَا الَّذِينَ آمَنُوا قَاتِلُوا الَّذِينَ يَلُونَكُمْ مِنَ الْكُفَّارِ وَلْيَجِدُوا فِيكُمْ غِلْظَةً';
const TAWBAH_120 =
  'مَا كَانَ لِأَهْلِ الْمَدِينَةِ وَمَنْ حَوْلَهُمْ مِنَ الْأَعْرَابِ أَنْ يَتَخَلَّفُوا عَنْ رَسُولِ اللَّهِ';

check('at-Tawbah 123 detected, ASCII parens', detectIn(`قال تعالى: (${TAWBAH_123}) .`).map((e) => e.reference), ['9:123']);
check('at-Tawbah 120 detected, ASCII parens', detectIn(`وقال: (${TAWBAH_120})`).map((e) => e.reference), ['9:120']);
check('detected with NO delimiters at all', detectIn(`قال تعالى ${TAWBAH_123} وهذا يدل`).map((e) => e.reference), ['9:123']);
check('detected with ornate brackets', detectIn(`﴿${TAWBAH_123}﴾`).map((e) => e.reference), ['9:123']);
check('detected with curly braces', detectIn(`{${TAWBAH_123}}`).map((e) => e.reference), ['9:123']);
check(
  'detected with a mismatched delimiter pair',
  detectIn(`(${TAWBAH_123}﴾`).map((e) => e.reference),
  ['9:123'],
);
check(
  'detected regardless of surrounding whitespace',
  detectIn(`قال تعالى:   (   ${TAWBAH_123}   )   .`).map((e) => e.reference),
  ['9:123'],
);

// The false-positive the old delimiter scan produced.
check('a citation is never marked as a verse', detectIn('(التوبة: ١٢٣)').length, 0);
check('a citation beside a verse is not a second entity', detectIn(`(${TAWBAH_123}) (التوبة: ١٢٣)`).length, 1);
expect(
  'ordinary commentary produces nothing',
  detectIn('وهذا الحديث يدل على أن النية شرط في صحة العمل وأن الأعمال بالنيات عند أهل العلم').length === 0,
  '',
);

// Offsets must land on the original text, harakāt intact.
const withDelims = detectIn(`قال تعالى: (${TAWBAH_123}) .`)[0];
const sourceText = `قال تعالى: (${TAWBAH_123}) .`;
const marked = sourceText.slice(withDelims.startOffset, withDelims.endOffset);
expect(
  'the tinted span carries its harakāt',
  /[ً-ْ]/.test(marked),
  '',
);
expect(
  'the tint extends over the delimiters',
  marked.startsWith('(') && marked.endsWith(')'),
  `→ ${marked.slice(0, 3)}…${marked.slice(-3)}`,
);

const detectionStart = performance.now();
const detected = detectEntities('shamela-9260', detectionBlocks, {
  quran,
  hadithCollection: 'riyadussalihin',
});
const detectionMs = performance.now() - detectionStart;

// Volume 1 of book 9260 is pages 1–586, so roughly twelve times this sample.
const volumeEstimate = (detectionMs / 50) * 586;
console.log(
  `  detection: ${detectionMs.toFixed(0)} ms for 50 pages ` +
    `(~${(volumeEstimate / 1000).toFixed(1)} s for volume 1, ` +
    `~${((detectionMs / 50) * 3784 / 1000).toFixed(1)} s for the whole book)`,
);
expect(
  'detection over a volume is fast enough to run during import',
  volumeEstimate < 30_000,
  `(~${(volumeEstimate / 1000).toFixed(1)} s)`,
);

const quranEntities = detected.filter((e) => e.type === 'quran');
const hadithEntities = detected.filter((e) => e.type === 'hadith');
const resolvedQuran = quranEntities.filter((e) => e.matchQuality !== 'unresolved');

console.log(
  `  ${detectionBlocks.length} blocks over 50 pages → ` +
    `${quranEntities.length} verse candidates, ${hadithEntities.length} hadith`,
);
console.log(
  `  verses resolved: ${resolvedQuran.length}/${quranEntities.length} ` +
    `(${quranEntities.filter((e) => e.matchQuality === 'exact').length} exact, ` +
    `${quranEntities.filter((e) => e.matchQuality === 'partial').length} partial)`,
);

expect('verse candidates were found at all', quranEntities.length > 20, `(${quranEntities.length})`);
expect(
  'most verse candidates resolve',
  resolvedQuran.length / quranEntities.length > 0.75,
  `(${Math.round((resolvedQuran.length / quranEntities.length) * 100)}%)`,
);

// The strongest available check: this edition prints its own citation beside
// each verse, parsed independently by the citation parser. Where both a local
// muṣḥaf match and a printed citation exist, they must agree.
//
// Agreement is "same sūrah, and the matched āyah at or after the printed one",
// not string equality. A block often quotes several consecutive āyāt under one
// citation — p10 quotes 86:8, 86:9 and 86:10 under a single "(الطارق: ٨-١٠)" —
// and the citation parser only captures that range's first number. Demanding
// equality would score correct matches as failures.
let agreed = 0;
let disagreed = 0;
const disagreements: string[] = [];

for (const block of detectionBlocks) {
  const printed = block.spans
    .filter((s) => s.kind === 'quran_ref' && s.reference)
    .map((s) => s.reference!.split(':').map(Number) as [number, number]);
  if (printed.length === 0) continue;

  const matched = detected
    .filter(
      (e) =>
        e.startBlockId === block.id && e.type === 'quran' && e.matchQuality !== 'unresolved',
    )
    .map((e) => e.reference.split('-')[0].split(':').map(Number) as [number, number]);

  for (const [surah, ayah] of matched) {
    const ok = printed.some(
      ([ps, pa]) => ps === surah && ayah >= pa && ayah <= pa + 12,
    );
    if (ok) agreed++;
    else {
      disagreed++;
      if (disagreements.length < 8) {
        disagreements.push(
          `      local ${surah}:${ayah} vs printed ${printed.map((p) => p.join(':')).join('/')}`,
        );
      }
    }
  }
}

console.log(`  local match vs the edition's own printed citation: ${agreed} agree, ${disagreed} differ`);
for (const line of disagreements) console.log(line);
expect(
  'local resolution agrees with the printed citations',
  agreed > 0 && agreed / (agreed + disagreed) > 0.8,
  `(${Math.round((agreed / Math.max(1, agreed + disagreed)) * 100)}%)`,
);

// Ḥadīth references come straight from the parsed number — no inference.
const resolvedHadith = hadithEntities.filter((e) => e.matchQuality === 'exact');
expect('hadith entities resolve from their number', resolvedHadith.length > 0, `(${resolvedHadith.length})`);
expect(
  'hadith references use the riyadussalihin collection',
  resolvedHadith.every((e) => e.reference.startsWith('riyadussalihin:')),
  `e.g. ${resolvedHadith[0]?.reference}`,
);

// Offsets must be usable by the renderer and the selection code.
expect(
  'entity offsets lie inside their anchor blocks',
  detected.every((entity) => {
    const startBlock = detectionBlocks.find((b) => b.id === entity.startBlockId);
    const endBlock = detectionBlocks.find((b) => b.id === entity.endBlockId);
    return (
      startBlock !== undefined &&
      endBlock !== undefined &&
      entity.startOffset >= 0 &&
      entity.startOffset <= startBlock.text.length &&
      entity.endOffset >= 0 &&
      entity.endOffset <= endBlock.text.length
    );
  }),
  '',
);
expect(
  'cross-block entities were found where pages break mid-verse',
  detected.some((e) => e.startBlockId !== e.endBlockId),
  `(${detected.filter((e) => e.startBlockId !== e.endBlockId).length})`,
);

// Unresolved spans exist but must never be offered to the renderer.
const { markableByBlock } = await import('../src/quran/entityService');
const markable = markableByBlock(detected, detectionBlocks as never);
expect(
  'unresolved entities are never marked',
  [...markable.values()].flat().every((r) => r.entity.matchQuality !== 'unresolved'),
  '',
);
expect(
  'render ranges lie inside their block',
  [...markable.entries()].every(([blockId, ranges]) => {
    const block = detectionBlocks.find((b) => b.id === blockId);
    return (
      block !== undefined &&
      ranges.every((r) => r.start >= 0 && r.end <= block.text.length && r.start < r.end)
    );
  }),
  '',
);

// Diagnostics: delimiter-paired spans that matched nothing. On a healthy
// import this is the list you would read to catch a detection failure or a
// corrupted parse at import time rather than mid-lesson.
const { unmatchedDelimitedSpans } = await import('../src/quran/detectEntities');
const unmatched = unmatchedDelimitedSpans(detectionBlocks as never, detected);
console.log(`  delimiter-paired spans with no match: ${unmatched.length}`);
for (const problem of unmatched.slice(0, 5)) {
  console.log(`      ${problem.text.slice(0, 80)}`);
}

// ------------------------------------------------- reading marks

console.log('\n=== Reading marks ===');

const { applyMark, snapToWords, markRangesByBlock, noteCardsFrom, marksIn } =
  await import('../src/ui/reader/markLogic');
const { flattenAnnotations, classesFor } = await import('../src/ui/reader/annotations');

const markBlocks = [
  { ...fakeBlocks[0], id: 'm0', order: 0, text: 'كلمة أولى وثانية وثالثة ورابعة' },
  { ...fakeBlocks[1], id: 'm1', order: 10, text: 'سطر ثان هنا' },
];
const markOrder = new Map(markBlocks.map((b) => [b.id, b.order]));

const anchorOf = (blockId: string, start: number, end: number) => ({
  startBlockId: blockId,
  startOffset: start,
  endBlockId: blockId,
  endOffset: end,
});

// Word snapping protects Arabic shaping: a boundary must never fall inside a
// word, or its letters end up in two elements and the join can break.
check('snapping widens to word boundaries', snapToWords('كلمة أولى وثانية', 2, 7), [0, 9]);
check('snapping leaves clean boundaries alone', snapToWords('كلمة أولى', 0, 4), [0, 4]);

// Precedence rule 1: different scopes coexist. This is the primary use case.
const blockSkip = applyMark(
  [],
  { bookId: 'b', anchor: anchorOf('m0', 0, 30), kind: 'skip', scope: 'block' },
  markOrder,
).put;
const withRead = applyMark(
  blockSkip,
  { bookId: 'b', anchor: anchorOf('m0', 5, 15), kind: 'read', scope: 'span' },
  markOrder,
);
check('a read span inside a skip block removes nothing', withRead.remove, []);
const nested = [...blockSkip, ...withRead.put];
check('both marks survive together', nested.length, 2);

// Precedence rule 2: same scope, opposite kind replaces.
const replaced = applyMark(
  blockSkip,
  { bookId: 'b', anchor: anchorOf('m0', 0, 30), kind: 'read', scope: 'block' },
  markOrder,
);
check('same scope, opposite kind replaces', replaced.remove, [blockSkip[0].id]);
check('and leaves one mark', replaced.put.length, 1);
check('of the new kind', replaced.put[0].kind, 'read');

// Precedence rule 3: same scope, same kind merges.
const first = applyMark(
  [],
  { bookId: 'b', anchor: anchorOf('m0', 0, 10), kind: 'read', scope: 'span' },
  markOrder,
).put;
const mergedResult = applyMark(
  first,
  { bookId: 'b', anchor: anchorOf('m0', 6, 20), kind: 'read', scope: 'span' },
  markOrder,
);
check('same scope, same kind merges to one mark', mergedResult.put.length, 1);
check('taking the outermost bounds', [mergedResult.put[0].startOffset, mergedResult.put[0].endOffset], [0, 20]);
check('and keeps the original identity', mergedResult.put[0].id, first[0].id);

// A mark spanning a page break contributes a range to each block it touches.
const crossing = applyMark(
  [],
  {
    bookId: 'b',
    anchor: { startBlockId: 'm0', startOffset: 20, endBlockId: 'm1', endOffset: 4 },
    kind: 'skip',
    scope: 'span',
  },
  markOrder,
).put;
const crossRanges = markRangesByBlock(crossing, markBlocks as never);
check('a cross-block mark renders in both blocks', crossRanges.size, 2);
check('tail of the first block', crossRanges.get('m0')![0].end, markBlocks[0].text.length);
check('head of the second', crossRanges.get('m1')![0].start, 0);

// Only marks with notes become cards.
const noteless = applyMark(
  [],
  { bookId: 'b', anchor: anchorOf('m0', 0, 10), kind: 'skip', scope: 'block' },
  markOrder,
).put;
const noted = applyMark(
  [],
  { bookId: 'b', anchor: anchorOf('m1', 0, 5), kind: 'read', scope: 'block', note: 'mention this' },
  markOrder,
).put;
check('a bare mark produces no card', noteCardsFrom(noteless, markBlocks as never).length, 0);
check('a mark with a note produces one', noteCardsFrom(noted, markBlocks as never).length, 1);
check('note cards use the note card kind', noteCardsFrom(noted, markBlocks as never)[0].kind, 'note');

check('marksIn finds an intersecting mark', marksIn(noteless, anchorOf('m0', 5, 8), markOrder).length, 1);
check('marksIn ignores a disjoint range', marksIn(noteless, anchorOf('m0', 20, 25), markOrder).length, 0);

// ---- the flattener: six layers over one block ------------------------

console.log('\n  Flattening every layer over one block:');

const layered = flattenAnnotations(30, {
  spans: [{ start: 0, end: 12, kind: 'quran' as const }],
  entities: [
    {
      entity: { id: 'e1', type: 'quran' } as never,
      blockId: 'm0',
      start: 0,
      end: 12,
    },
  ],
  marks: [
    { mark: { id: 'sk', kind: 'skip', scope: 'block' } as never, blockId: 'm0', start: 0, end: 30 },
    { mark: { id: 'rd', kind: 'read', scope: 'span' } as never, blockId: 'm0', start: 6, end: 18 },
  ],
  highlight: [20, 24],
});

for (const segment of layered) {
  console.log(
    `    [${String(segment.start).padStart(2)}–${String(segment.end).padStart(2)}) ` +
      `${classesFor(segment) || '(plain)'}${segment.highlighted ? ' +match' : ''}`,
  );
}

expect(
  'segments are contiguous and non-overlapping',
  layered.every((segment, index) =>
    index === 0 ? segment.start === 0 : segment.start === layered[index - 1].end,
  ) && layered[layered.length - 1].end === 30,
  '',
);
expect(
  'every character is covered exactly once',
  layered.reduce((total, segment) => total + (segment.end - segment.start), 0) === 30,
  '',
);
expect(
  'skip and read render simultaneously where they overlap',
  layered.some((segment) => segment.skip !== undefined && segment.read !== undefined),
  '',
);
expect(
  'the overlapping segment carries both channels',
  layered
    .filter((segment) => segment.skip && segment.read)
    .every((segment) => classesFor(segment).includes('mark-skip') && classesFor(segment).includes('mark-read')),
  '',
);
expect(
  'a subdivided entity is never isolated piecewise',
  layered
    .filter((segment) => segment.entity && !segment.entityWhole)
    .every((segment) => !classesFor(segment).includes('entity-isolate')),
  '',
);

// A block with no annotations at all must still render as one plain run.
const bare = flattenAnnotations(30, { spans: [], entities: [], marks: [] });
check('an unannotated block is a single segment', bare.length, 1);
check('carrying no classes', classesFor(bare[0]), '');

// ------------------------------------------------- dictionary lookup

console.log('\n=== Dictionary: root index and morphology ===');

const { rootCandidates, foldRoot, isSingleWord } = await import('../src/dictionary/roots');
const { rootFromTocTitle, Dictionary } = await import('../src/dictionary/dictionaryService');
const { guessRole } = await import('../src/ingest/importer');

// The root index comes straight from the TOC, whose leaves are the roots.
const dictBook = parseBookPage(read('book-12145.html'), 12145);
if (!dictBook) {
  failures++;
  console.log('  FAIL  could not parse book 12145');
} else {
  check('dictionary title', dictBook.title, 'المصباح المنير في غريب الشرح الكبير');
  check('role is detected as a reference work', guessRole(12145, dictBook.category, dictBook.title), 'dictionary');
  check('an ordinary book is not', guessRole(9260, 'شروح الحديث', 'شرح رياض الصالحين'), 'reading');

  // The landing page ships only part of the tree: 560 branches are collapsed
  // behind the site's own AJAX endpoint, which fetchBookPreview expands during
  // a real import. The fixture holds those responses so the test exercises the
  // complete index rather than a third of it.
  const { parseTocBranch } = await import('../src/shamela/parseBook');
  const branchHtml: Record<string, string> = JSON.parse(
    readFileSync(join(FIXTURES, 'toc-12145-branches.json'), 'utf8'),
  );

  const fullToc = [...dictBook.toc];
  let branchOrder = fullToc.length;
  for (const branch of dictBook.collapsedBranches) {
    const html = branchHtml[branch.titleId];
    if (!html) continue;
    const parent = fullToc.find((node) => node.key === branch.parentKey);
    if (!parent) continue;
    const children = parseTocBranch(html, 12145, parent.key, parent.depth, branchOrder);
    branchOrder += children.length;
    fullToc.push(...children);
  }

  console.log(
    `  landing page: ${dictBook.toc.length} entries, ${dictBook.collapsedBranches.length} collapsed branches`,
  );

  const roots = fullToc
    .map((node) => ({ node, parsed: rootFromTocTitle(node.title) }))
    .filter((row) => row.parsed !== null);

  console.log(`  ${fullToc.length} TOC entries -> ${roots.length} roots`);
  // Like 9260, this book ships its whole tree inline; the AJAX responses in the
  // fixture were checked against it and carry nothing extra. The expansion path
  // above still runs, so it stays exercised for books that do collapse.
  expect(
    '12145 also ships its full tree inline',
    dictBook.collapsedBranches.length === 0,
    `(${dictBook.collapsedBranches.length} collapsed)`,
  );
  expect('the TOC yields a full root index', roots.length > 2500, `(${roots.length})`);
  expect(
    'section headings are not mistaken for roots',
    rootFromTocTitle('[الألف مع الباء وما يثلثهما]') === null,
    '',
  );
  check('a root leaf parses', rootFromTocTitle('(ء ب ب)')?.root, 'ءبب');
  check('and keeps its printed form', rootFromTocTitle('(ء ب ب)')?.display, 'ء ب ب');

  // Build a small in-memory dictionary from the real index to exercise lookup.
  const entries = roots.map((row, index) => ({
    id: `d${index}`,
    bookId: 'shamela-12145',
    root: row.parsed!.root,
    rootDisplay: row.parsed!.display,
    pageIndex: row.node.pageIndex,
    volume: 1,
    printPage: row.node.pageIndex,
  }));
  const dict = new Dictionary({ id: 'shamela-12145' } as never, entries as never, []);

  console.log(`  index holds ${dict.rootCount} distinct roots`);

  const resolves = (word: string, expectedRoot: string) => {
    const found = dict.lookup(word);
    const hit = found.hits.some((candidate) => candidate.entry.root === foldRoot(expectedRoot));
    checks++;
    if (!hit) {
      failures++;
      console.log(
        `  FAIL  "${word}" -> ${expectedRoot}  (got ${found.hits.slice(0, 4).map((h) => h.entry.rootDisplay).join(', ') || 'nothing'})`,
      );
    } else {
      const rank = found.hits.findIndex((c) => c.entry.root === foldRoot(expectedRoot));
      console.log(`  ok    "${word}" -> ${expectedRoot} (hit ${rank + 1} of ${found.hits.length})`);
    }
  };

  // The acceptance cases, each a different morphological failure mode.
  resolves('يستغفرون', 'غفر');       // prefix + suffix + augment
  resolves('وبكتابه', 'كتب');        // proclitic and enclitic together
  resolves('قال', 'قول');            // hollow verb, medial weak radical
  resolves('باع', 'بيع');            // hollow verb, the other radical
  resolves('دعا', 'دعو');            // defective verb, final weak radical
  // Article + tāʾ marbūṭa + weak final radical. This dictionary files it under
  // ص ل ي rather than the ص ل و of standard root orthography — which is exactly
  // why both weak variants are generated and every hit returned.
  resolves('الصلاة', 'صلي');
  resolves('أبواب', 'بوب');          // broken plural of باب, hollow root
  resolves('الإيمان', 'ءمن');        // hamza-initial; the index prints ء
  resolves('المؤمنون', 'ءمن');       // hamza carrier folded to ء

  expect(
    'a word with no entry reports nothing rather than guessing',
    dict.lookup('زققققق').hits.length === 0,
    '',
  );
}

check('a single word is eligible for lookup', isSingleWord('يستغفرون'), true);
check('a phrase is not', isSingleWord('قال رسول الله'), false);
check('empty is not', isSingleWord('   '), false);

// Candidate generation must stay cheap: it runs on every lookup.
const candidateStart = performance.now();
for (let i = 0; i < 500; i++) rootCandidates('يستغفرونها');
const candidateMs = (performance.now() - candidateStart) / 500;
// The acceptance criterion is "well under a second"; this leaves two orders of
// magnitude of headroom so the check does not flap on a noisy machine.
expect(
  'candidate generation is fast enough for an instant lookup',
  candidateMs < 10,
  `(${candidateMs.toFixed(3)} ms per word)`,
);

// ------------------------------------------------- structured output

console.log('\n=== Structured output ===');

const { stripJsonInstruction, EMIT_TRANSLATION_TOOL } = await import('../src/translation/schema');
const { coerceSegments } = await import('../src/translation/parseSegments');
const { MAX_TOKENS_CEILING } = await import('../src/translation/models');
const { STUDY_CIRCLE_PROMPT } = await import('../src/translation/profiles');

expect(
  'the JSON-only instruction is removed on schema-enforced paths',
  !stripJsonInstruction(STUDY_CIRCLE_PROMPT).includes('Return ONLY a JSON array'),
  '',
);
expect(
  'but the conventions themselves survive intact',
  ['QURʾĀNIC VERSES', 'ḤADĪTH', 'POETRY', 'GENERAL PROSE', 'ARABIC TERMS', 'UNCERTAINTY'].every(
    (rule) => stripJsonInstruction(STUDY_CIRCLE_PROMPT).includes(rule),
  ),
  '',
);
check('the tool is named as the provider forces it', EMIT_TRANSLATION_TOOL.name, 'emit_translation');

// Structured data arrives already parsed; it must coerce without a text pass.
const coerced = coerceSegments([
  { type: 'quran', arabic: 'ا', english: '', reference: '2:255' },
  { type: 'prose', arabic: 'ب', english: 'and so on' },
  { type: 'nonsense', arabic: 'ج', english: 'kept as prose' },
  { arabic: '', english: '' },
]);
check('structured segments coerce directly', coerced.length, 3);
check('an unknown type falls back to prose', coerced[2].type, 'prose');
check('an empty segment is dropped', coerced.filter((s) => s.arabic === '' && s.english === '').length, 0);

expect('max_tokens has a floor for short passages', maxTokensFor('كلمة') === 2048, `→ ${maxTokensFor('كلمة')}`);
expect(
  'max_tokens is generous enough for Arabic plus English plus envelope',
  maxTokensFor('ا'.repeat(2500)) >= 4000,
  `→ ${maxTokensFor('ا'.repeat(2500))}`,
);
expect('and is capped', maxTokensFor('ا'.repeat(500000)) === MAX_TOKENS_CEILING, '');

// ------------------------------------------------- library transfer

console.log('\n=== Library transfer ===');

const { blockIdFor } = await import('../src/ingest/importer');

check('block ID derivation', blockIdFor('shamela-9260', 500, 3), 'shamela-9260:p500:3');
expect(
  'deriving twice gives the same ID',
  blockIdFor('shamela-9260', 12, 0) === blockIdFor('shamela-9260', 12, 0),
  '',
);

// The serializer must emit raw UTF-8. Arabic escaped as \uXXXX costs six bytes
// per character instead of two — a threefold inflation on a file that is almost
// entirely Arabic, and the easiest way to accidentally triple the export.
const arabicLine = JSON.stringify({ x: 'باب الإخلاص وإحضار النية' });
expect('JSON.stringify emits raw UTF-8, not \\u escapes', !/\\u0[46]/.test(arabicLine), '');
expect('and the Arabic survives a round trip', JSON.parse(arabicLine).x.startsWith('باب'), '');

// Size: what the transfer format leaves out is most of the bulk.
{
  const parsed = parsePage(read('page-9260-500.html'), 9260)!;
  const blocks = parsed.blocks;

  const withEverything = blocks.map((block) => ({
    text: block.text,
    normalized: normalize(block.text),
    contentHash: 'x'.repeat(64),
    rawHtml: parsed.contentHtml,
  }));
  const transferShape = blocks.map((block) => ({ x: block.text, z: block.spans }));

  const fullBytes = new TextEncoder().encode(JSON.stringify(withEverything)).length;
  const leanBytes = new TextEncoder().encode(JSON.stringify(transferShape)).length;

  console.log(
    `  one page: ${fullBytes.toLocaleString()} B with derived fields -> ` +
      `${leanBytes.toLocaleString()} B in transfer shape ` +
      `(${Math.round((1 - leanBytes / fullBytes) * 100)}% smaller before gzip)`,
  );
  expect('dropping derived fields is a large saving', leanBytes < fullBytes * 0.5, '');
}

// NDJSON: one record per line, so a phone can stream and batch rather than
// parsing tens of thousands of blocks into memory at once.
{
  const lines = [
    JSON.stringify({ kind: 'header', version: 1, counts: { pages: 1, blocks: 2 } }),
    JSON.stringify({ kind: 'page', p: 1, v: 1, s: 5 }),
    JSON.stringify({ kind: 'block', id: 'b:p1:0', x: 'أول' }),
    JSON.stringify({ kind: 'block', id: 'b:p1:1', x: 'ثان' }),
  ].join('\n');

  const parsedLines = lines.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  check('every line parses independently', parsedLines.length, 4);
  check('the header comes first', parsedLines[0].kind, 'header');
  expect(
    'a truncated file is detectable from the header count',
    parsedLines.filter((r) => r.kind === 'block').length === parsedLines[0].counts.blocks,
    '',
  );

  // Truncate mid-file and confirm the mismatch is caught.
  const truncated = lines.split('\n').slice(0, 3).map((line) => JSON.parse(line));
  expect(
    'and a short file fails that check',
    truncated.filter((r) => r.kind === 'block').length !== truncated[0].counts.blocks,
    '',
  );
}

// ------------------------------------------------- selection resolution

console.log('\n=== Selection resolution ===');

const { readSelection, peekSelection, blocksInRange, contextAround } = await import(
  '../src/ui/reader/selection'
);

{
  // A reader-shaped DOM: two blocks, each with the inline spans BlockText emits.
  const page = dom.window.document;
  page.body.innerHTML = `
    <div class="reader-surface">
      <p data-block-id="b:p1:0" dir="rtl"><span>قال الله </span><span>تعالى</span> وهذا بيان</p>
      <p data-block-id="b:p1:1" dir="rtl">وفي هذا دليل على المراد</p>
    </div>
    <div class="no-select"><button>Translate</button></div>
  `;

  const first = page.querySelector('[data-block-id="b:p1:0"]')!;
  const second = page.querySelector('[data-block-id="b:p1:1"]')!;
  const selection = dom.window.getSelection()!;

  const selectAcross = (
    startNode: Node,
    startOffset: number,
    endNode: Node,
    endOffset: number,
  ) => {
    const range = page.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  // Offsets must count characters across the inline spans, because a block's
  // text is rendered as many elements once entities and marks are layered on.
  selectAcross(first.childNodes[1].firstChild!, 0, first.childNodes[2], 5);
  const within = readSelection();
  check('a selection inside one block resolves to that block', within?.startBlockId, 'b:p1:0');
  check('offsets count across inline spans', within?.startOffset, 9);
  expect('and the text matches the offsets', within !== null, `→ "${within?.sourceText}"`);

  // Multi-block: the anchor spans two paragraphs.
  selectAcross(first.childNodes[0].firstChild!, 0, second.firstChild!, 6);
  const across = readSelection();
  check('a multi-block selection resolves both ends', [across?.startBlockId, across?.endBlockId], [
    'b:p1:0',
    'b:p1:1',
  ]);
  check('the end offset is inside the end block', across?.endOffset, 6);

  // What the bar needs, without resolving anything.
  const peeked = peekSelection();
  expect('peek reports an active selection', peeked.active, '');
  expect('and knows it is not a single word', !peeked.singleWord, '');

  selectAcross(second.firstChild!, 0, second.firstChild!, 3);
  expect('a one-word selection is recognised', peekSelection().singleWord, '');

  // A selection outside the reader must not raise the bar.
  const button = page.querySelector('button')!;
  selectAcross(button.firstChild!, 0, button.firstChild!, 5);
  expect('a selection outside a block does not activate the bar', !peekSelection().active, '');
  check('and does not resolve to anchors', readSelection(), null);

  selection.removeAllRanges();
  expect('a collapsed selection is inactive', !peekSelection().active, '');

  // The anchor carries no Range and no rect: nothing is retained between the
  // selection being made and an action being tapped.
  selectAcross(first.childNodes[0].firstChild!, 0, second.firstChild!, 6);
  const anchor = readSelection()!;
  check(
    'the anchor is plain data only',
    Object.keys(anchor).sort(),
    ['endBlockId', 'endOffset', 'sourceText', 'startBlockId', 'startOffset'],
  );

  // Range helpers still work over the resolved anchors.
  const twoBlocks = [
    { ...fakeBlocks[0], id: 'b:p1:0', order: 0 },
    { ...fakeBlocks[1], id: 'b:p1:1', order: 10 },
    { ...fakeBlocks[2], id: 'b:p1:2', order: 20 },
  ];
  check(
    'blocksInRange covers both ends',
    blocksInRange(twoBlocks as never, 'b:p1:0', 'b:p1:1').map((b) => b.id),
    ['b:p1:0', 'b:p1:1'],
  );
  check(
    'context is taken from outside the selection',
    contextAround(twoBlocks as never, 'b:p1:1', 'b:p1:1').after.map((b) => b.id),
    ['b:p1:2'],
  );

  selection.removeAllRanges();
  page.body.innerHTML = '';
}

// ============================================================ OFFLINE PIPELINE

console.log('\n=== Offline pipeline: the ḥadīth invariant ===');

const { segmentSelection, applyProseTranslations, HADITH_NO_OFFLINE_SOURCE } = await import(
  '../src/translation/offline/segmentSelection'
);
const { QuranEnglish } = await import('../src/quran/quranIndex');
const { splitSentences, applyPlaceholders, restorePlaceholders, placeholdersIntact } =
  await import('../src/translation/offline/sentences');

const englishBundle = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'quran', 'khattab.json'), 'utf8'),
);
const quranEnglish = new QuranEnglish(englishBundle);

check('the bundled translation is Khattab', englishBundle.translation, 'Dr. Mustafa Khattab, The Clear Qurʾān');
check('it covers every āyah', englishBundle.ayat.length, 6236);
expect(
  'and 2:255 reads correctly',
  quranEnglish.at(quran.flatIndexOf(2, 255))?.startsWith('Allah! There is no god'),
  '',
);

// A selection containing commentary, a verse, more commentary, and a ḥadīth.
{
  const verseArabic = 'قُلْ يَا عِبَادِيَ الَّذِينَ أَسْرَفُوا عَلَى أَنْفُسِهِمْ';
  const hadithArabic = 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى';
  const text = `وقال المؤلف رحمه الله ${verseArabic} وهذا يدل على سعة الرحمة ${hadithArabic} رواه البخاري`;

  const verseStart = text.indexOf(verseArabic);
  const hadithStart = text.indexOf(hadithArabic);

  const block = {
    id: 'x:p1:0',
    bookId: 'x',
    pageId: 'x:p1',
    order: 0,
    type: 'sharh' as const,
    text,
    normalized: normalize(text),
    contentHash: '',
    hadithNumber: '1',
    tocNodeId: null,
    spans: [],
    anchor: null,
  };

  const entities = [
    {
      id: 'e-quran',
      bookId: 'x',
      startBlockId: 'x:p1:0',
      startOffset: verseStart,
      endBlockId: 'x:p1:0',
      endOffset: verseStart + verseArabic.length,
      type: 'quran' as const,
      reference: '39:53',
      matchQuality: 'exact' as const,
      detectedAt: 0,
      textUthmani: verseArabic,
    },
    {
      id: 'e-hadith',
      bookId: 'x',
      startBlockId: 'x:p1:0',
      startOffset: hadithStart,
      endBlockId: 'x:p1:0',
      endOffset: hadithStart + hadithArabic.length,
      type: 'hadith' as const,
      // Deliberately unresolvable: this is the case the invariant is about.
      reference: 'riyadussalihin:1',
      matchQuality: 'exact' as const,
      detectedAt: 0,
    },
  ];

  const segmented = segmentSelection({
    blocks: [block] as never,
    entities: entities as never,
    startBlockId: 'x:p1:0',
    startOffset: 0,
    endBlockId: 'x:p1:0',
    endOffset: text.length,
    quran,
    english: quranEnglish,
    // No verified offline translation available — the whole point.
    hadithLookup: () => null,
  });

  console.log('  segments produced:');
  for (const segment of segmented.segments) {
    console.log(
      `    ${segment.type.padEnd(7)} ${segment.english ? 'has English' : 'NO English'}  ` +
        `${segment.arabic.slice(0, 42).replace(/\s+/g, ' ')}…`,
    );
  }
  console.log(`  prose spans handed to the model: ${segmented.prose.length}`);

  // The trailing takhrīj is an attribution line rather than matn, and since
  // Amendment 12 it is finished from the fixed table rather than sent anywhere
  // — so it is a segment the model never sees either, for a different reason
  // from the ḥadīth: not because it is scripture, but because a table renders
  // it better, identically, and for nothing.
  check(
    'the selection splits into prose / verse / prose / hadith / takhrīj',
    segmented.segments.map((s) => s.type),
    ['prose', 'quran', 'prose', 'hadith', 'prose'],
  );

  // ---- THE INVARIANT ----------------------------------------------------
  const modelInput = segmented.prose.map((span) => span.text).join(' ');

  expect(
    'THE ḤADĪTH NEVER REACHES THE MODEL',
    !modelInput.includes(hadithArabic),
    '',
  );
  expect(
    'nor does any fragment of it',
    !hadithArabic.split(' ').some((word) => word.length > 4 && modelInput.includes(word)),
    '',
  );
  expect(
    'and neither does the verse',
    !modelInput.includes(verseArabic),
    '',
  );
  check('only the commentary spans are offered', segmented.prose.length, 2);
  expect(
    'and every one of them is commentary, never scripture',
    segmented.prose.every(
      (span) => !span.text.includes(hadithArabic) && !span.text.includes(verseArabic),
    ),
    '',
  );
  expect(
    'the takhrīj is not offered either — the table has it',
    !modelInput.includes('رواه البخاري'),
    '',
  );

  const takhrijSegment = segmented.segments[4];
  check('and it is rendered from the table', takhrijSegment.english, 'Reported by al-Bukhārī');
  check('marked as coming from the table', takhrijSegment.source, 'takhrij-table');

  const hadithSegment = segmented.segments.find((s) => s.type === 'hadith')!;
  check('the ḥadīth carries no English', hadithSegment.english, '');
  check('and says why, honestly', hadithSegment.note, HADITH_NO_OFFLINE_SOURCE);
  check('with no source attribution', hadithSegment.source, undefined);
  expect('but keeps its Arabic', hadithSegment.arabic === hadithArabic, '');

  const verseSegment = segmented.segments.find((s) => s.type === 'quran')!;
  expect(
    'the verse carries the bundled English, not a generated one',
    verseSegment.english.length > 20 && verseSegment.source === 'quran.com',
    `→ "${verseSegment.english.slice(0, 48)}…"`,
  );
  check('and its reference', verseSegment.reference, '39:53');

  // Slotting translations back must not touch scripture.
  const applied = applyProseTranslations(segmented, ['THE AUTHOR SAID', 'THIS SHOWS MERCY']);
  check('prose slots receive the translation', applied[0].english, 'THE AUTHOR SAID');
  check('and are marked as on-device output', applied[0].source, 'offline');
  check('the verse is untouched', applied[1].english, verseSegment.english);
  check('the ḥadīth is untouched', applied[3].english, '');
  check('and keeps its note', applied[3].note, HADITH_NO_OFFLINE_SOURCE);
  check('the takhrīj keeps the table rendering', applied[4].english, 'Reported by al-Bukhārī');

  // With a verified translation present, the ḥadīth gets it — still not the model.
  const withVerified = segmentSelection({
    blocks: [block] as never,
    entities: entities as never,
    startBlockId: 'x:p1:0',
    startOffset: 0,
    endBlockId: 'x:p1:0',
    endOffset: text.length,
    quran,
    english: quranEnglish,
    hadithLookup: () => ({ arabic: hadithArabic, english: 'Actions are but by intentions.' }),
  });
  const verifiedHadith = withVerified.segments.find((s) => s.type === 'hadith')!;
  check('a verified ḥadīth uses the verified English', verifiedHadith.english, 'Actions are but by intentions.');
  check('attributed to sunnah.com', verifiedHadith.source, 'sunnah.com');
  expect(
    'and it STILL never reaches the model',
    !withVerified.prose.map((s) => s.text).join(' ').includes(hadithArabic),
    '',
  );
}

console.log('\n=== Offline: sentence splitting and glossary placeholders ===');

check(
  'prose splits on the Arabic full stop',
  splitSentences('الأول. الثاني. الثالث').length,
  3,
);
expect(
  'an over-long sentence is split rather than silently truncated',
  splitSentences('كلمة '.repeat(200)).every((part) => part.length <= 320),
  `(${splitSentences('كلمة '.repeat(200)).length} parts)`,
);
expect(
  'and nothing is lost in the split',
  splitSentences('الأول. الثاني. الثالث').join(' ').includes('الثالث'),
  '',
);

{
  const glossary = [{ arabic: 'الإخلاص', english: 'sincerity' }];
  const { text, restore } = applyPlaceholders('باب الإخلاص وإحضار النية', glossary);
  expect('the term is replaced by a token', !text.includes('الإخلاص'), `→ "${text}"`);
  check('one token was issued', restore.size, 1);
  expect('placeholders survive an untouched round trip', placeholdersIntact(text, restore), '');
  check(
    'and restore to the English gloss',
    restorePlaceholders(text, restore).includes('sincerity'),
    true,
  );
  expect(
    'a mangled token is detected rather than left in the output',
    !placeholdersIntact('the model dropped it', restore),
    '',
  );
}

// ====================================================== AMENDMENT 12: TAKHRĪJ

console.log('\n=== Takhrīj lookup table ===');

const { renderTakhrij, takhrijTableSize } = await import('../src/lib/takhrij');
const { applyTakhrijTable } = await import('../src/retrieval/enrich');

expect('the table is a closed set of about thirty formulae', takhrijTableSize() >= 30, `(${takhrijTableSize()})`);
check('متفق عليه', renderTakhrij('متفق عليه')?.english, 'Agreed upon — al-Bukhārī and Muslim both report it');
check('رواه البخاري', renderTakhrij('رواه البخاري')?.english, 'Reported by al-Bukhārī');
check('with harakāt, same entry', renderTakhrij('رَوَاهُ مُسْلِمٌ')?.english, 'Reported by Muslim');
check('with trailing punctuation', renderTakhrij('رواه الترمذي.')?.english, 'Reported by at-Tirmidhī');
check(
  'the collective formula is expanded by convention',
  renderTakhrij('رواه الأربعة')?.english,
  'Reported by the four — Abū Dāwūd, at-Tirmidhī, an-Nasāʾī and Ibn Mājah',
);
check(
  'two formulae on one line',
  renderTakhrij('متفق عليه، رواه مسلم')?.english,
  'Agreed upon — al-Bukhārī and Muslim both report it; Reported by Muslim',
);
check('ordinary commentary is not a takhrīj', renderTakhrij('وهذا يدل على سعة الرحمة'), null);
check(
  'and neither is half a takhrīj',
  renderTakhrij('رواه البخاري وفي هذا دليل على المراد'),
  null,
);

// The acceptance criterion: identical on both paths. The offline path was
// checked above, inside the segmentation test; this is the cloud one, which
// overwrites whatever the model produced.
{
  const fromModel = {
    type: 'prose' as const,
    arabic: 'متفق عليه',
    english: 'It is agreed on by both of them',
    source: 'model' as const,
  };
  const corrected = applyTakhrijTable(fromModel);
  check(
    'the cloud path renders it from the table too',
    corrected.english,
    'Agreed upon — al-Bukhārī and Muslim both report it',
  );
  check('and says where that came from', corrected.source, 'takhrij-table');
  check(
    'identical wording on both paths',
    corrected.english,
    renderTakhrij('متفق عليه')?.english,
  );
  check(
    'a prose segment is returned untouched',
    applyTakhrijTable({ type: 'prose', arabic: 'وهذا بيان', english: 'And this is a clarification', source: 'model' }).source,
    'model',
  );
}

// ========================================================== AMENDMENT 12: QUL

console.log('\n=== QUL: reading the real resource files ===');

const { readQulJson, readQulSqlite, QulFormatError } = await import('../src/qul/read');
const {
  tafsirFor,
  similarFor,
  topicsFor,
  surahInfoFor,
  qulTextBlocks,
} = await import('../src/qul/service');

// The real QUL downloads, kept in qul/ and treated exactly like the Shamela
// fixtures: the readers are verified against the files the service actually
// hands out, not against a shape someone reasoned their way to.
const QUL = join(process.cwd(), 'qul');
const QUL_FILES = [
  'ar-tafsir-muyassar.json',
  'matching-ayah.json',
  'surah-info-en.json',
  'topics.db',
];
const missingQul = QUL_FILES.filter((name) => !existsSync(join(QUL, name)));
if (missingQul.length > 0) {
  failures++;
  checks++;
  console.log(
    `  FAIL  the QUL sample resources are missing from qul/: ${missingQul.join(', ')}.\n` +
      '        Download them from qul.tarteel.ai and drop them in qul/, or the readers below are unverified.',
  );
}

/**
 * Storage with only the QUL methods, in memory.
 *
 * The service functions take a StorageAdapter and use five of its methods, so
 * the rest are absent rather than stubbed — a call to one would fail loudly,
 * which is the intended outcome if the service ever starts reaching further.
 */
function memoryQulStorage() {
  const entries = new Map<string, { id: string; resourceId: string; key: string; value: unknown }>();
  return {
    async putQulEntries(list: { id: string; resourceId: string; key: string; value: unknown }[]) {
      for (const entry of list) entries.set(entry.id, entry);
    },
    async getQulEntry(resourceId: string, key: string) {
      return entries.get(`${resourceId}|${key}`);
    },
    async getQulEntries(resourceId: string, keys: string[]) {
      return keys
        .map((key) => entries.get(`${resourceId}|${key}`))
        .filter((entry) => entry !== undefined);
    },
    size: () => entries.size,
  };
}

/** Load a reading into a memory store under a made-up resource id. */
async function install(
  store: ReturnType<typeof memoryQulStorage>,
  reading: { kind: string; entries: { key: string; value: unknown }[] },
  id: string,
) {
  await store.putQulEntries(
    reading.entries.map((entry) => ({
      id: `${id}|${entry.key}`,
      resourceId: id,
      key: entry.key,
      value: entry.value,
    })),
  );
  return { id, kind: reading.kind, name: id, fileName: `${id}.json`, byteSize: 0, entryCount: reading.entries.length, format: 'json', importedAt: 0 };
}

const store = memoryQulStorage();
const installed: unknown[] = [];

// ---- tafsīr (JSON, with QUL's leader/pointer grouping) --------------------
{
  const raw = JSON.parse(readFileSync(join(QUL, 'ar-tafsir-muyassar.json'), 'utf8'));
  const reading = readQulJson(raw, 'ar-tafsir-muyassar.json');

  check('detected as tafsīr, from the contents', reading.kind, 'tafsir');
  check('covering every āyah', reading.entries.length, 6236);

  const leader = reading.entries.find((entry) => entry.key === '2:45')!;
  const member = reading.entries.find((entry) => entry.key === '2:46')!;
  check('a grouped passage is stored on its first āyah', (leader.value as { t: string }).t, 'passage');
  check('covering the whole group', (leader.value as { ayahKeys: string[] }).ayahKeys, ['2:45', '2:46']);
  check('and the other member points at it', member.value, { t: 'pointer', to: '2:45' });

  installed.push(await install(store, reading, 'r-tafsir'));
}

// ---- ayah matching (JSON) -------------------------------------------------
{
  const raw = JSON.parse(readFileSync(join(QUL, 'matching-ayah.json'), 'utf8'));
  const reading = readQulJson(raw, 'matching-ayah.json');
  check('detected as ayah matching', reading.kind, 'ayah-matching');
  check('with the āyāt that have matches', reading.entries.length, 1162);
  installed.push(await install(store, reading, 'r-matching'));
}

// ---- surah info (JSON) ----------------------------------------------------
{
  const raw = JSON.parse(readFileSync(join(QUL, 'surah-info-en.json'), 'utf8'));
  const reading = readQulJson(raw, 'surah-info-en.json');
  check('detected as surah info', reading.kind, 'surah-info');
  check('all 114 sūrahs', reading.entries.length, 114);
  installed.push(await install(store, reading, 'r-surah'));
}

// ---- topics (real SQLite) -------------------------------------------------
//
// Read here with node's own SQLite rather than sql.js: the app's reader imports
// a .wasm asset through Vite, which does not belong in this SSR-built script.
// What is being verified is the normalization — the table shape, the reverse
// index — and that is the same code either way.
{
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(QUL, 'topics.db'), { readOnly: true });
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => String((row as { name: unknown }).name));

  const tables = names.map((name) => {
    const rows = db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
    return { name, columns: Object.keys(rows[0] ?? {}), rows };
  });
  db.close();

  const reading = readQulSqlite(tables, 'topics.db');
  check('detected as topics, from the columns', reading.kind, 'topics');
  check('read from SQLite', reading.format, 'sqlite');

  const topics = reading.entries.filter((entry) => entry.key.startsWith('topic:'));
  const index = reading.entries.filter((entry) => entry.key.startsWith('ayah:'));
  check('every topic row', topics.length, 2512);
  expect('and a reverse index built at import', index.length > 1000, `(${index.length} āyāt)`);

  installed.push(await install(store, reading, 'r-topics'));
}

// ---- refusal --------------------------------------------------------------
{
  let refused = '';
  try {
    readQulJson({ hello: 'world' }, 'mystery.json');
  } catch (error) {
    refused = error instanceof QulFormatError ? error.message : 'wrong error type';
  }
  expect(
    'an unrecognised shape is refused rather than half-imported',
    refused.includes('not sūrah or āyah references'),
    `→ "${refused.slice(0, 60)}…"`,
  );
}

console.log('\n=== QUL: every tab resolves offline, from the reference alone ===');

{
  // Tapping 2:46 must arrive at the passage written on 2:45 and say so.
  const passages = await tafsirFor(store as never, installed as never, '2:46');
  check('the pointer is followed to the passage', passages.length, 1);
  check('and the passage says what it covers', passages[0].coverage, 'البقرة 45–46');
  expect('with real commentary text', passages[0].text.length > 100, '');

  const direct = await tafsirFor(store as never, installed as never, '2:255');
  expect('an ungrouped āyah resolves directly', direct.length === 1, '');
  check('covering only itself', direct[0].coverage, 'البقرة 255');

  // A range reference resolves on its first āyah, as every QUL resource is keyed.
  const ranged = await tafsirFor(store as never, installed as never, '2:255-2:257');
  expect('a range resolves on its first āyah', ranged.length === 1, '');

  const blocks = qulTextBlocks(passages[0].text);
  expect('QUL html becomes real blocks, not innerHTML', blocks.length > 0, `(${blocks.length})`);
  expect('with the tags gone', !blocks.some((b) => b.text.includes('<')), '');

  const similar = await similarFor(store as never, installed as never, '1:1', quran, quranEnglish);
  expect('similar āyāt are found', similar.length > 0, `(${similar.length})`);
  check('strongest match first', similar[0].ayahKey, '27:30');
  expect('shown with the muṣḥaf Arabic', similar[0].arabic.length > 10, '');
  expect('and the bundled English', similar[0].english.length > 10, `→ "${similar[0].english.slice(0, 40)}…"`);

  const topics = await topicsFor(store as never, installed as never, '1:1');
  expect('topics for this āyah are found', topics.length > 0, `(${topics.length})`);
  expect(
    'narrower topics first',
    topics.length < 2 || topics[0].ayahKeys.length <= topics[topics.length - 1].ayahKeys.length,
    '',
  );

  const surah = await surahInfoFor(store as never, installed as never, '2:255');
  check('the sūrah description resolves', surah?.info.surahName, 'Al-Baqarah');
}

console.log('\n=== QUL: the compiled view is fenced to what was retrieved ===');

{
  const { renderCompilePrompt, compileCacheKey } = await import('../src/qul/compile');

  const prompt = renderCompilePrompt({
    ayahKey: '2:255',
    ayahLabel: 'البقرة 255',
    arabic: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ',
    english: 'Allah! There is no god but Him',
    englishAttribution: 'Khattab',
    tafsir: [{ name: 'al-Muyassar', coverage: 'البقرة 255', text: 'شرح الآية' }],
    similar: [{ label: 'آل عمران 2', arabic: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ', english: 'Allah — there is no god but Him' }],
    topics: [{ name: 'Allah', description: 'the one true God' }],
    surah: null,
  });

  expect('the prompt carries the retrieved tafsīr', prompt.includes('شرح الآية'), '');
  expect('and the related āyah', prompt.includes('آل عمران 2'), '');
  expect('and says to use nothing else', prompt.includes('Use nothing else.'), '');
  expect(
    'a tab that is not installed contributes nothing',
    !prompt.includes('<surah'),
    '',
  );

  const key = compileCacheKey({ ayahKey: '2:255', resourceIds: ['a', 'b'], providerId: 'anthropic', model: 'claude-sonnet-5' });
  check(
    'the cache key does not depend on resource order',
    compileCacheKey({ ayahKey: '2:255', resourceIds: ['b', 'a'], providerId: 'anthropic', model: 'claude-sonnet-5' }),
    key,
  );
  expect(
    'but installing another resource regenerates it',
    compileCacheKey({ ayahKey: '2:255', resourceIds: ['a', 'b', 'c'], providerId: 'anthropic', model: 'claude-sonnet-5' }) !== key,
    '',
  );
}

// ======================================================= AMENDMENT 12: DORAR

console.log('\n=== dorar.net: grading in, English never ===');

const { parseDorarResponse, parseDorarHtml, searchTermFor } = await import('../src/retrieval/dorar');
const { lookupHadith } = await import('../src/retrieval/HadithSource');

{
  // A real response, unmodified: a search for «إنما الأعمال بالنيات» fetched
  // through the dev proxy. Same rule as the Shamela fixtures — the selectors
  // are written against what the service actually sends, and this fails loudly
  // if that changes.
  const body = read('dorar-search.json');
  const html = (JSON.parse(body) as { ahadith: { result: string } }).ahadith.result;

  const hits = parseDorarResponse(body);
  check('every record in the real response is parsed', hits.length, 15);

  // ---- IT RETURNS NO ENGLISH -------------------------------------------
  //
  // The amendment's instruction, checked against the real payload rather than
  // taken on trust: this is what decides that dorar is a grading source and
  // not a translation one.
  const latin = html.replace(/<[^>]+>/g, ' ').match(/[A-Za-z]{3,}/g) ?? [];
  check('THE ENDPOINT RETURNS NO ENGLISH AT ALL', latin.length, 0);

  const nawawi = hits.find((hit) => hit.attribution.mohdith === 'النووي')!;
  check('the narrator', nawawi.attribution.rawi, '[عمر بن الخطاب]');
  check('the grading scholar', nawawi.attribution.mohdith, 'النووي');
  check('the source book', nawawi.attribution.book, 'الإيضاح في مناسك الحج');
  check('the number or page', nawawi.attribution.numberOrPage, '40');
  check('the grade', nawawi.attribution.grade, 'ثبت في الحديث المجمع على صحته');
  expect(
    'the matn, with dorar’s result number stripped',
    !/^\d/.test(nawawi.arabic) &&
      normalize(nawawi.arabic).startsWith(normalize('إنما الأعمال')),
    `→ "${nawawi.arabic.slice(0, 40)}"`,
  );
  expect(
    'and the separator rules are not matn',
    !hits.some((hit) => hit.arabic.includes('---')),
    '',
  );
  expect(
    'every record carries a grade',
    hits.every((hit) => hit.attribution.grade !== null),
    `(${hits.filter((hit) => hit.attribution.grade).length}/${hits.length})`,
  );
  check(
    'a field this endpoint does not return stays null rather than guessed',
    nawawi.attribution.takhrij,
    null,
  );

  // The label «المحدث» is a substring of «خلاصة حكم المحدث», so the longer one
  // has to win or every grade would be read as a scholar's name.
  expect(
    'the longer label is not shadowed by the shorter',
    hits.every((hit) => hit.attribution.mohdith !== hit.attribution.grade),
    '',
  );

  // JSONP unwrapping — the callback parameter means a client may get this form.
  const jsonp = `dorarCallback(${JSON.stringify({ ahadith: { result: html } })})`;
  check('a JSONP wrapper is unwrapped', parseDorarResponse(jsonp).length, 15);
  check('bare JSON works too', parseDorarHtml(html).length, 15);
  check('and a broken body yields nothing rather than throwing', parseDorarResponse('<html>403</html>').length, 0);

  check(
    'the search term is the opening of the matn',
    searchTermFor('إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته'),
    'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
  );

  // Inline tags must be removed, not turned into whitespace. dorar wraps every
  // matched query term mid-phrase, so flattening tags to spaces inserts one
  // before each comma that follows a </span>. (dorar's own matn does contain
  // « . » with a real space — that is its formatting, not an artefact — so the
  // check is on the closing-tag boundary specifically.)
  check(
    'a span closing mid-phrase leaves the comma attached',
    parseDorarHtml(
      '<div class="hadith">1 - <span class="search-keys">بالنياتِ</span>، وإنما لكل امرئ</div>' +
        '<div class="hadith-info"><span class="info-subtitle">الراوي:</span> عمر</div>',
    )[0]?.arabic,
    'بالنياتِ، وإنما لكل امرئ',
  );
  // On the real response the test is that the parser ADDS none. dorar's own
  // typography does put a space before some commas, and preserving that is
  // correct; what would be wrong is manufacturing more of them at every tag
  // boundary, which is exactly what flattening tags to whitespace did.
  const spacedCommasInSource = (html.match(/\s،/g) ?? []).length;
  const spacedCommasParsed = hits.reduce(
    (total, hit) => total + (hit.arabic.match(/\s،/g) ?? []).length,
    0,
  );
  expect(
    'and the real response gains no spaced commas in the parse',
    spacedCommasParsed <= spacedCommasInSource,
    `(${spacedCommasParsed} parsed vs ${spacedCommasInSource} in the source)`,
  );
  expect(
    'while commas that were attached stay attached',
    hits.some((hit) => /\S،/.test(hit.arabic)),
    '',
  );
}

// ================================================ AMENDMENT 12a: WHICH RECORD

console.log('\n=== dorar.net: the narrator decides, and nothing is auto-selected ===');

const { foldName, narratorIn, narratorMatches } = await import('../src/retrieval/narrator');
const { searchDorar } = await import('../src/retrieval/dorar');

{
  // ---- reading the narrator out of the book ------------------------------
  //
  // The isnād formula precedes the matn, and `عن` alone is far too common to
  // anchor on, so the anchor is the honorific that closes the formula.
  check(
    'the narrator is read from the isnād formula',
    narratorIn('وعن أمير المؤمنين أبي حفص عمر بن الخطاب رضي الله عنه قال: سمعت رسول الله'),
    'أبي حفص عمر بن الخطاب',
  );
  check(
    'a short form too',
    narratorIn('وعن أبي هريرة رضي الله عنه قال: قال رسول الله صلى الله عليه وسلم'),
    'أبي هريرة',
  );
  check(
    'and the dual honorific',
    narratorIn('وعن ابن عمر رضي الله عنهما أن رسول الله صلى الله عليه وسلم قال'),
    'ابن عمر',
  );
  check(
    'a bare matn names no narrator, and that is the right answer',
    narratorIn('إنما الأعمال بالنيات وإنما لكل امرئ ما نوى'),
    null,
  );

  // Shapes taken from the real pages in fixtures/nass-9260-1-50.json rather
  // than invented: the collection prints a dash before the honorific, and
  // wraps ʿĀʾishah in two titles before naming her.
  check(
    'a dash before the honorific is not part of the name',
    narratorIn('وعن عائشة - رضي الله عنها قالت: قال رسول الله'),
    'عائشة',
  );
  check(
    'and the Arabic tatweel dash the book also uses',
    narratorIn('وعن عائشة ـ رضي الله عنها ـ قالت'),
    'عائشة',
  );
  check(
    'titles introduce the name and are dropped',
    narratorIn('وعن أم المؤمنين أم عبد الله عائشة رضي الله عنها قالت'),
    'أم عبد الله عائشة',
  );
  expect(
    'which still matches the bare name dorar gives',
    narratorMatches(
      narratorIn('وعن أم المؤمنين أم عبد الله عائشة رضي الله عنها قالت') ?? '',
      'عائشة',
    ),
    '',
  );

  // ---- the two sides are written differently -----------------------------
  check('brackets are stripped', foldName('[عمر بن الخطاب]'), foldName('عمر بن الخطاب'));
  expect(
    'bracketed and unbracketed forms match',
    narratorMatches('عمر بن الخطاب', '[عمر بن الخطاب]'),
    '',
  );
  expect(
    'the genitive after «عن» matches the nominative dorar gives',
    narratorMatches('أبي سعيد الخدري', 'أبو سعيد الخدري'),
    '',
  );
  expect(
    'a short form matches the full name',
    narratorMatches('عمر', 'عمر بن الخطاب'),
    '',
  );
  expect(
    'the honorific on one side only does not break it',
    narratorMatches('عمر بن الخطاب رضي الله عنه', '[عمر بن الخطاب]'),
    '',
  );
  expect(
    'ابن and بن are the same word',
    narratorMatches('ابن عمر', 'عبد الله بن عمر'),
    '',
  );
  expect(
    'a stray bidi mark does not defeat the match',
    narratorMatches('أنس بن مالك', 'أنس بن مالك‏'),
    '',
  );
  expect(
    'DIFFERENT COMPANIONS DO NOT MATCH',
    !narratorMatches('عمر بن الخطاب', 'أبو سعيد الخدري'),
    '',
  );

  // ---- selection over the real response ----------------------------------
  const body = read('dorar-search.json');
  const http = {
    async get(url: string) {
      check('dorar is queried by text, not by number', url.includes('skey='), true);
      return { status: 200, ok: true, body };
    },
  };

  const umar = await searchDorar(http as never, {
    arabicText: 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
    narrator: 'أبي حفص عمر بن الخطاب',
  });

  // THE CORRECTION. The top-ranked record is Abū Saʿīd al-Khudrī's, graded by
  // Ibn ʿAbd al-Barr as an error in the isnād. Riyāḍ aṣ-Ṣāliḥīn's ḥadīth is
  // ʿUmar's, and it opens both Ṣaḥīḥs.
  // Fifteen records come back; nine of them are ʿUmar's, four are Abū Saʿīd's,
  // and one each are Anas's and ʿAlī's.
  check('THE TOP RESULT IS NOT TAKEN', umar.diagnostics.parsed, 15);
  check('only ʿUmar’s narration is kept', umar.hits.length, 9);
  expect(
    'and every one of them is his',
    umar.hits.every((hit) => narratorMatches('عمر بن الخطاب', hit.attribution.rawi ?? '')),
    '',
  );
  expect(
    'ABŪ SAʿĪD’S DEFECTIVE GRADING IS NOT AMONG THEM',
    !umar.hits.some((hit) => (hit.attribution.rawi ?? '').includes('الخدري')),
    '',
  );

  // Several scholars disagreeing about one narration is information, not noise.
  const graders = [...new Set(umar.hits.map((hit) => hit.attribution.mohdith))];
  expect(
    'all the gradings of that narration survive, not one',
    graders.length >= 5,
    `→ ${graders.slice(0, 5).join('، ')}…`,
  );
  expect(
    'each carries its own grader, source and grading',
    umar.hits.every((hit) => hit.attribution.mohdith && hit.attribution.grade),
    '',
  );

  // ---- no narrator match means no grading --------------------------------
  const stranger = await searchDorar(http as never, {
    arabicText: 'إنما الأعمال بالنيات',
    narrator: 'عائشة',
  });
  check('a narrator nobody narrated yields nothing', stranger.hits.length, 0);
  expect(
    'and says so rather than falling back to the top hit',
    (stranger.diagnostics.problem ?? '').includes('none narrated by'),
    `→ "${stranger.diagnostics.problem?.slice(0, 60)}…"`,
  );

  const noNarrator = await searchDorar(http as never, {
    arabicText: 'إنما الأعمال بالنيات',
    narrator: null,
  });
  check('no narrator at all means no request and no grading', noNarrator.hits.length, 0);
  check('and no network call was made', noNarrator.diagnostics.status, 0);

  // ---- diagnostics -------------------------------------------------------
  expect('diagnostics carry the request', umar.diagnostics.url.includes('skey='), '');
  expect('the raw response', umar.diagnostics.rawResponse.length > 100, '');
  check('the narrator matched against', umar.diagnostics.narrator, 'أبي حفص عمر بن الخطاب');
  check('how many records passed the filter', umar.diagnostics.matched, 9);
  expect(
    'and every narrator dorar returned, so a near-miss is visible',
    umar.diagnostics.narratorsSeen.length >= 3,
    `→ ${umar.diagnostics.narratorsSeen.slice(0, 3).join(' · ')}`,
  );

  // ---- a changed page degrades, it does not throw ------------------------
  for (const [label, broken] of [
    ['html that is no longer JSON', '<html>503</html>'],
    ['JSON with no result field', '{"ahadith":{}}'],
    ['a result that is not a string', '{"ahadith":{"result":42}}'],
    ['an empty body', ''],
  ] as const) {
    const degraded = await searchDorar(
      { async get() { return { status: 200, ok: true, body: broken }; } } as never,
      { arabicText: 'إنما الأعمال بالنيات', narrator: 'عمر بن الخطاب' },
    );
    check(`${label} → no result, no throw`, degraded.hits.length, 0);
  }

  const refused = await searchDorar(
    { async get() { return { status: 403, ok: false, body: '' }; } } as never,
    { arabicText: 'إنما الأعمال بالنيات', narrator: 'عمر بن الخطاب' },
  );
  expect(
    'an HTTP refusal is reported rather than swallowed',
    (refused.diagnostics.problem ?? '').includes('403'),
    '',
  );

  // ---- end to end, through lookupHadith ----------------------------------
  const hadiths = new Map<string, unknown>();
  const storage = {
    async getHadith(reference: string) {
      return hadiths.get(reference);
    },
    async putHadith(record: { reference: string }) {
      hadiths.set(record.reference, record);
    },
  };

  const bookPassage =
    'وعن أمير المؤمنين أبي حفص عمر بن الخطاب رضي الله عنه قال: سمعت رسول الله صلى الله عليه وسلم يقول:';
  const bookMatn = 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى';

  const { record, diagnostics } = await lookupHadith(
    http as never,
    storage as never,
    { reference: 'riyadussalihin:1', arabicText: bookMatn, contextText: bookPassage },
    // No sunnah.com key: the only source consulted is dorar.
    { sunnahApiKey: '', preferred: 'dorar', online: true },
  );

  // ---- THE INVARIANT, ON THE DORAR PATH --------------------------------
  check('NO ENGLISH IS PRODUCED FROM DORAR', record?.english, '');
  check('and the record says which source it came from', record?.sourceId, 'dorar');

  check('the narrator was read from the surrounding passage', record?.narrator, 'أبي حفص عمر بن الخطاب');
  check('every grading of his narration is kept', record?.gradings?.length, 9);
  check('no single representative grade is invented', record?.grade, null);
  expect('and the diagnostics travelled with it', diagnostics?.matched === 9, '');

  // The book's text is what the reader has in front of them.
  check('the Arabic stays the book’s own matn', record?.arabic, bookMatn);
  expect(
    'dorar’s variant wording is not substituted',
    !(record?.arabic ?? '').includes('يعني حديث'),
    '',
  );

  // Cached, so a second lookup needs no network at all.
  const offline = await lookupHadith(
    { async get() { throw new Error('the network was used'); } } as never,
    storage as never,
    { reference: 'riyadussalihin:1', arabicText: bookMatn, contextText: bookPassage },
    { sunnahApiKey: '', preferred: 'dorar', online: false },
  );
  check(
    'a looked-up ḥadīth is available offline afterwards',
    offline.record?.gradings?.length,
    9,
  );
  check('and still carries no English', offline.record?.english, '');
}

// ============================================== AMENDMENT 13: PANEL SCOPING

console.log('\n=== Card panel: three scopes ===');

const { scopeToSection, scopeContaining, bufferFor } = await import(
  '../src/ui/reader/cardLayout'
);

{
  // Sixty blocks over three sections of twenty.
  const scopeBlocks = Array.from({ length: 60 }, (_, index) => ({
    id: `b:${index}`,
    order: index,
    tocNodeId: `toc:${Math.floor(index / 20)}`,
    text: '',
  }));

  const cardAt = (index: number) => ({
    id: `c:${index}`,
    kind: 'translation',
    startBlockId: `b:${index}`,
    endBlockId: `b:${index}`,
    startOffset: 0,
    endOffset: 1,
    createdAt: index,
    collapsed: false,
  });

  // One card every five blocks.
  const scopeCards = Array.from({ length: 12 }, (_, index) => cardAt(index * 5));

  // Reading blocks 20–29: ten on screen, so the buffer is five either side and
  // the window runs 15–34.
  const onScreen = { startIndex: 20, endIndex: 29 };
  check('the buffer is about half a screen', bufferFor(onScreen), 5);

  const visible = scopeToVisible(scopeCards as never, scopeBlocks as never, onScreen);
  check(
    'Visible shows the cards anchored on screen, plus the buffer',
    visible.map((card) => card.startBlockId),
    ['b:15', 'b:20', 'b:25', 'b:30'],
  );

  // The buffer is the point: a card must not vanish the instant its anchor
  // crosses the edge of the viewport.
  expect(
    'a card just off screen is still shown',
    visible.some((card) => card.startBlockId === 'b:15'),
    '(anchored 5 blocks above the viewport)',
  );
  expect(
    'one well beyond it is not',
    !visible.some((card) => card.startBlockId === 'b:40'),
    '',
  );

  const section = scopeToSection(scopeCards as never, scopeBlocks as never, 'toc:1');
  check(
    'Section shows the whole bāb, on screen or not',
    section.map((card) => card.startBlockId),
    ['b:20', 'b:25', 'b:30', 'b:35'],
  );
  // The two are different windows, not nested ones: Visible reaches back into
  // the previous bāb for a card just above the viewport, while Section reaches
  // forward to one at the far end of this bāb that is nowhere near the screen.
  expect(
    'Visible reaches out of the bāb, Section does not',
    visible.some((card) => card.startBlockId === 'b:15') &&
      !section.some((card) => card.startBlockId === 'b:15'),
    '',
  );
  expect(
    'Section reaches to the end of the bāb, Visible does not',
    section.some((card) => card.startBlockId === 'b:35') &&
      !visible.some((card) => card.startBlockId === 'b:35'),
    '',
  );

  check('All shows everything', scopeCards.length, 12);

  // A book whose skeleton never parsed has no sections; showing everything is
  // the honest answer to "cards in this section" when there are none.
  check(
    'with no TOC node, Section degrades to everything',
    scopeToSection(scopeCards as never, scopeBlocks as never, null).length,
    12,
  );

  // ---- cross-scope marker access ---------------------------------------
  //
  // Tapping a marker must always open its card. The panel switches to the
  // narrowest scope that holds it rather than doing nothing, which from the
  // user's side is indistinguishable from a broken marker.
  const context = { blocks: scopeBlocks as never, visible: onScreen, tocNodeId: 'toc:1' };
  check('a card on screen resolves to Visible', scopeContaining(cardAt(25) as never, context), 'visible');
  check('one elsewhere in the bāb resolves to Section', scopeContaining(cardAt(38) as never, context), 'section');
  check('one in another volume resolves to All', scopeContaining(cardAt(55) as never, context), 'all');

  // Scoping never invents or loses a card: each scope is a subset of the next.
  const visibleIds = new Set(visible.map((card) => card.id));
  const sectionIds = new Set(section.map((card) => card.id));
  expect(
    'Visible is a subset of Section here',
    [...visibleIds].filter((id) => !sectionIds.has(id)).length === 1,
    '(only the card in the previous bāb falls outside)',
  );
  expect(
    'and every scoped card is a real card',
    [...section, ...visible].every((card) => scopeCards.some((entry) => entry.id === card.id)),
    '',
  );
}

// ============================================== AMENDMENT 14: BOOK CATALOG

console.log('\n=== Catalog: pointers, not books ===');

const {
  groupEntries,
  importOrder,
  totalPages: catalogTotalPages,
  estimateMinutes,
} = await import('../src/catalog/catalogService');

{
  const catalog = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'catalog.json'), 'utf8'),
  ) as {
    version: number;
    entries: {
      shamelaId: number;
      title: string;
      titleEn: string;
      author: string;
      role: string;
      group: string;
      approxPages: number;
      recommended: boolean;
      description: string;
    }[];
  };

  expect('the catalog is versioned', catalog.version >= 1, `(v${catalog.version})`);
  expect('and has entries', catalog.entries.length >= 3, `(${catalog.entries.length})`);

  // THE POINT OF THE AMENDMENT: pointers, never texts. An entry carries an ID
  // and a description; a book's actual pages are never in here.
  expect(
    'EVERY ENTRY IS A POINTER, NOT A TEXT',
    catalog.entries.every(
      (entry) =>
        typeof entry.shamelaId === 'number' &&
        entry.shamelaId > 0 &&
        !('pages' in entry) &&
        !('blocks' in entry) &&
        !('content' in entry),
    ),
    '',
  );
  expect(
    'and the whole catalog is small enough to be a bibliography',
    JSON.stringify(catalog).length < 20000,
    `(${JSON.stringify(catalog).length} bytes for ${catalog.entries.length} works)`,
  );

  // Every factual field is read off Shamela by scripts/build-catalog.ts, so a
  // blank one means the build script silently failed rather than refused.
  expect(
    'every entry carries a real title, author and page count',
    catalog.entries.every(
      (entry) =>
        entry.title.trim() !== '' && entry.author.trim() !== '' && entry.approxPages > 0,
    ),
    '',
  );
  expect(
    'and a role the importer understands',
    catalog.entries.every((entry) =>
      ['reading', 'dictionary', 'reference'].includes(entry.role),
    ),
    '',
  );

  check(
    'the primary text is in it, with its real page count',
    catalog.entries.find((entry) => entry.shamelaId === 9260)?.approxPages,
    3784,
  );
  check(
    'the dictionary is filed as one',
    catalog.entries.find((entry) => entry.shamelaId === 12145)?.role,
    'dictionary',
  );
  check(
    'and Fatḥ al-Bārī as a reference work, not something to read through',
    catalog.entries.find((entry) => entry.shamelaId === 1673)?.role,
    'reference',
  );

  // Grouped by purpose rather than by Shamela's taxonomy.
  const groups = groupEntries(catalog.entries as never).map(([name]) => name);
  expect(
    'grouped by what each book is for',
    groups.includes('Texts to study') && groups.includes('Dictionaries'),
    `→ ${groups.join(' · ')}`,
  );

  // Smallest first, so something is readable while the largest still crawls.
  const ordered = importOrder(catalog.entries as never);
  expect(
    'import order is smallest first',
    ordered[0].approxPages <= ordered[ordered.length - 1].approxPages,
    `(${ordered[0].approxPages} … ${ordered[ordered.length - 1].approxPages} pages)`,
  );
  check(
    'nothing is dropped from the queue',
    ordered.length,
    catalog.entries.length,
  );
  check(
    'the size shown before committing is the sum of what was chosen',
    catalogTotalPages(catalog.entries.slice(0, 2) as never),
    catalog.entries[0].approxPages + catalog.entries[1].approxPages,
  );
  expect('and is also given as a time', estimateMinutes(3784) > 1, `(${estimateMinutes(3784)} min for 9260)`);
}

console.log('\n=== Book 21812 parses as a hadith commentary ===');

{
  // A real fetched page, like every other fixture here. The acceptance
  // criterion is that this book imports *and reads* correctly, which means the
  // structure profile has to be detected — it decides how the reader styles
  // matn against commentary.
  const arbaeen = parseBookPage(read('book-21812.html'), 21812);
  if (!arbaeen) {
    failures++;
    checks++;
    console.log('  FAIL  parseBookPage returned null for 21812');
  } else {
    check('title', arbaeen.title, 'شرح الأربعين النووية');
    check('category', arbaeen.category, 'شروح الحديث');
    check('STRUCTURE PROFILE', arbaeen.structureProfile, 'hadith-commentary');
    expect('the table of contents parsed', arbaeen.toc.length > 20, `(${arbaeen.toc.length} nodes)`);
  }

  const page = parsePage(read('page-21812-20.html'), 21812);
  if (!page) {
    failures++;
    checks++;
    console.log('  FAIL  parsePage returned null for 21812 page 20');
  } else {
    expect('a content page yields blocks', page.blocks.length > 0, `(${page.blocks.length})`);
    check('the page count comes off the pager', page.totalPages, 403);
    expect(
      'and the blocks carry real Arabic',
      page.blocks.some((block) => /[؀-ۿ]{10,}/.test(block.text)),
      '',
    );
  }
}

console.log('\n=== The deployed proxy (proxy/worker.js) ===');

{
  // The path prefixes live in three files that must agree: vite.config.ts for
  // the dev server, proxy/worker.js for the deployed app, and PROXIED_ORIGINS
  // in WebHttpClient.ts for the client that talks to both. Drift between them
  // is invisible until an import fails on the tablet only, which is the worst
  // place to discover it. So the Worker is exercised here against a stubbed
  // upstream, and its routing table is compared against the client's.
  const workerModule = await import('../proxy/worker.js');
  const proxyWorker = workerModule.default as {
    fetch(request: Request, env: Record<string, string>): Promise<Response>;
  };

  const ALLOWED = 'https://khacha329.github.io';
  const env = { ALLOWED_ORIGINS: ALLOWED };
  const PROXY = 'https://hashiya-proxy.test.workers.dev';

  let sent: { target: string; headers: Record<string, string> } | null = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (target: string, init: RequestInit) => {
    sent = {
      target: String(target),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
    };
    return new Response('<html>مرحبا</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'sess=leak' },
    });
  }) as typeof globalThis.fetch;

  const call = (path: string, headers: Record<string, string> = { Origin: ALLOWED }, method = 'GET') =>
    proxyWorker.fetch(new Request(PROXY + path, { method, headers }), env);

  try {
    // Every proxy-only upstream the client knows about must have a route, or
    // that host is unreachable in the deployed app.
    const { PROXIED_ORIGINS } = (await import('../src/platform/http/WebHttpClient')) as unknown as {
      PROXIED_ORIGINS: [string, string, boolean][];
    };
    for (const [origin, prefix, needsProxy] of PROXIED_ORIGINS) {
      if (!needsProxy && origin !== 'https://api.quran.com') continue;
      const response = await call(`${prefix}/probe`);
      if (origin === 'https://api.sunnah.com') {
        // Deliberately absent: enabling it would route a sunnah.com API key
        // through the Worker. See the comment in proxy/worker.js.
        check(`${prefix} is off by default (API key never transits)`, response.status, 404);
      } else {
        check(`${prefix} reaches ${origin}`, sent?.target, `${origin}/probe`);
      }
    }

    let response = await call('/shamela/book/12106');
    check('the upstream content type survives', response.headers.get('Content-Type'), 'text/html; charset=utf-8');
    check('CORS echoes the caller', response.headers.get('Access-Control-Allow-Origin'), ALLOWED);
    check('Vary: Origin, so a shared cache cannot cross the streams', response.headers.get('Vary'), 'Origin');
    check('an upstream Set-Cookie is not passed back', response.headers.get('Set-Cookie'), null);

    // A search term is percent-encoded Arabic. Re-encoding it here would be a
    // silent corruption of exactly the kind the lossless-text rule forbids.
    await call('/dorar/dorar_hadith_search?q=%D8%A7%D9%84%D8%A5%D8%AE%D9%84%D8%A7%D8%B5&page=2');
    check(
      'percent-encoded Arabic and the query string pass verbatim',
      sent?.target,
      'https://dorar.net/dorar_hadith_search?q=%D8%A7%D9%84%D8%A5%D8%AE%D9%84%D8%A7%D8%B5&page=2',
    );

    await call('/shamela/book/1', {
      Origin: ALLOWED,
      Cookie: 'session=secret',
      Authorization: 'Bearer secret',
    });
    expect('shamela is given a browser User-Agent', Boolean(sent?.headers['user-agent']?.startsWith('Mozilla/5.0')));
    check('Cookie is never forwarded', sent?.headers.cookie, undefined);
    check('Authorization is never forwarded', sent?.headers.authorization, undefined);

    await call('/dorar/x');
    check('dorar is given the Referer it demands', sent?.headers.referer, 'https://dorar.net/');

    response = await call('/shamela/book/1', { Origin: 'https://evil.example' });
    check('an unlisted origin is refused', response.status, 403);
    // Without this the misconfiguration shows up as an opaque browser CORS
    // error with the explanation in a body the page may not read.
    check(
      'and can still read the reason',
      response.headers.get('Access-Control-Allow-Origin'),
      'https://evil.example',
    );

    response = await call('/shamela/book/1', {});
    check('a request with no Origin is refused', response.status, 403);

    // https://user.github.io/Torjuman/ is the site; its ORIGIN has no path.
    response = await call('/shamela/book/1', { Origin: `${ALLOWED}/Torjuman` });
    check('an origin written with a path does not match', response.status, 403);

    response = await call('/shamela/book/1', { Origin: ALLOWED }, 'OPTIONS');
    check('preflight is answered', response.status, 204);
    response = await call('/shamela/book/1', { Origin: ALLOWED }, 'POST');
    check('POST is refused — this forwards reads only', response.status, 405);

    globalThis.fetch = (async () => {
      throw new Error('connect ETIMEDOUT');
    }) as typeof globalThis.fetch;
    response = await call('/shamela/book/1');
    check('a dead upstream is a readable 502', response.status, 502);
    check(
      'naming the host and the cause',
      ((await response.json()) as { error: string }).error,
      'Could not reach https://shamela.ws: connect ETIMEDOUT',
    );
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ------------------------------------------------------------------ done

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
