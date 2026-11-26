// Check U: the markup of every screen and state that shows a shared UI piece.
//
//   npm run verify:markup                                  (both builds, compare to the manifest)
//   node scripts/verify-markup.mjs --write-manifest        (once, in Phase 2 step 2a)
//   node scripts/verify-markup.mjs --compare <dirA> <dirB> (two dumps, no build)
//   VERIFY_OUT=.verify/markup/base npm run verify:markup   (dump somewhere else)
//
// Why it exists. Phase 2 of the restructure (docs/refactor/plans/
// phase2-shared-pieces.md, Design §9) moves repeated helpers and UI shells
// into shared modules: one ProgressBar, one SettingsSection, ui/kit. Phase 1
// proved "nothing changed" with compare-bundles, which wants byte-identical JS.
// That cannot hold here — code moves into new modules, and Rollup orders and
// names them differently — so this proves the thing the owner actually sees is
// unchanged: the rendered DOM, and screenshots, of every screen and state that
// shows one of the pieces being moved, at the tablet's two sizes, in a build
// without and a build with a proxy (some texts and buttons differ between the
// two: the relay, the import notes).
//
// How. Two `vite build`s (no tsc) into .verify/markup-build/{plain,proxy} with
// an explicit environment, each served with Vite's `preview`. Every capture
// gets a fresh browser context, except that Settings' five tabs and their 22
// sections are captured from one: touch, 960×600 or 600×960, deviceScaleFactor 2,
// en-US, UTC, service workers blocked (so every request is visible to the
// route below and the update bar stays out), Date pinned with page.clock. The
// app is opened once so it creates its database and finishes seeding the one
// bundled QUL resource (polled from Node until its row exists), synthetic
// rows are written straight into IndexedDB, and the page is reloaded.
// Requests to anything but the preview server are held (the proxy, the model
// host: so the screen stays in its in-progress state) or aborted (everything
// else, which then fails the same way every run).
//
// Each capture is <profile>/<name>.html — document.body.innerHTML, or the
// captured element's outerHTML, scripts removed, a line break between `>` and
// `<` so a difference is reported by line — and <profile>/<name>.png. Every
// capture first waits until what it captures has not changed for 1 s (15 s
// limit; a timeout is a failure, never a pass). Comparison is strict: byte
// for byte, class order and whitespace included, because "identical markup"
// means exactly that. The committed manifest, docs/refactor/phase2/
// markup.sha256, holds one SHA-256 per file; the dumps stay in .verify/markup/.
//
// Masked, and nothing else (each also painted over in the screenshots):
//   - the "Built" time in Settings → This build (BuildSection.tsx): it is
//     __BUILD_TIME__, which is new on every build by design;
//   - the storage usage line in Settings → Offline translation
//     (OfflineTranslation.tsx): navigator.storage.estimate() reports what the
//     run has written so far, which varies with timing and the browser;
//   - React useId ids («r0», :r0:, _r_0_): there are none today, the mask is
//     there so a later one cannot make the check flaky;
//   - the ORDER of Settings → Retrieval's log rows (RetrievalSection.tsx),
//     found while taking the baseline: two lookups finish at boot (the QUL
//     seed, the muṣḥaf) in either order. In the DOM the rows are kept, markup,
//     text and all, and sorted; in screenshots the list is painted over.
//     (A text mask was briefly added for a "2 pending"/"3 pending" flake; the
//     cause was this script reloading mid-seed, fixed by a real poll, and the
//     mask was removed.)
//
// Environment pinned beyond §9's list: GITHUB_REF_NAME and GITHUB_SHA are
// removed and npm_package_version is set (the "Version" row reads them), and
// qul/ files that are not committed answer 404 (the owner's machine has the
// licensed ones in public/qul/, which would otherwise change QUL resources).
//
// Where a state is reached differently from §9's table, the capture says why:
// settings--offline-downloading answers the model's size probes and one small
// file, not config.json alone. And share-error (#/share/x/y) shows the
// malformed-key error: the key is checked before any bundle is fetched.
//
// Added in Phase 3 step 3b (docs/refactor/plans/phase3-provider-seams.md,
// Design §6), on the old code, as manifest lines added after the 2a ones, all
// in the plain build at both sizes — before 3b every capture showed Gemini only:
//   - onboarding--claude: first run, "Use Claude instead" tapped — the Claude
//     panel and its 'sk-ant-…' placeholder;
//   - settings--translation--claude and settings--translation-profiles--claude:
//     Settings with the Claude card tapped, which writes the active profile —
//     Claude's model list and the default model's note, and "This profile runs
//     on Claude — Sonnet 5.5 — recommended";
//   - reader-cards: the card panel with seeded translation cards (seedCards):
//     Gemini, Claude on the current default, Claude on a superseded model
//     ("Sonnet 5"), on-device, and a collapsed Claude card — every badge;
//   - reader-retranslate: the same panel with the retranslate menu open on the
//     superseded card — every provider's models in registry order, then the
//     on-device ones.
// None writes an API key: none of these states needs one.
//
// Added in Phase 5 step 5a (docs/refactor/plans/phase5-big-ui-files.md, Design
// §1.1), on the old code, as manifest lines added beside the earlier ones, all
// in the plain build, each in a fresh context seeded by seedReader (a verse, a
// numbered matn with two sharḥ blocks, a narrator, three read marks, a cached
// gloss) or by seedCards — so no earlier capture's database changes. Before
// 5a U showed the reader's header and card panel only; these are every state
// a Phase 5 part renders. reader-page is the whole body; each other one is
// the element its state adds, so a change to one part names its own captures:
//   - reader-page: the book opened, no key — NoKeyBanner, the header with
//     ReadMarkNav, the rail spacer, the blocks with their entities, and the
//     aside and divider (960) or the sheet bar (600);
//   - reader-page-cards: the same body with seedCards' five cards instead —
//     the margin markers (CardMarkerDot) and translated-range strips, and at
//     960 the panel holding the cards;
//   - reader-collapsed (960): Hide cards tapped, with seedCards' five cards —
//     the edge tab and its count;
//   - reader-sheet-open (600): the sheet handle tapped, with the five cards —
//     the sticky sheet, handle and panel together;
//   - reader-quran: the verse tapped — QuranSheet's Translation tab (the
//     bundled English; quran.com is aborted), a popover at 960;
//   - reader-quran-similar: then its Similar tab — the panel promoted to a
//     sheet (preferSheet);
//   - reader-quran-compiled: compileEnabled seeded, the verse, Compiled —
//     CompileTab blocked on the missing Gemini key;
//   - reader-hadith: the ḥadīth tapped, after dorar is aborted and sunnah.com
//     skipped (no key) — "No grading found", the honest-English note, the
//     footer; reader-hadith-diagnostics: then Show dorar diagnostics, the
//     diagnostics block alone;
//   - reader-biography: the narrator tapped — BiographySheet with no
//     biographical work imported;
//   - reader-rail: one word selected, no key — SelectionRail (no dictionary,
//     so its action is disabled; since FOUND_ISSUES 33 Meaning is disabled
//     too, the word not being cached); reader-meaning: a fake Claude key and
//     the gloss answered 401 — the gloss error in DictionarySheet (before 33,
//     Meaning with no key); reader-rail-offline-cached (added with 33): the
//     seeded word selected offline with no key — Meaning offered from the
//     cache; reader-meaning-cached: then Meaning — the gloss ready state;
//   - reader-margin-menu: a 600 ms press on the matn's margin — MarginMenu
//     with Translate all…; reader-batch-proposal: then Translate all… — the
//     proposal bar (three blocks, cost unknown for the default Gemini model),
//     captured with the page back at the top so the bar is not behind the
//     sticky header;
//   - reader-notice: a phrase selected, Translate with no key — the
//     translator's notice;
//   - reader-popover (600): with seedCards, a margin marker tapped —
//     CardPopover (at 960 a marker answers in the panel, which reader-cards
//     shows);
//   - reader-toc, reader-search (a word with two hits), reader-share: Contents,
//     Search, Share tapped — TocDrawer, the search column, ShareChapter's
//     dialog (no chapter on screen: the seeded blocks have no toc node).
// Text below the fold is scrolled to the middle of the screen before it is
// tapped or pressed (`centre`), and the page is waited on until the target's
// own rectangle is still, not only scrollY: Playwright's own scroll-into-view
// landed the page at different places on different runs, and with scrollY
// settled the virtualizer still moved the matn's margin by 55 px between two
// runs (the 5a review), which MarginMenu's place follows. Each sheet or
// popover is captured after a resize event (`captureDialog`), because a
// popover whose content arrived after it was first placed kept its first place
// until the reader rendered again — a race (FOUND_ISSUES 37; the ḥadīth popover
// came out at top 12 px or 275.8 px). Lane A fixed that in the app (the
// popover places itself again when its size changes); the resize event stays,
// as a step that costs nothing. And its screenshot is taken with
// everything but the dialog made invisible (Playwright's `style` option; the
// DOM is untouched), because its rounded corners showed the header and text
// under it, a few levels apart between runs.
//
// A failing run lists each differing file; with a .verify/markup/base/ dump
// present (VERIFY_OUT=.verify/markup/base on the 2a commit, `git worktree add`
// with node_modules linked if .verify/ was cleared) it also prints the first
// differing lines of each .html. `--write-manifest --html-only` would leave the
// screenshots out of the manifest; the 2a manifest has them (byte-stable).
//
// Not captured, with the reason (the reviewer reads these):
//   - BatchTranslateBar: reaching it needs a running batch translation; its
//     markup does not change in Phase 2, only its import path (FOUND_ISSUES 9
//     later put its bar on ProgressBar, read in the diff; check P runs the
//     batch and records its text, not its markup);
//   - UpdateBar: needs a service-worker update, which is blocked here; import
//     path only;
//   - ShareChapter's sealed state: reached through the share dialog; its
//     formatBytes is moved verbatim, so the Published chapters capture (all
//     three branches: 512 B, 300 KB, 2.5 MB) and the diff cover it (the
//     gigabyte step FOUND_ISSUES 8 added later is in no capture: nothing
//     seeded here is that large);
//   - (3b) the Claude captures in the proxy build: neither screen reads the
//     proxy setting, and the proxy build's Settings captures are every tab's
//     whole panel with Gemini chosen;
//   - (3b) onboarding's key check ("Checking…", rejected, "Could not reach
//     Claude: …"): it needs an answer from the model host, which is aborted
//     here, and the error state carries the browser's own message;
//   - (3b) Settings → API keys with a Claude key saved: the field is a password
//     input and the dump would carry the key, so it is not seeded; the empty
//     field and both placeholders are in settings--api-keys;
//   - (3b) a card loading, streaming or failed (ErrorPanel): the badge, which
//     is what Phase 3 moves, is the same in every state, and reaching them
//     needs a translation in flight;
//   - (3b) the top of the retranslate menu in reader-retranslate.png: the menu
//     opens upward inside the panel's scroll box, which clips it; the .html
//     has all of it;
//   - (3b, found by its deliberate-edit proof) the "This profile runs on …"
//     line in 960x600/settings--translation-profiles--claude.png: the section
//     is taller than the landscape viewport and the element screenshot comes
//     out with the sticky top bar over its top and its last lines cut off, as
//     the 2a capture settings--translation-profiles.png does; the .html, and
//     the 600x960 screenshot, have the line;
//   - (5a) the rail's Dictionary action enabled, and the dictionary sheet with
//     an entry: no dictionary book is seeded — the double-tap path belongs to
//     check R (plan Design §1.2), and reader-rail shows the action disabled;
//   - (5a) the sharḥ notice and the "Searching the commentary…" bar: both need
//     an imported commentary (a «شروح الحديث» book) to search, and the ḥadīth
//     sheet offers no commentary button without one;
//   - (5a) a running batch (BatchRunning): it needs answered translations;
//     check P covers it;
//   - (5a) reader-quran-compiled with a key, and a compiled paragraph: it needs
//     an answer from the model host;
//   - (5a) the read-only (shared) view: it needs a real encrypted share bundle;
//   - (5a) the Tafsīr, Topics and Surah tabs: no such QUL resource is
//     committed (public/qul/ holds matching-ayah only), so the Similar tab is
//     the one QUL tab here.
//
// Like verify-reader-scroll.mjs it needs Chromium through Playwright and is
// kept out of `npm run verify`.

import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'docs/refactor/phase2/markup.sha256');
const BUILD_ROOT = join(ROOT, '.verify/markup-build');
const OUT = resolve(ROOT, process.env.VERIFY_OUT ?? '.verify/markup/current');
// OUT is deleted and rewritten, so it must be inside .verify/: a mistyped
// VERIFY_OUT must not be able to remove anything else.
if (!OUT.startsWith(resolve(ROOT, '.verify') + sep)) {
  console.error(`VERIFY_OUT must be inside .verify/ (got ${OUT})`);
  process.exit(2);
}
const BASE_DUMP = join(ROOT, '.verify/markup/base');

const PROXY = 'https://proxy.invalid';
/** The offline model's host (OfflineProvider loads from the Hugging Face Hub). */
const MODEL_HOST = /^(huggingface\.co|cdn-lfs[^/]*\.hf\.co)$/;
/** Any fixed instant: dates in filenames, "Made …" and share rows come from it. */
const FIXED_NOW = Date.UTC(2026, 2, 1, 9, 30, 0);
const STABLE_MS = 1000;
const STABLE_LIMIT_MS = 15_000;

const PROFILES = [
  { name: '960x600', viewport: { width: 960, height: 600 } },
  { name: '600x960', viewport: { width: 600, height: 960 } },
];

// ------------------------------------------------------------------ environment

// The builds must not depend on the machine they run on. These are every
// variable vite.config.ts reads for the base path, the catalog and share URLs,
// the proxy and the version: removed from this process too, because `preview`
// loads the same config and must serve the base the build was made with.
const CLEARED = ['GITHUB_REPOSITORY', 'GITHUB_REF_NAME', 'GITHUB_SHA', 'BASE_PATH', 'VITE_CATALOG_URL', 'VITE_SHARE_BASE_URL', 'PROXY_URL', 'VITE_PROXY_URL'];
for (const name of CLEARED) delete process.env[name];
// resolveVersion() reads npm_package_version, which `npm run` sets and plain
// `node` does not; pinned so both ways of running produce the same "Version".
const PACKAGE_VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/**
 * The QUL files committed to the repository. public/qul/ is gitignored except
 * for these, and the owner's machine has the licensed ones locally too; the
 * route answers any other qul/ file with a 404, as the deployed site does, so
 * Settings → QUL resources is the same on every machine.
 */
const COMMITTED_QUL = new Set(
  execFileSync('git', ['ls-files', 'public/qul'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((path) => path.split('/').pop()),
);

function build(name, proxyUrl) {
  const outDir = join(BUILD_ROOT, name);
  const env = { ...process.env, VITE_PROXY_URL: proxyUrl, npm_package_version: PACKAGE_VERSION };
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'],
    // Its warnings (chunk sizes, node: externals) are the same every time and
    // would bury the result; they are shown only if the build fails.
    { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`vite build (${name}) exited ${result.status}`);
  }
  console.log(`  built ${name} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return outDir;
}

// ------------------------------------------------------------------ seed

const BOOK = 'shamela-900001';
const PARTIAL = 'shamela-900002';
const BOOK_TITLE = 'كتاب المثال في الطهارة';
const PARTIAL_TITLE = 'كتاب التجربة الناقص';

/** Synthetic rows only: the repository is public. */
function seedRows() {
  const at = FIXED_NOW - 86_400_000;
  const book = (id, shamelaId, title, total, fetched, status) => ({
    id, shamelaId, title, author: 'مؤلف تجريبي', publisher: '', edition: '', volumeCount: 1, category: '',
    structureProfile: 'generic', importedAt: at, importStatus: status, totalPages: total, fetchedPages: fetched,
    volumeStarts: [1], hadithCollection: null, role: 'reading',
  });
  const pages = (bookId, count) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${bookId}:p${i + 1}`, bookId, pageIndex: i + 1, volume: 1, printPage: i + 1, rawHtml: '', fetchedAt: at,
    }));
  const PER_PAGE = 4;
  const blocks = Array.from({ length: 40 }, (_, i) => {
    const pageIndex = Math.floor(i / PER_PAGE) + 1;
    const text = `الفقرة ${i + 1}: هذا نص تجريبي للتحقق من العرض، وليس من كتاب حقيقي.`;
    return {
      id: `${BOOK}:p${pageIndex}:${i}`, bookId: BOOK, pageId: `${BOOK}:p${pageIndex}`, order: i, type: 'body',
      text, normalized: text, contentHash: `h${i}`, hadithNumber: null, tocNodeId: null, spans: [], anchor: null,
    };
  });
  const toc = ['الباب الأول', 'الباب الثاني', 'الباب الثالث'].map((title, i) => ({
    id: `${BOOK}:toc${i}`, bookId: BOOK, parentId: null, title, pageIndex: 1 + i * 4, order: i, depth: 0,
  }));
  const share = (id, bytes, label) => ({
    id, key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', title: `${BOOK_TITLE} — ${label}`, bookId: BOOK,
    bookTitle: BOOK_TITLE, rangeLabel: label, createdAt: at, bytes, blocks: 12, cards: 3, marks: 1,
  });
  return {
    books: [book(BOOK, 900001, BOOK_TITLE, 10, 10, 'complete'), book(PARTIAL, 900002, PARTIAL_TITLE, 100, 40, 'in-progress')],
    pages: [...pages(BOOK, 10), ...pages(PARTIAL, 40)],
    blocks,
    tocNodes: toc,
    crawlStates: [{ bookId: PARTIAL, status: 'paused', nextPage: 41, failedPages: [], updatedAt: at }],
    glossary: [
      { id: 'g1', arabic: 'الإخلاص', english: 'sincerity', note: null, addedAt: at },
      { id: 'g2', arabic: 'النية', english: 'intention', note: 'synthetic entry', addedAt: at },
    ],
    shareRecords: [
      share('share-small', 512, 'الباب الأول'),
      share('share-medium', 300 * 1024, 'الباب الثاني'),
      share('share-large', 2.5 * 1024 * 1024, 'الباب الثالث'),
    ],
  };
}

/**
 * Two imported hadith-json collections for the Ḥadīth English capture (step 3
 * of docs/plans/hadith-text-matching.md): one whose text index is built, one
 * imported before the index existed. Synthetic: no ḥadīth row at all, only the
 * resource rows and the index's part 0 with made-up counts — the section reads
 * nothing else. The index arrays are empty strings; nothing here decodes them.
 */
function seedHadithJson() {
  const at = FIXED_NOW - 86_400_000;
  const resource = (id, collection, name, entryCount, byteSize) => ({
    id, kind: 'hadith-json', name, fileName: `${collection}.json`, byteSize, entryCount, format: 'json',
    importedAt: at, collection,
  });
  return {
    qulResources: [
      resource('qul-u-built', 'riyadussalihin', 'Synthetic collection with an index', 1896, 3 * 1048576),
      resource('qul-u-old', 'nawawi40', 'Synthetic collection without one', 42, 65536),
    ],
    qulEntries: [
      {
        id: 'qul-u-built|idx:riyadussalihin:0', resourceId: 'qul-u-built', key: 'idx:riyadussalihin:0',
        value: { t: 'hadith-index', v: 1, collection: 'riyadussalihin', part: 0, keys: '', values: '', entries: 1896, positions: 80222, builtMs: 1234 },
      },
    ],
  };
}

/**
 * Translation cards for the reader captures (Phase 3 step 3b), written only
 * into the contexts that take them, so every earlier capture's database is
 * what it was. Synthetic, like the rows above: the Arabic is the seeded
 * blocks' own text, the English says it is a placeholder.
 *
 * One per badge the panel can draw: Gemini (free), Claude on the current
 * default, Claude on a superseded model — which only findModelOption's
 * superseded table turns into "Sonnet 5" rather than the bare id — and the
 * on-device model; plus a collapsed Claude card for the collapsed row's badge.
 * The model ids are copied from src/translation/models.ts (CLAUDE_SONNET_5_5, CLAUDE_HAIKU_5_5,
 * CLAUDE_SONNET_5, the first GEMINI_MODELS entry) and from OFFLINE_MODELS in
 * src/translation/offline/OfflineProvider.ts; this script cannot import
 * TypeScript, and a copy that went out of date would show as the bare id.
 *
 * Every card anchors on the first five blocks, so the panel's default Visible
 * scope shows all of them at both sizes. Their cacheKey is made up, so all of them read as
 * stale — the same on every run, which is all the capture needs.
 */
function seedCards() {
  const at = FIXED_NOW - 3_600_000;
  const card = (index, providerId, model, extra = {}) => {
    // The seeded blocks' ids: four to a page (seedRows' PER_PAGE).
    const blockId = `${BOOK}:p${Math.floor(index / 4) + 1}:${index}`;
    const sourceText = `الفقرة ${index + 1}: هذا نص تجريبي للتحقق من العرض، وليس من كتاب حقيقي.`;
    return {
      id: `card-${index}`, bookId: BOOK, kind: 'translation', startBlockId: blockId, startOffset: 0,
      endBlockId: blockId, endOffset: sourceText.length, createdAt: at + index, collapsed: false, sourceText,
      segments: [{ type: 'prose', arabic: '', english: `Paragraph ${index + 1}: a placeholder translation, not from a real book.`, source: providerId === 'offline' ? 'offline' : 'model' }],
      coverage: 1, reachedEnd: true, profileId: 'profile-study-circle', promptVersion: 1, glossaryHash: 'synthetic',
      providerId, model, cacheKey: `synthetic-${index}`, status: 'complete',
      usage: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: providerId === 'anthropic' ? 0.0081 : null,
      ...extra,
    };
  };
  return [
    card(0, 'gemini', 'gemini-3.7-flash'),
    card(1, 'anthropic', 'claude-sonnet-5-5', {
      usage: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 2048, cacheWriteTokens: 0 },
    }),
    card(2, 'anthropic', 'claude-sonnet-5'),
    card(3, 'offline', 'opus-mt-ar-en', { usage: undefined }),
    card(4, 'anthropic', 'claude-haiku-5-5', { collapsed: true }),
  ];
}

/**
 * The reader's own furniture (Phase 5 step 5a): a verse, a ḥadīth with its
 * commentary, a narrator, read marks and a cached gloss, written only into the
 * contexts that take them, like seedCards, so no earlier capture's database
 * changes. Synthetic but for the verse, Ibrāhīm 2, read from the bundled
 * muṣḥaf (public/quran/uthmani.json); the rest says it is a test text. Not
 * 14:7, verify-reader-scroll.mjs's verse, which the plan named: the bundled
 * matching-ayah resource has no entry for 14:7, so its sheet has no Similar
 * tab, and 14:2 has two matches (42:53, 34:1).
 *
 * Blocks 1–5 of the seeded book are rewritten in place (same ids, same
 * order), so the book is still 40 blocks on 10 pages: 1 the verse, 2 a
 * numbered matn, 3–4 its sharḥ, 5 the next numbered matn — which ends the
 * commentary range (translation/hadithRange.ts commentaryRange), so "Translate
 * all…" proposes three blocks rather than the rest of the book. The entities
 * are written rather than detected: the book row's nameIndexSize 0 equals the
 * (empty) biography index, so ensureEntities (quran/entityService.ts) keeps
 * what is stored instead of re-detecting — detection cannot find a ḥadīth in a
 * book with no hadithCollection. Three `read` marks put ReadMarkNav in the
 * header. One gloss row (keyed by its normalized word, which needs no
 * folding) is the cached Meaning. `compile` also turns on compileEnabled,
 * merged into the settings row the first boot wrote, for the Compiled tab.
 */
const READER_VERSE = (() => {
  const { counts, ayat } = JSON.parse(readFileSync(join(ROOT, 'public/quran/uthmani.json'), 'utf8'));
  // Flat index of 14:2: the ayāt of sūras 1–13, then the second.
  return ayat[counts.slice(0, 13).reduce((sum, count) => sum + count, 0) + 1];
})();
const READER_NARRATOR = 'أبي هريرة';
const READER_HADITH = '«هذا متن حديث تجريبي للتحقق من العرض، وليس من كتاب حقيقي»';
const READER_MATN = `عن ${READER_NARRATOR} رضي الله عنه قال: ${READER_HADITH}.`;
/** The word whose gloss is seeded (reader-meaning-cached), in block 0. */
const CACHED_WORD = 'تجريبي';
/** The word whose gloss is not (reader-rail, reader-meaning), in block 0. */
const UNCACHED_WORD = 'الفقرة';
const SEARCH_WORD = 'متن';

// The short-quotation states (docs/plans/hadith-short-quote.md, step 5): the
// tapped entity narrowed to three words of the seeded matn. Sixteen letters
// for a match; ten, under the twelve-letter floor, for "too short". The
// rows are the "matched" state's, and «none-near» cites number 400, far
// past the file's three rows.
const SHORT_STATES = {
  'short-matched': { words: 'حديث تجريبي للتحقق', number: 1 },
  'short-too-short': { words: 'هذا متن حديث', number: 1 },
  'short-none-near': { words: 'حديث تجريبي للتحقق', number: 400 },
};

/**
 * The hadith-json rows for a reader seeded as a sharḥ of Bukhārī (step T1 of
 * docs/plans/hadith-text-matching.md), one state per capture. Invented
 * sentences, not ḥadīth; the "matched" entry is the seeded matn's quotation
 * itself, so the sheet finds it by text. No index is seeded: the sheet builds
 * it on first use, as a tablet with an older import does.
 */
function sharhCollectionRows(state) {
  if (state === 'not-imported') return {};
  if (SHORT_STATES[state]) state = 'matched';
  const at = FIXED_NOW - 7_200_000;
  const quote = READER_HADITH.replace(/[«»]/g, '');
  const rest = (words) => words;
  const arabic = {
    matched: ['جملة تجريبية أولى عن الطريق والسفر والرفقة في الليل الطويل', quote, 'جملة تجريبية أخيرة عن الماء والمطر والزرع في الأرض البعيدة'],
    'no-match': ['جملة تجريبية أولى عن الطريق والسفر والرفقة في الليل الطويل', 'جملة تجريبية أخيرة عن الماء والمطر والزرع في الأرض البعيدة'],
    ambiguous: [
      rest(`قال الراوي التجريبي في المجلس الأول أمام الناس ${quote} ثم سكت طويلا ولم يزد شيئا بعد ذلك`),
      rest(`وفي خبر آخر مختلف تماما عن الذي قبله ${quote} فلما سمعوا ذلك خرجوا إلى السوق مسرعين جميعا`),
    ],
  }[state];
  const id = 'qul-u-sharh-bukhari';
  return {
    qulResources: [{
      id, kind: 'hadith-json', name: 'Synthetic Bukhārī (check U)', fileName: 'bukhari.json', byteSize: 4096,
      entryCount: arabic.length, format: 'json', importedAt: at, collection: 'bukhari',
    }],
    qulEntries: arabic.map((text, i) => ({
      id: `${id}|bukhari:${i + 1}`, resourceId: id, key: `bukhari:${i + 1}`,
      value: {
        t: 'hadith-json', number: i + 1, idInBook: i + 1, chapterId: 0, chapterEnglish: '',
        narrator: 'Narrated (synthetic):', text: `Synthetic English ${i + 1}, written for check U; not a ḥadīth.`, arabic: text,
      },
    })),
  };
}

function seedReader({ compile = false, sharh = null } = {}) {
  const at = FIXED_NOW - 7_200_000;
  const rows = seedRows();
  const blocks = rows.blocks.map((block) => ({ ...block }));
  const rewrite = (index, type, text, hadithNumber = null) =>
    Object.assign(blocks[index], { type, text, normalized: text, hadithNumber });
  rewrite(1, 'body', READER_VERSE);
  rewrite(2, 'hadith_matn', READER_MATN, '1');
  rewrite(3, 'sharh', 'شرح تجريبي أول: هذا شرح للتحقق من العرض، وليس من كتاب حقيقي.');
  rewrite(4, 'sharh', 'شرح تجريبي ثان: وفيه بيان لما سبق، وليس من كتاب حقيقي.');
  rewrite(5, 'hadith_matn', 'هذا متن ثان تجريبي، وليس من كتاب حقيقي.', '2');
  const entity = (key, type, index, start, end, extra) => ({
    id: `entity-${key}`, bookId: BOOK, startBlockId: blocks[index].id, startOffset: start,
    endBlockId: blocks[index].id, endOffset: end, type, matchQuality: 'exact', detectedAt: at, ...extra,
  });
  const narratorAt = READER_MATN.indexOf(READER_NARRATOR);
  const hadithAt = READER_MATN.indexOf(READER_HADITH);
  const shortAt = SHORT_STATES[sharh] ? READER_MATN.indexOf(SHORT_STATES[sharh].words) : -1;
  const read = (index) => ({
    id: `mark-read-${index}`, bookId: BOOK, startBlockId: blocks[index].id, startOffset: 0,
    endBlockId: blocks[index].id, endOffset: blocks[index].text.length, kind: 'read', scope: 'block',
    note: null, createdAt: at + index, collapsed: false,
  });
  return {
    rows: {
      ...rows,
      ...(sharh ? sharhCollectionRows(sharh) : {}),
      books: rows.books.map((book) =>
        book.id === BOOK
          ? {
              ...book,
              nameIndexSize: 0,
              // A sharḥ of Bukhārī: category and a title fragment (Design 8).
              ...(sharh ? { title: 'شرح تجريبي على صحيح البخاري', category: 'شروح الحديث' } : {}),
            }
          : book,
      ),
      blocks,
      entities: [
        entity('quran', 'quran', 1, 0, READER_VERSE.length, { reference: '14:2', label: 'إبراهيم 2', textUthmani: READER_VERSE }),
        // In a sharḥ of a non-citable collection the matn's reference is
        // book-scoped (detectEntities' `<bookId>#n`), its number the book's own.
        SHORT_STATES[sharh]
          ? entity('hadith', 'hadith', 2, shortAt, shortAt + SHORT_STATES[sharh].words.length, {
              reference: `${BOOK}#${SHORT_STATES[sharh].number}`,
              label: `Ḥadīth ${SHORT_STATES[sharh].number}`,
            })
          : entity('hadith', 'hadith', 2, hadithAt, hadithAt + READER_HADITH.length, {
              reference: sharh ? `${BOOK}#1` : 'riyadussalihin:1',
              ...(sharh ? { label: 'Ḥadīth 1' } : {}),
            }),
        entity('narrator', 'narrator', 2, narratorAt, narratorAt + READER_NARRATOR.length, { reference: 'ابي هريره', label: READER_NARRATOR }),
      ],
      marks: [read(10), read(20), read(30)],
      // The id is copied from src/translation/models.ts (ANTHROPIC_GLOSS_MODEL).
      wordGlosses: [{
        word: CACHED_WORD, display: CACHED_WORD, root: 'ج ر ب',
        meaning: 'experimental — a placeholder gloss for the check, not from a model', note: null,
        isTechnicalTerm: false, model: 'claude-haiku-5-5', createdAt: at,
      }],
    },
    settings: compile ? { compileEnabled: true } : null,
  };
}

// ------------------------------------------------------------------ browser

async function newPage(browser, base, profile, { onboarded = true, seed = true, cards = false, reader = null, hadithJson = false, network = {} } = {}) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
  });
  const origin = new URL(base).origin;
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      // The dev-server proxy paths (vite.config.ts); `preview` would forward
      // them to the real hosts. A production build never asks for them, and
      // aborting them keeps "no real network" true by construction.
      if (/^\/(shamela|sunnah|quran-api|dorar)(\/|$)/.test(url.pathname)) return route.abort();
      const qul = /\/qul\/([^/]+)$/.exec(url.pathname);
      if (qul && !COMMITTED_QUL.has(qul[1])) return route.fulfill({ status: 404, body: 'Not found' });
      return route.continue();
    }
    // Held: never answered, so the screen stays in its in-progress state.
    if (network.holdProxy && url.origin === PROXY) return undefined;
    // Claude's word gloss answered with a canned 401, so reader-meaning shows
    // the gloss error from a fixed answer rather than the browser's own
    // message for an aborted request (FOUND_ISSUES 33: without a key, Meaning
    // is no longer offered for a word that is not cached, so the old
    // "No API key" capture cannot be reached).
    if (network.glossAuthError && url.hostname === 'api.anthropic.com') {
      return route.fulfill({
        status: 401,
        headers: { 'content-type': 'application/json', 'request-id': 'req_u_gloss' },
        body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
      });
    }
    if (MODEL_HOST.test(url.hostname)) {
      if (network.modelDownload) {
        // Answering config.json alone is not enough to reach the progress bar
        // (§9 hoped it would be). transformers.js first asks for the size of
        // every file the pipeline needs, with one-byte Range requests, and
        // reports no progress until all of them have answered; and config.json
        // itself is read before a progress callback is attached. So: the size
        // probes are answered, config.json says what the model is, and one
        // small file — generation_config.json — is answered in full, which is
        // the one progress event the screen ever gets ("… — 100%"). Every
        // other download (tokenizer, weights) is held. Exactly one file is
        // answered so that which file the bar names cannot depend on timing.
        const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range, content-length' };
        if (route.request().headers()['range'] === 'bytes=0-0') {
          return route.fulfill({ status: 206, headers: { ...cors, 'content-range': 'bytes 0-0/1000', 'content-type': 'application/octet-stream' }, body: '{' });
        }
        if (url.pathname.endsWith('/resolve/main/config.json')) {
          return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ model_type: 'marian' }) });
        }
        if (url.pathname.endsWith('/resolve/main/generation_config.json')) {
          return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{}' });
        }
      }
      return undefined;
    }
    // Aborted: fails the same way every run.
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`    pageerror: ${error.message}`));
  await page.clock.setFixedTime(FIXED_NOW);

  await page.goto(base);
  if (onboarded) {
    await page.evaluate(() => {
      localStorage.setItem('shamela-reader.onboarded', '1');
      localStorage.setItem('shamela-reader.catalogOffered', '1');
    });
  }
  // A fake Claude key, for the gloss error only (reader-meaning). No capture
  // that shows a key field opens on such a page.
  if (network.glossAuthError) {
    await page.evaluate(() => localStorage.setItem('shamela-reader.anthropic-api-key', 'sk-ant-u-check-not-a-real-key'));
  }
  if (cards && reader) throw new Error('newPage: cards and reader are separate seeds');
  const readerSeed = seed && reader ? seedReader(reader === true ? {} : reader) : null;
  if (seed) {
    // The app creates its database on boot (DB_VERSION 11) and then seeds the
    // bundled QUL resource, whose resource row is written last. Both are waited
    // for, so the reload below never interrupts a first-boot write — which the
    // app survives by design (qul/seed.ts redoes a half-written seed), but
    // which would make the next boot's Retrieval log say "3 pending" instead
    // of "2". The poll runs here in Node: page.waitForFunction does not await
    // an async predicate (a returned Promise is truthy), which is how the
    // first version of this wait silently waited for nothing.
    const seeded = () =>
      page.evaluate(async () => {
        const known = await indexedDB.databases();
        if (!known.some((db) => db.name === 'shamela-reader' && db.version === 11)) return false;
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('shamela-reader');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const row = await new Promise((resolve, reject) => {
            const request = db.transaction('qulResources').objectStore('qulResources').get('qul-seed-matching-ayah');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          return row !== undefined;
        } finally {
          db.close();
        }
      });
    const deadline = Date.now() + 30_000;
    while (!(await seeded())) {
      if (Date.now() > deadline) throw new Error('the first boot did not finish seeding matching-ayah within 30 s');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await page.evaluate(async (rows) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('shamela-reader');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const [store, list] of Object.entries(rows)) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite');
          for (const row of list) tx.objectStore(store).put(row);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
      db.close();
    }, readerSeed
      ? readerSeed.rows
      : cards
        ? { ...seedRows(), cards: seedCards() }
        : hadithJson
          ? { ...seedRows(), ...seedHadithJson() }
          : seedRows());
    if (readerSeed?.settings) {
      // Merged into the row the first boot wrote (idbWork.ts: one row, key
      // 'app'), so every other setting is what it would have been.
      await page.evaluate(async (patch) => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('shamela-reader');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction('settings', 'readwrite');
          const store = tx.objectStore('settings');
          const request = store.get('app');
          request.onsuccess = () => store.put({ ...(request.result ?? {}), ...patch, key: 'app' });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      }, readerSeed.settings);
    }
  }
  await page.reload();
  await page.waitForFunction(() => document.body.innerText.length > 0);
  return page;
}

async function go(page, hash) {
  await page.evaluate((target) => {
    window.location.hash = target;
  }, hash);
}

/** Wait until `read()` returns the same string for STABLE_MS; a timeout is a failure. */
async function untilStable(label, read) {
  const started = Date.now();
  let last = await read();
  let since = Date.now();
  while (Date.now() - since < STABLE_MS) {
    if (Date.now() - started > STABLE_LIMIT_MS) throw new Error(`${label}: still changing after ${STABLE_LIMIT_MS / 1000} s`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const now = await read();
    if (now !== last) {
      last = now;
      since = Date.now();
    }
  }
}

/** The elements masked in the DOM and painted over in screenshots. */
function maskLocators(page) {
  return [
    page.locator('dt', { hasText: /^Built$/ }).locator('xpath=following-sibling::dd[1]'),
    page.locator('p', { hasText: 'This app is currently using about' }),
    page.locator('section').filter({ has: page.locator('h2', { hasText: /^Retrieval$/ }) }).locator('ul'),
  ];
}

/**
 * Serialize `element` (or the body), with the masks applied to a clone so the
 * page itself is untouched.
 */
async function serialize(page, element) {
  const html = await (element ?? page.locator('body')).evaluate((node, whole) => {
    const clone = node.cloneNode(true);
    for (const script of clone.querySelectorAll('script')) script.remove();
    // The build time: __BUILD_TIME__ is new on every build (BuildSection.tsx).
    for (const dt of clone.querySelectorAll('dt')) {
      if (dt.textContent === 'Built' && dt.nextElementSibling) dt.nextElementSibling.textContent = '[masked: build time]';
    }
    // The storage usage: navigator.storage.estimate() varies with what the run
    // has written and when it is read (OfflineTranslation.tsx).
    for (const p of clone.querySelectorAll('p')) {
      if (p.textContent.startsWith('This app is currently using about')) p.textContent = '[masked: storage usage]';
    }
    // The order of Settings → Retrieval's log (RetrievalSection.tsx). It lists
    // this session's lookups as they finish, and on boot two run at once — the
    // bundled QUL seed and the muṣḥaf load — so which comes first is a race
    // (found while taking the 2a baseline). The rows are kept, markup and all,
    // and only put in a fixed order; in screenshots the list is painted over.
    // The section's first h2 at any depth: since lane UI-1 a foldable section
    // holds its heading inside the fold's heading row, not as a direct child.
    const sections = [clone, ...clone.querySelectorAll('section')].filter(
      (el) => el.tagName === 'SECTION' && el.querySelector('h2')?.textContent === 'Retrieval',
    );
    for (const list of sections.flatMap((el) => [...el.querySelectorAll('ul')])) {
      const rows = [...list.children].sort((a, b) => (a.outerHTML < b.outerHTML ? -1 : a.outerHTML > b.outerHTML ? 1 : 0));
      for (const row of rows) list.appendChild(row);
    }
    return whole ? clone.innerHTML : clone.outerHTML;
  }, element === null);
  return (
    html
      // React useId ids, in each React version's spelling. The first came with
      // lane UI-1 (a foldable Settings section's body id); without this its
      // number, which depends on render order, would make the check flaky.
      .replace(/«r[0-9a-z]+»/g, '«r»')
      .replace(/:r[0-9a-z]+:/g, ':r:')
      .replace(/_r_[0-9a-z]+_/g, '_r_')
      .replace(/></g, '>\n<') + '\n'
  );
}

/**
 * One capture: wait for stability, write <name>.html and <name>.png.
 * `element` null means the whole body (HTML) and the viewport (PNG).
 */
async function capture(page, dir, name, element = null, shot = element, style = undefined) {
  const target = element ?? page.locator('body');
  await target.waitFor({ state: 'attached', timeout: STABLE_LIMIT_MS });
  await untilStable(name, () => target.evaluate((node) => (node === document.body ? node.innerHTML : node.outerHTML)));
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const html = await serialize(page, element);
  writeFileSync(join(dir, `${name}.html`), html);
  const options = { path: join(dir, `${name}.png`), animations: 'disabled', mask: maskLocators(page), caret: 'hide' };
  if (style) options.style = style;
  if (shot) await shot.screenshot(options);
  else await page.screenshot(options);
  captured++;
}
let captured = 0;

/** Each settings section, named by its h2 text. */
function slugOf(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Settings is five tabs (lane UI-1), every one mounted and all but the chosen
// one hidden, so the column is the tab panel on screen. Ids and labels as in
// SETTINGS_TABS (app/router.ts) and SettingsScreen's TAB_LABELS.
const SETTINGS_TABS = [
  ['translation', 'Translation'],
  ['reading', 'Reading'],
  ['library', 'Library'],
  ['data', 'Data'],
  ['about', 'About'],
];
const column = (page) => page.locator('[data-settings-tab]:not([hidden])');
const settingsTabBar = (page) => page.locator('nav[aria-label="Settings"]');
const section = (page, title) => column(page).locator(':scope > section').filter({ has: page.locator('h2', { hasText: title }) });

/** Every section of the tab on screen, each captured as settings--<its h2's slug>. */
async function captureSections(page, dir, slugs) {
  const titles = await column(page).locator(':scope > section').evaluateAll((sections) =>
    sections.map((s) => s.querySelector('h2')?.textContent ?? ''),
  );
  for (const [index, title] of titles.entries()) {
    const slug = slugOf(title);
    if (!slug || slugs.has(slug)) throw new Error(`settings section ${index} has no unique name: "${title}"`);
    slugs.add(slug);
    const element = column(page).locator(':scope > section').nth(index);
    await capture(page, dir, `settings--${slug}`, element);
  }
}

/**
 * Replace CompressionStream with one that never finishes: the export reaches
 * its last progress message and stays there, so the progress bar can be read.
 */
async function stubCompression(page) {
  await page.evaluate(() => {
    window.CompressionStream = class {
      constructor() {
        const stream = new TransformStream({ flush: () => new Promise(() => {}) });
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    };
  });
}

// ------------------------------------------------------------------ captures

async function plainCaptures(browser, base, profile, dir) {
  const fresh = (options) => newPage(browser, base, profile, options);
  let page;

  page = await fresh({ onboarded: false, seed: false });
  await capture(page, dir, 'onboarding');
  await page.context().close();

  for (const [name, hash] of [
    ['library', '#/'],
    ['import', '#/import'],
    ['catalog', '#/catalog'],
    ['receive', '#/receive'],
    ['share-error', '#/share/x/y'],
  ]) {
    page = await fresh();
    await go(page, hash);
    if (name === 'library') await page.getByText('Import incomplete — 40%').waitFor();
    if (name === 'catalog') await page.getByText('bundled copy').waitFor();
    await capture(page, dir, name);
    await page.context().close();
  }

  page = await fresh();
  await go(page, `#/read/${encodeURIComponent(BOOK)}`);
  await page.locator('[data-block-id]').first().waitFor();
  await capture(page, dir, 'reader-header', page.locator('header').first());
  await page.context().close();

  // Settings from one context, as before the tabs: a bare #/settings opens
  // the first tab (a fresh context remembers none), and each tab after it is
  // reached by tapping it in the bar. Per tab: settings-tab-<id> (the panel's
  // HTML, the viewport's screenshot — what the tablet shows, the top bar and
  // the tab bar included), settings-tab-<id>--bar, then every section in it.
  page = await fresh();
  await go(page, '#/settings');
  await page.waitForFunction(() => window.location.hash === '#/settings/translation');
  const slugs = new Set();
  for (const [id, label] of SETTINGS_TABS) {
    if (id !== 'translation') await settingsTabBar(page).getByRole('link', { name: label, exact: true }).click();
    await page.locator(`[data-settings-tab="${id}"]:not([hidden])`).waitFor();
    if (id === 'data') await page.getByText('512 B').waitFor();
    if (id === 'about') await section(page, 'This build').waitFor();
    await capture(page, dir, `settings-tab-${id}`, column(page), null);
    await capture(page, dir, `settings-tab-${id}--bar`, settingsTabBar(page));
    await captureSections(page, dir, slugs);
  }
  // The folds. The glossary opens folded (its default); unfolded, then
  // searched with the hamza left off, which only normalize's folding finds.
  // And one ordinary section folded: What works offline, whose heading row
  // sets its own bottom margin, which folding drops.
  await settingsTabBar(page).getByRole('link', { name: 'Translation', exact: true }).click();
  const glossary = section(page, 'Glossary');
  await glossary.getByRole('button', { name: 'Unfold this section' }).click();
  await capture(page, dir, 'settings--glossary--open', glossary);
  await glossary.getByRole('searchbox').fill('الاخلاص');
  await glossary.getByText('1 of 2').waitFor();
  await capture(page, dir, 'settings--glossary--search', glossary);
  await settingsTabBar(page).getByRole('link', { name: 'About', exact: true }).click();
  const offlineList = section(page, 'What works offline');
  await offlineList.getByRole('button', { name: 'Fold this section' }).click();
  await capture(page, dir, 'settings--what-works-offline--folded', offlineList);
  await page.context().close();

  // ProgressBar 6: a book export held at "Compressing…".
  page = await fresh();
  await go(page, '#/settings/data');
  const library = section(page, 'Library transfer');
  await library.getByText(BOOK_TITLE).waitFor();
  await stubCompression(page);
  await library.locator('div', { hasText: BOOK_TITLE }).last().getByRole('button', { name: 'Export' }).click();
  await library.getByText('Compressing…').waitFor();
  await capture(page, dir, 'settings--library-transfer-exporting', library);
  await page.context().close();

  // ProgressBar 4: the tablet transfer file held on its last message.
  page = await fresh();
  await go(page, '#/settings/data');
  const device = section(page, 'Move to another tablet');
  await device.waitFor();
  await stubCompression(page);
  await device.getByRole('button', { name: 'Create the transfer file' }).click();
  await device.locator('.bg-parchment .bg-accent').waitFor();
  await capture(page, dir, 'settings--device-transfer-exporting', device);
  await page.context().close();

  // ProgressBar 7: the model download, one small file answered, the rest held (see the route).
  page = await fresh({ network: { modelDownload: true } });
  await go(page, '#/settings/translation');
  const offline = section(page, 'Offline translation');
  await offline.waitFor();
  page.on('dialog', (dialog) => void dialog.accept());
  await offline.getByRole('button', { name: 'Download' }).first().click();
  await offline.locator('.bg-parchment .bg-accent').waitFor({ timeout: STABLE_LIMIT_MS });
  await capture(page, dir, 'settings--offline-downloading', offline);
  await page.context().close();

  // The Claude side (Phase 3 step 3b): every capture above shows Gemini only.
  // Each starts from a fresh context, so nothing it taps reaches the others.
  // No API key is needed for any of them, so none is written: the Translation
  // card says "no key yet", and the dumps carry no key-shaped string.
  page = await fresh({ onboarded: false, seed: false });
  await page.getByRole('button', { name: 'Use Claude instead (paid, higher quality)' }).click();
  await page.locator('h2', { hasText: 'Use Claude' }).waitFor();
  await capture(page, dir, 'onboarding--claude');
  await page.context().close();

  // Tapping the Claude card writes the active profile (chooseProvider:
  // provider anthropic, model defaultModelFor('anthropic')); both sections
  // that read it are captured after the profile line has changed.
  page = await fresh();
  await go(page, '#/settings/translation');
  const translation = section(page, /^Translation$/);
  await translation.waitFor();
  await translation.getByRole('button', { name: /^Claude/ }).click();
  const profiles = section(page, 'Translation profiles');
  await profiles.getByText(/This profile runs on\s*Claude/).waitFor();
  await capture(page, dir, 'settings--translation--claude', translation);
  await capture(page, dir, 'settings--translation-profiles--claude', profiles);
  await page.context().close();

  // Ḥadīth English with two imported collections (seedHadithJson): the text
  // index line in both its states. Its own context, so every capture above
  // keeps a database with no hadith-json resource.
  page = await fresh({ hadithJson: true });
  await go(page, '#/settings/library');
  const hadithEnglish = section(page, /^Ḥadīth English/);
  await hadithEnglish.getByText('Text index: not built yet').waitFor();
  await hadithEnglish.getByText('Text index: 80,222 positions').waitFor();
  await capture(page, dir, 'settings--hadith-english--imported', hadithEnglish);
  await page.context().close();

  // Translation cards (Q13): the card panel with the seeded cards (seedCards).
  // Beside the text at 960×600; at 600×960 the panel is a bottom sheet, opened
  // with its handle first.
  const cardPanel = (p) => p.locator('div.ltr-isolate.flex.h-full.flex-col').filter({ has: p.locator('[data-card-id]') });
  page = await fresh({ cards: true });
  await go(page, `#/read/${encodeURIComponent(BOOK)}`);
  await page.locator('[data-block-id]').first().waitFor();
  const handle = page.getByRole('button', { name: /^▲ Cards/ });
  if (await handle.count()) await handle.click();
  await page.locator('[data-card-id="card-3"]').waitFor();
  await capture(page, dir, 'reader-cards', cardPanel(page));
  // The retranslate menu, opened on the Claude card on the superseded model
  // (the tap also focuses the card, which jumps the text to its block).
  await page.locator('[data-card-id="card-2"]').getByRole('button', { name: 'Retranslate ▾' }).click();
  await page.getByRole('button', { name: 'Same provider and model' }).waitFor();
  await capture(page, dir, 'reader-retranslate', cardPanel(page));
  await page.context().close();

  await readerCaptures(fresh, profile, dir);
}

// ------------------------------------------------------------------ the reader (5a)

/**
 * Every reader state a Phase 5 part renders (docs/refactor/plans/
 * phase5-big-ui-files.md, Design §1.1), each from a fresh context seeded with
 * seedReader (or seedCards for the popover). Only reader-page is the whole
 * body; every other capture is the element that state adds, so that a change
 * to one part names that part's captures and no others.
 */
/** Screenshot style: hide everything but the open dialog (captureDialog). */
const ONLY_THE_DIALOG =
  'body *:not([role="dialog"]):not([role="dialog"] *) { visibility: hidden !important; } ' +
  '[role="dialog"] { visibility: visible !important; }';

async function readerCaptures(fresh, profile, dir) {
  const beside = profile.name === '960x600';
  const hash = `#/read/${encodeURIComponent(BOOK)}`;
  const open = async (options = { reader: true }) => {
    const page = await fresh(options);
    await go(page, hash);
    await page.locator('[data-block-id]').first().waitFor();
    if (options.reader) await page.locator('[data-entity-id="entity-hadith"]').waitFor();
    return page;
  };
  const dialog = (page) => page.locator('[role="dialog"]').last();
  /**
   * Scroll `target` to the middle of the screen and wait until it is still.
   * Found while taking the baseline: a bare click scrolls the target in by
   * Playwright's own means, which landed the page at different places on
   * different runs (scrollY 386 or 163 before the same tap). A popover
   * clamped to the top of the screen then has the same DOM but not the same
   * pixels. Taps on text below the fold go through here.
   *
   * Still means the target's own place, not only scrollY: the 5a review saw
   * the matn's margin 55 px apart between two runs with scrollY settled (the
   * virtualizer measures rows after the scroll and moves them), and MarginMenu
   * places itself at the target's top. So the target's rectangle and scrollY
   * are waited on together, and the scroll is repeated until the target's
   * middle is within 1 px of the screen's (four tries; then it fails).
   */
  const centre = async (page, target) => {
    const where = () =>
      target.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return JSON.stringify([window.scrollY, rect.top, rect.height]);
      });
    await untilStable('the target before scrolling', where);
    for (let attempt = 0; ; attempt++) {
      await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await untilStable('the target after scrolling', where);
      const off = await target.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
      });
      // A target near the top of the page cannot be centred; then the page is
      // at the top and the place is still the same every run.
      const atTop = await page.evaluate(() => window.scrollY === 0);
      if (off <= 1 || atTop) return;
      if (attempt === 3) throw new Error(`could not centre the target (${off} px off)`);
    }
  };
  /**
   * Capture the open sheet or popover once it has placed itself from its
   * final height. AnchoredPanel used to place a popover when it mounted, from
   * its height then, and again only on a scroll, a resize or a new `onClose` —
   * which the reader passes inline, so on its next render (FOUND_ISSUES 34).
   * A sheet whose lookups finished after the first placement kept that place
   * unless the reader happened to render again: found while proving 5a, the
   * ḥadīth popover came out at top 12 px on most runs and at 275.8 px on one,
   * running off the bottom of the screen with its diagnostics button out of
   * reach (FOUND_ISSUES 37). Since lane A's fix for 37 the popover also places
   * itself again whenever its own size changes, so the race is gone from the
   * app. The resize event stays: the window's size unchanged, it makes the
   * popover place itself from its final height once more, and the app's other
   * resize listeners (the layout mode, the rail) read the same size and so
   * change nothing.
   *
   * In the screenshot only, everything but the dialog is made invisible: a
   * popover lies over the header and the text, its rounded corners show them
   * through, and those pixels differed by a few levels between runs (the
   * header's blur of whatever was scrolled under it). The DOM is untouched,
   * and reader-page and reader-header capture what is hidden here.
   */
  const captureDialog = async (page, name) => {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await capture(page, dir, name, dialog(page), dialog(page), ONLY_THE_DIALOG);
  };
  const tap = async (page, target) => {
    await centre(page, target);
    await target.click();
  };
  /** Select [start, end) of a block's text, as the handles would. */
  const select = (page, index, start, end) =>
    page.evaluate(
      ({ id, start, end }) => {
        const element = document.querySelector(`[data-block-id="${id}"]`);
        const position = (offset) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let seen = 0;
          while (walker.nextNode()) {
            const length = walker.currentNode.textContent.length;
            if (seen + length >= offset) return [walker.currentNode, offset - seen];
            seen += length;
          }
          throw new Error(`offset ${offset} is past the end of ${id}`);
        };
        const [startNode, startOffset] = position(start);
        const [endNode, endOffset] = position(end);
        window.getSelection().setBaseAndExtent(startNode, startOffset, endNode, endOffset);
      },
      { id: `${BOOK}:p${Math.floor(index / 4) + 1}:${index}`, start, end },
    );
  const block0 = `الفقرة 1: هذا نص تجريبي للتحقق من العرض، وليس من كتاب حقيقي.`;
  const word = (text) => [block0.indexOf(text), block0.indexOf(text) + text.length];
  const rail = (page) => page.getByRole('toolbar', { name: 'Actions for the selected text' });
  const untilRail = (page) =>
    page.waitForFunction(() => document.querySelector('[role="toolbar"]')?.style.visibility === 'visible');
  let page;

  // The whole page: NoKeyBanner, the header (with ReadMarkNav: three read
  // marks), the rail spacer, the blocks (verse, matn, sharḥ, narrator), and the
  // aside with its divider and the empty panel (960) or the sheet bar (600).
  page = await open();
  await page.getByTitle('Passages marked to read').waitFor();
  await capture(page, dir, 'reader-page');
  await page.context().close();

  // The same, with seedCards' five cards: the margin markers (CardMarkerDot)
  // and the translated-range strips beside blocks 0–4, and at 960 the panel
  // with them. No other capture has a marker on the page.
  page = await open({ cards: true });
  await page.getByRole('button', { name: 'Open translation' }).nth(4).waitFor();
  if (beside) await page.locator('[data-card-id="card-3"]').waitFor();
  await capture(page, dir, 'reader-page-cards');
  await page.context().close();

  // The panel collapsed to its edge tab (960), or the bottom sheet opened by
  // its handle (600): with seedCards' five cards, so the tab has a count and
  // the sheet has cards in it.
  page = await open({ cards: true });
  if (beside) {
    await page.locator('[data-card-id="card-3"]').waitFor();
    await page.getByRole('button', { name: 'Hide cards', exact: true }).click();
    const edge = page.locator('button[aria-label="Show cards"]');
    await edge.getByText('Cards (5)').waitFor();
    await capture(page, dir, 'reader-collapsed', edge);
  } else {
    await page.getByRole('button', { name: /^▲ Cards/ }).click();
    await page.getByRole('button', { name: '▼ Hide cards' }).waitFor();
    await page.locator('[data-card-id="card-3"]').waitFor();
    await capture(page, dir, 'reader-sheet-open', page.locator('div.sticky.bottom-0'));
  }
  await page.context().close();

  // QuranSheet: Translation (bundled English — quran.com is aborted), then the
  // first QUL tab the bundled matching-ayah resource gives (Similar).
  page = await open();
  await tap(page, page.locator('[data-entity-id="entity-quran"]'));
  await dialog(page).getByText('(bundled)').waitFor();
  await captureDialog(page, 'reader-quran');
  const similar = dialog(page).getByRole('button', { name: 'Similar', exact: true });
  await similar.click({ timeout: STABLE_LIMIT_MS });
  await dialog(page).getByText('% coverage').first().waitFor();
  await captureDialog(page, 'reader-quran-similar');
  await page.context().close();

  // CompileTab, blocked: compileEnabled seeded, no key.
  page = await open({ reader: { compile: true } });
  await tap(page, page.locator('[data-entity-id="entity-quran"]'));
  await dialog(page).getByRole('button', { name: 'Compiled', exact: true }).click({ timeout: STABLE_LIMIT_MS });
  await dialog(page).getByText('API key is set. Add one in Settings.').waitFor();
  await captureDialog(page, 'reader-quran-compiled');
  await page.context().close();

  // HadithSheet after dorar and sunnah.com fail (aborted; no sunnah key), then
  // its diagnostics — only the diagnostics block, so a footer change is
  // reader-hadith's alone.
  page = await open();
  await tap(page, page.locator('[data-entity-id="entity-hadith"]'));
  await dialog(page).getByText('No verified English translation').waitFor();
  await captureDialog(page, 'reader-hadith');
  await dialog(page).getByRole('button', { name: 'Show dorar diagnostics' }).click();
  const diagnostics = dialog(page).locator('div.border-t.pt-2', { has: page.locator('dl') });
  await diagnostics.waitFor();
  await capture(page, dir, 'reader-hadith-diagnostics', diagnostics);
  await page.context().close();

  // The sheet in a sharḥ of Bukhārī (step T1): the ḥadīth looked for by its
  // text in the book's collection, in each of its four outcomes. Each its own
  // context and seed (sharhCollectionRows), so no other capture's database
  // holds a hadith-json collection.
  for (const [state, waitFor] of [
    ['matched', 'identified by its text'],
    ['no-match', 'matched this text'],
    ['ambiguous', 'more than one ḥadīth'],
    ['not-imported', 'to find this ḥadīth by its text'],
    // docs/plans/hadith-short-quote.md, step 5 (Q11).
    ['short-matched', 'identified by a short quotation'],
    ['short-too-short', 'too short to identify'],
    ['short-none-near', 'near the number the book gives'],
  ]) {
    page = await open({ reader: { sharh: state } });
    await tap(page, page.locator('[data-entity-id="entity-hadith"]'));
    await dialog(page).getByText(waitFor).waitFor({ timeout: STABLE_LIMIT_MS });
    await captureDialog(page, `reader-hadith-sharh-${state}`);
    await page.context().close();
  }

  // BiographySheet for the narrator (no biographical work imported).
  page = await open();
  await tap(page, page.locator('[data-entity-id="entity-narrator"]'));
  await dialog(page).waitFor();
  await captureDialog(page, 'reader-biography');
  await page.context().close();

  // SelectionRail for one word with no key (no dictionary: its action is
  // disabled; the word is not cached, so since FOUND_ISSUES 33 Meaning is
  // disabled too, with its reason).
  page = await open();
  await select(page, 0, ...word(UNCACHED_WORD));
  await untilRail(page);
  await capture(page, dir, 'reader-rail', rail(page));
  await page.context().close();

  // Meaning with a (fake) Claude key, the gloss answered 401: the gloss error
  // in DictionarySheet. Before 33 this was reached with no key at all.
  page = await open({ reader: true, network: { glossAuthError: true } });
  await select(page, 0, ...word(UNCACHED_WORD));
  await untilRail(page);
  await rail(page).getByRole('button', { name: /^Meaning/ }).click();
  await dialog(page).getByText('Your Anthropic API key was rejected', { exact: false }).waitFor();
  await captureDialog(page, 'reader-meaning');
  await page.context().close();

  // The gloss ready state, from the seeded wordGlosses row — with no key and
  // the browser offline, so the rail shows Meaning offered from the cache
  // alone (FOUND_ISSUES 33), then the gloss.
  page = await open();
  await page.context().setOffline(true);
  await select(page, 0, ...word(CACHED_WORD));
  await untilRail(page);
  await capture(page, dir, 'reader-rail-offline-cached', rail(page));
  await rail(page).getByRole('button', { name: /^Meaning/ }).click();
  await dialog(page).getByText('a placeholder gloss for the check').waitFor();
  await captureDialog(page, 'reader-meaning-cached');
  await page.context().close();

  // MarginMenu: a long press (600 ms, over MarginTarget's 480) on the matn's
  // margin, then its Translate all…: the batch proposal bar.
  page = await open();
  const margin = page.locator('[data-index="2"] [role="button"]').first();
  // Below the fold at 960×600: scrolled to first, the same way every run.
  await centre(page, margin);
  const box = await margin.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const menu = page.getByRole('menu');
  await menu.waitFor();
  await capture(page, dir, 'reader-margin-menu', menu);
  await menu.getByRole('button', { name: 'Translate all…' }).click();
  const proposal = page.locator('div.border-amber-200', { hasText: "Translate this ḥadīth's commentary?" });
  await proposal.waitFor();
  // The bar is in the page's flow under the sticky header, so with the page
  // scrolled to the matn it sits behind the header (the 5a review found the
  // first baseline's 600×960 PNG showed the header). Back at the top, the bar
  // is on screen below the header.
  await page.evaluate(() => window.scrollTo(0, 0));
  await untilStable('the proposal on screen', () =>
    proposal.evaluate((node) => JSON.stringify([window.scrollY, node.getBoundingClientRect().top])),
  );
  await capture(page, dir, 'reader-batch-proposal', proposal);
  await page.context().close();

  // The translator's notice: a phrase selected, Translate with no key.
  page = await open();
  await select(page, 0, 0, block0.indexOf('،'));
  await untilRail(page);
  await rail(page).getByRole('button', { name: 'Translate', exact: true }).click();
  const notice = page.locator('p', { hasText: 'API key is set. Add one in Settings before translating.' });
  await notice.waitFor();
  await capture(page, dir, 'reader-notice', notice);
  await page.context().close();

  // CardPopover: with the panel a sheet, a marker tap opens a popover.
  if (!beside) {
    page = await open({ cards: true });
    await tap(page, page.getByRole('button', { name: 'Open translation' }).first());
    await dialog(page).getByText('Paragraph 1: a placeholder translation').waitFor();
    await captureDialog(page, 'reader-popover');
    await page.context().close();
  }

  page = await open();
  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  const toc = page.getByRole('dialog', { name: 'Table of contents' });
  await toc.waitFor();
  await capture(page, dir, 'reader-toc', toc);
  await page.context().close();

  page = await open();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const input = page.getByPlaceholder('بحث في هذا الكتاب…');
  await input.fill(SEARCH_WORD);
  const searchColumn = page.locator('div.sticky.self-start', { has: input });
  await searchColumn.getByText(/^\d+ results?$/).waitFor();
  await capture(page, dir, 'reader-search', searchColumn);
  await page.context().close();

  page = await open();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await dialog(page).waitFor();
  await captureDialog(page, 'reader-share');
  await page.context().close();
}

async function proxyCaptures(browser, base, profile, dir) {
  const fresh = () => newPage(browser, base, profile, { network: { holdProxy: true } });
  let page;

  for (const [name, hash] of [
    ['import-proxy', '#/import'],
    ['catalog-proxy', '#/catalog'],
    ['receive-proxy', '#/receive'],
  ]) {
    page = await fresh();
    await go(page, hash);
    if (name === 'catalog-proxy') await page.getByText('bundled copy').waitFor();
    await capture(page, dir, name);
    await page.context().close();
  }

  // Every tab, each panel whole (HTML and screenshot), as the single column
  // was captured before the tabs: the proxy build's differences are spread
  // over several sections.
  page = await fresh();
  await go(page, '#/settings');
  await page.waitForFunction(() => window.location.hash === '#/settings/translation');
  for (const [id, label] of SETTINGS_TABS) {
    if (id !== 'translation') await settingsTabBar(page).getByRole('link', { name: label, exact: true }).click();
    await page.locator(`[data-settings-tab="${id}"]:not([hidden])`).waitFor();
    if (id === 'data') await page.getByText('512 B').waitFor();
    if (id === 'about') await section(page, 'This build').waitFor();
    await capture(page, dir, `settings-proxy-tab-${id}`, column(page));
  }
  await page.context().close();

  // ProgressBar 2: the first catalog entry importing, its first fetch held.
  page = await fresh();
  await go(page, '#/catalog');
  await page.getByText('bundled copy').waitFor();
  const boxes = page.locator('input[type="checkbox"]');
  const count = await boxes.count();
  for (let i = 0; i < count; i++) await boxes.nth(i).setChecked(i === 0);
  await page.getByRole('button', { name: 'Import 1 selected' }).click();
  // At 0% the bar is zero-width, so "attached" rather than "visible".
  await page.locator('.rounded-md.border .bg-accent').first().waitFor({ state: 'attached' });
  await capture(page, dir, 'catalog-importing');
  await page.context().close();

  // ProgressBar 3: a relay code typed, the first relay request held.
  page = await fresh();
  await go(page, '#/receive');
  await page.locator('#relay-code').fill('7KQ2-9XMD-4TPA-RW3H');
  await page.getByRole('button', { name: 'Fetch it' }).click();
  await page.locator('section .bg-accent').first().waitFor({ state: 'attached' });
  await capture(page, dir, 'receive-fetching');
  await page.context().close();

  // ProgressBar 5: the transfer file written for real, then sent; the first PUT held.
  page = await fresh();
  await go(page, '#/settings/data');
  const device = section(page, 'Move to another tablet');
  await device.waitFor();
  await device.getByRole('button', { name: 'Create the transfer file' }).click();
  await device.getByRole('button', { name: 'Send through the proxy' }).click({ timeout: 30_000 });
  await device.getByText(/Sending piece/).waitFor();
  await capture(page, dir, 'device-transfer-relay', device);
  await page.context().close();

  // Copy 8 (ImportScreen's bar, its own markup until FOUND_ISSUES 9 put it on
  // ProgressBar): the partial book resumed, the first page fetch held.
  page = await fresh();
  await go(page, '#/');
  await page.getByRole('button', { name: 'Resume import' }).click();
  // "Resume import" navigates first and starts the crawler second, and the
  // crawler is running only after a few IndexedDB reads. ImportScreen used to
  // pick its stage once, on mount, so the screen it landed on was a race (in
  // this harness usually the empty input form: FOUND_ISSUES 6), and this
  // capture went back to the Library to wait for the crawl and reopened Add
  // book. Since lane C the screen also listens for a crawl starting, so the
  // capture waits for the crawl panel on the screen Resume import opens — the
  // fix is what this wait proves.
  await page.getByText('Fetching page 41 of 100').waitFor();
  await capture(page, dir, 'import-crawling');
  await page.context().close();
}

// ------------------------------------------------------------------ compare

function listFiles(dir) {
  const out = [];
  const walk = (at) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).split('\\').join('/'));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function hashes(dir) {
  return new Map(listFiles(dir).map((file) => [file, sha256(join(dir, file))]));
}

/** The first lines where two .html dumps differ. */
function firstDifference(a, b, context = 3) {
  const left = readFileSync(a, 'utf8').split('\n');
  const right = readFileSync(b, 'utf8').split('\n');
  let line = 0;
  while (line < left.length && line < right.length && left[line] === right[line]) line++;
  const out = [`      first difference at line ${line + 1} (- ${relative(ROOT, a)}, + ${relative(ROOT, b)}):`];
  for (let i = line; i < Math.min(line + context, Math.max(left.length, right.length)); i++) {
    if (left[i] === right[i]) {
      out.push(`        ${left[i].slice(0, 220)}`);
      continue;
    }
    out.push(`      - ${(left[i] ?? '(end of file)').slice(0, 220)}`);
    out.push(`      + ${(right[i] ?? '(end of file)').slice(0, 220)}`);
  }
  return out.join('\n');
}

function compareDirs(a, b) {
  const left = hashes(a);
  const right = hashes(b);
  const files = [...new Set([...left.keys(), ...right.keys()])].sort();
  let differ = 0;
  for (const file of files) {
    if (left.get(file) === right.get(file)) continue;
    differ++;
    if (!left.has(file)) console.log(`  only in ${b}: ${file}`);
    else if (!right.has(file)) console.log(`  only in ${a}: ${file}`);
    else {
      console.log(`  differs: ${file}`);
      if (file.endsWith('.html')) console.log(firstDifference(join(a, file), join(b, file)));
    }
  }
  console.log(`\n${differ === 0 ? 'SAME' : 'DIFFERENT'} — ${files.length - differ}/${files.length} files identical`);
  return differ === 0;
}

function readManifest() {
  return new Map(
    readFileSync(MANIFEST, 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [hash, file] = line.split(/\s+/, 2);
        return [file, hash];
      }),
  );
}

function compareToManifest() {
  if (!existsSync(MANIFEST)) {
    console.error(`\nno manifest at ${relative(ROOT, MANIFEST)}: write it with --write-manifest`);
    process.exit(2);
  }
  const expected = readManifest();
  const actual = hashes(OUT);
  // Screenshots are compared only if the manifest claims them (they are left
  // out of it if they were not byte-stable when it was written).
  const claimsPng = [...expected.keys()].some((file) => file.endsWith('.png'));
  const files = [...new Set([...expected.keys(), ...actual.keys()])]
    .filter((file) => claimsPng || !file.endsWith('.png'))
    .sort();
  const differing = [];
  for (const file of files) {
    if (expected.get(file) === actual.get(file)) continue;
    differing.push(file);
    const why = !actual.has(file) ? 'missing from this run' : !expected.has(file) ? 'not in the manifest' : 'differs';
    console.log(`  ${why}: ${file}`);
    if (why === 'differs' && file.endsWith('.html') && existsSync(join(BASE_DUMP, file))) {
      console.log(firstDifference(join(BASE_DUMP, file), join(OUT, file)));
    }
  }
  console.log(
    `\n${differing.length === 0 ? 'PASS' : 'FAIL'} — ${files.length - differing.length}/${files.length} files match ${relative(ROOT, MANIFEST)}` +
      (claimsPng ? '' : ' (DOM only: the manifest claims no screenshots)'),
  );
  return differing.length === 0;
}

function writeManifest() {
  const withPng = !process.argv.includes('--html-only');
  const lines = [...hashes(OUT)]
    .filter(([file]) => withPng || !file.endsWith('.png'))
    .map(([file, hash]) => `${hash}  ${file}`);
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(
    MANIFEST,
    `# Check U (scripts/verify-markup.mjs): SHA-256 of each normalized capture, per profile.\n` +
      `# Written on the old code (Phase 2 step 2a; captures added in Phase 3 step 3b); every later step must match it.\n` +
      lines.join('\n') +
      '\n',
  );
  console.log(`\nwrote ${relative(ROOT, MANIFEST)}: ${lines.length} files${withPng ? '' : ' (HTML only)'}`);
}

// ------------------------------------------------------------------ main

const compareAt = process.argv.indexOf('--compare');
if (compareAt !== -1) {
  const [a, b] = process.argv.slice(compareAt + 1, compareAt + 3);
  if (!a || !b) {
    console.error('usage: node scripts/verify-markup.mjs --compare <dirA> <dirB>');
    process.exit(2);
  }
  process.exit(compareDirs(resolve(a), resolve(b)) ? 0 : 1);
}

const started = Date.now();
const { preview } = await import('vite');
console.log('Building (vite build, no tsc):');
const builds = [
  { name: 'plain', dir: build('plain', ''), run: plainCaptures },
  { name: 'proxy', dir: build('proxy', PROXY), run: proxyCaptures },
];

rmSync(OUT, { recursive: true, force: true });
const browser = await chromium.launch();
try {
  for (const { name, dir, run } of builds) {
    const server = await preview({
      build: { outDir: dir },
      preview: { port: 4180, strictPort: false },
      logLevel: 'warn',
    });
    const base = server.resolvedUrls.local[0];
    try {
      for (const profile of PROFILES) {
        const out = join(OUT, profile.name);
        mkdirSync(out, { recursive: true });
        const before = captured;
        await run(browser, base, profile, out);
        console.log(`  ${name} ${profile.name}: ${captured - before} captures`);
      }
    } finally {
      await server.close();
    }
  }
} catch (error) {
  console.error(`\nFAIL — a capture could not be taken: ${error.message}`);
  await browser.close();
  process.exit(2);
}
await browser.close();
console.log(`\n${captured} captures in ${relative(ROOT, OUT)} — ${((Date.now() - started) / 1000).toFixed(0)} s`);

if (process.argv.includes('--write-manifest')) {
  writeManifest();
  process.exit(0);
}
process.exit(compareToManifest() ? 0 : 1);
