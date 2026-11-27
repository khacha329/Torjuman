// The Library's arrangement — pins, Move up / Move down, folders — checked in
// a real browser on the tablet's two sizes and a desktop.
//
//   npm run verify:library
//   VERIFY_URL=http://localhost:4173/ node scripts/verify-library.mjs   (against a running build)
//
// Added with lane UI-2. What it drives, on each profile, through the real
// screen and nothing else (no test hook in the app): six synthetic books
// written straight into IndexedDB, then
//   - the order before anything is arranged: newest import first, no headings;
//   - Pin to top from a card's button, and the Pinned heading it brings;
//   - Move down from a card's button, and the rows it stores;
//   - a long press on a card's TITLE (touch on the tablets, a held mouse on
//     the desktop): the menu opens, the press does not open the book, and the
//     menu's Move up moves it;
//   - New folder; filing two books in it, one from the ⋯ button's menu and one
//     from a long press; Rename; collapse, a reload (it stays collapsed), and
//     open again;
//   - the book deleted from the Library and imported again (its `books` row
//     written afresh, with a newer import time): it comes back in its folder,
//     in its place, because the arrangement is keyed by Shamela ID and not
//     on the Book;
//   - Delete folder: its books move to the top of Unfiled, the folder is
//     gone, no book is deleted;
//   - Unpin, which sends the book back to the top of Unfiled;
//   - Pin on one book and Move down on another pressed back to back, before
//     the first write has been read back: both must land.
// Every step checks the order the screen shows, section by section, and the
// steps that store something check the rows in `bookPlacements` and
// `libraryFolders` with raw IndexedDB.
//
// Screenshots of the arranged states go to .verify/library/<profile>/ (gitignored).
// The books are synthetic (their titles are "كتاب تجريبي" and a number), so
// the screenshots may be published with a PR.
//
// What it does not see: share mode. The shared route renders the reader
// alone, never the Library, so there is no Library to look at there; the
// controls are hidden under `useReadOnly()` and ShareStorageAdapter ignores
// the writes, both checked by reading (and the second by check D).

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.verify/library');
const IDS = [880001, 880002, 880003, 880004, 880005, 880006];
const T0 = 1_772_000_000_000;

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    ok
      ? `  ok    ${label}`
      : `  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`,
  );
}

function bookRow(shamelaId, importedAt) {
  const n = IDS.indexOf(shamelaId) + 1;
  const complete = shamelaId !== 880002;
  return {
    id: `shamela-${shamelaId}`, shamelaId, title: `كتاب تجريبي ${n}`, author: 'مؤلف تجريبي',
    publisher: '', edition: '', volumeCount: 1, category: '', structureProfile: 'generic',
    importedAt, importStatus: complete ? 'complete' : 'in-progress', totalPages: 10,
    fetchedPages: complete ? 10 : 4, volumeStarts: [1], hadithCollection: null, role: 'reading',
  };
}

/** Raw IndexedDB in the page: put rows, read a store, delete a key. */
async function idb(page, op, store, arg) {
  return page.evaluate(
    async ({ op, store, arg }) => {
      const db = await new Promise((ok, fail) => {
        const request = indexedDB.open('shamela-reader');
        request.onsuccess = () => ok(request.result);
        request.onerror = () => fail(request.error);
      });
      try {
        const tx = db.transaction(store, op === 'all' ? 'readonly' : 'readwrite');
        const os = tx.objectStore(store);
        const result = await new Promise((ok, fail) => {
          const request = op === 'all' ? os.getAll() : op === 'put' ? null : os.delete(arg);
          if (op === 'put') {
            for (const row of arg) os.put(row);
            tx.oncomplete = () => ok(undefined);
            tx.onerror = () => fail(tx.error);
            return;
          }
          request.onsuccess = () => ok(request.result);
          request.onerror = () => fail(request.error);
        });
        return result;
      } finally {
        db.close();
      }
    },
    { op, store, arg },
  );
}

/** What the screen shows: each section's label and its books, in order. */
async function layout(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('section')).map((section) => [
      section.getAttribute('aria-label'),
      Array.from(section.querySelectorAll('[data-book-card]')).map((card) => Number(card.dataset.bookCard)),
    ]),
  );
}

/** Waits up to 5 s for the layout, then checks it either way. */
async function expectLayout(page, label, expected) {
  const deadline = Date.now() + 5000;
  let actual = await layout(page);
  while (JSON.stringify(actual) !== JSON.stringify(expected) && Date.now() < deadline) {
    await page.waitForTimeout(100);
    actual = await layout(page);
  }
  check(label, actual, expected);
}

async function placements(page) {
  const rows = await idb(page, 'all', 'bookPlacements');
  return rows
    .map((row) => [row.shamelaId, row.pinned, row.position, row.folderId === null ? null : 'folder'])
    .sort((a, b) => a[0] - b[0]);
}

function card(page, shamelaId) {
  return page.locator(`[data-book-card="${shamelaId}"]`);
}

async function runProfile(browser, base, name, contextOptions) {
  console.log(`\n=== ${name} ===`);
  const touch = Boolean(contextOptions.hasTouch);
  const dir = join(OUT, name.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block', locale: 'en-US' });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    failures++;
    console.log(`  FAIL  pageerror: ${error.message}`);
  });
  page.on('dialog', (dialog) => void dialog.accept());
  // Nothing leaves the machine.
  await page.route((url) => !url.href.startsWith(base), (route) => route.abort());
  const shot = (file) => page.screenshot({ path: join(dir, `${file}.png`) });
  const press = (locator) => (touch ? locator.tap() : locator.click());

  /** Holds on the element's centre for 700 ms: a touch on the tablets, the mouse on the desktop. */
  const longPress = async (locator) => {
    // Raw touches land where they are sent: on a card below the fold, nothing.
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (touch) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(700);
      await page.mouse.up();
    }
  };

  await page.goto(base);
  await page.evaluate(() => {
    localStorage.setItem('shamela-reader.onboarded', '1');
    localStorage.setItem('shamela-reader.catalogOffered', '1');
  });
  // The app must have created the database before rows can be written to it.
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some((db) => db.name === 'shamela-reader' && db.version >= 12),
  );
  await idb(page, 'put', 'books', IDS.map((id, i) => bookRow(id, T0 + i)));
  await page.goto(`${base}#/`);
  await page.reload();
  await card(page, 880006).waitFor();

  const all = [880006, 880005, 880004, 880003, 880002, 880001];

  // ---- nothing arranged ------------------------------------------------
  await expectLayout(page, 'unarranged: one section, newest import first', [['Other books', all]]);
  check('unarranged: no heading', await page.getByRole('heading', { name: /Pinned|Unfiled|Other books/ }).count(), 0);
  check('unarranged: Move up disabled on the first card', await card(page, 880006).getByRole('button', { name: 'Move up' }).isDisabled(), true);
  check('unarranged: Move down disabled on the last card', await card(page, 880001).getByRole('button', { name: 'Move down' }).isDisabled(), true);
  await shot('01-unarranged');

  // ---- pin -------------------------------------------------------------
  await press(card(page, 880003).getByRole('button', { name: 'Pin to top' }));
  await expectLayout(page, 'pin: the book moves to Pinned', [
    ['Pinned', [880003]],
    ['Other books', [880006, 880005, 880004, 880002, 880001]],
  ]);
  check('pin: stored', await placements(page), [[880003, true, 0, null]]);

  // ---- Move down by button ---------------------------------------------
  await press(card(page, 880006).getByRole('button', { name: 'Move down' }));
  await expectLayout(page, 'Move down: swaps with the next book', [
    ['Pinned', [880003]],
    ['Other books', [880005, 880006, 880004, 880002, 880001]],
  ]);
  check('Move down: the section is renumbered', await placements(page), [
    [880001, false, 4, null], [880002, false, 3, null], [880003, true, 0, null],
    [880004, false, 2, null], [880005, false, 0, null], [880006, false, 1, null],
  ]);

  // ---- long press on the title: the menu, not the book ------------------
  await longPress(card(page, 880001).locator('h2'));
  const menu = page.getByRole('dialog');
  await menu.waitFor({ timeout: 3000 }).catch(() => {});
  check('long press on the title: the menu opens', await menu.isVisible(), true);
  await page.waitForTimeout(300);
  check('long press on the title: the book is not opened', await page.evaluate(() => location.hash), '#/');
  await shot('02-menu');
  await press(menu.getByRole('button', { name: 'Move up' }));
  await expectLayout(page, 'menu Move up: moves it, the menu stays', [
    ['Pinned', [880003]],
    ['Other books', [880005, 880006, 880004, 880001, 880002]],
  ]);
  check('menu stays open after Move up', await menu.isVisible(), true);
  await press(menu.getByRole('button', { name: 'Close' }));
  check('menu closes', await menu.count(), 0);

  // ---- folders ---------------------------------------------------------
  await press(page.getByRole('button', { name: 'New folder' }));
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Hadith');
  await press(page.getByRole('button', { name: 'Create folder' }));
  await expectLayout(page, 'New folder: an empty folder, then Unfiled', [
    ['Pinned', [880003]],
    ['Hadith', []],
    ['Unfiled', [880005, 880006, 880004, 880001, 880002]],
  ]);
  const folders = await idb(page, 'all', 'libraryFolders');
  check('New folder: stored', folders.map((f) => [f.name, f.collapsed]), [['Hadith', false]]);

  await press(card(page, 880004).getByRole('button', { name: 'More' }));
  await press(menu.getByRole('radio', { name: 'Hadith' }));
  await longPress(card(page, 880002).locator('dl'));
  await menu.waitFor({ timeout: 3000 }).catch(() => {});
  check('long press on the card body: the menu opens', await menu.isVisible(), true);
  await press(menu.getByRole('radio', { name: 'Hadith' }));
  await expectLayout(page, 'filed: each arrives at the top of the folder', [
    ['Pinned', [880003]],
    ['Hadith', [880002, 880004]],
    ['Unfiled', [880005, 880006, 880001]],
  ]);
  check('a book is in at most one folder: one folderId per row', (await idb(page, 'all', 'bookPlacements')).every((row) => row.folderId === null || row.folderId === folders[0].id), true);

  await press(page.getByRole('button', { name: 'Rename' }));
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Ḥadīth works');
  await press(page.getByRole('button', { name: 'Save' }));
  await expectLayout(page, 'Rename: the heading follows', [
    ['Pinned', [880003]],
    ['Ḥadīth works', [880002, 880004]],
    ['Unfiled', [880005, 880006, 880001]],
  ]);
  await page.evaluate(() => document.querySelector('.overflow-auto')?.scrollTo(0, 0));
  await shot('03-arranged');

  await press(page.getByRole('button', { name: 'Ḥadīth works' }));
  await expectLayout(page, 'collapse: the folder hides its books', [
    ['Pinned', [880003]],
    ['Ḥadīth works', []],
    ['Unfiled', [880005, 880006, 880001]],
  ]);
  await page.reload();
  await card(page, 880003).waitFor();
  await expectLayout(page, 'collapse: kept over a reload', [
    ['Pinned', [880003]],
    ['Ḥadīth works', []],
    ['Unfiled', [880005, 880006, 880001]],
  ]);
  check('collapse: aria-expanded false', await page.getByRole('button', { name: 'Ḥadīth works' }).getAttribute('aria-expanded'), 'false');
  await shot('04-folder-collapsed');
  await press(page.getByRole('button', { name: 'Ḥadīth works' }));
  await expectLayout(page, 'open again', [
    ['Pinned', [880003]],
    ['Ḥadīth works', [880002, 880004]],
    ['Unfiled', [880005, 880006, 880001]],
  ]);

  // ---- a book deleted and imported again keeps its place ----------------
  await press(card(page, 880004).getByRole('button', { name: 'Delete' }));
  await expectLayout(page, 'deleted: gone from its folder', [
    ['Pinned', [880003]],
    ['Ḥadīth works', [880002]],
    ['Unfiled', [880005, 880006, 880001]],
  ]);
  check('deleted: its placement row stays', (await placements(page)).some(([id]) => id === 880004), true);
  // Imported again: a fresh `books` row, newer than every other.
  await idb(page, 'put', 'books', [bookRow(880004, T0 + 100)]);
  await page.reload();
  await card(page, 880004).waitFor();
  await expectLayout(page, 'imported again: back in its folder, in its place', [
    ['Pinned', [880003]],
    ['Ḥadīth works', [880002, 880004]],
    ['Unfiled', [880005, 880006, 880001]],
  ]);
  // Replaced in place (as a per-book file or "Add book" again rewrite the row).
  await idb(page, 'put', 'books', [{ ...bookRow(880003, T0 + 200), title: 'كتاب تجريبي 3 (نسخة أخرى)' }]);
  await page.reload();
  await card(page, 880003).waitFor();
  await expectLayout(page, 'replaced in place: still pinned', [
    ['Pinned', [880003]],
    ['Ḥadīth works', [880002, 880004]],
    ['Unfiled', [880005, 880006, 880001]],
  ]);

  // ---- delete the folder -----------------------------------------------
  await press(page.getByRole('button', { name: 'Delete folder' }));
  await expectLayout(page, 'Delete folder: its books go to the top of Unfiled', [
    ['Pinned', [880003]],
    ['Other books', [880004, 880002, 880005, 880006, 880001]],
  ]);
  check('Delete folder: no folder row left', (await idb(page, 'all', 'libraryFolders')).length, 0);
  check('Delete folder: no row names a folder', (await idb(page, 'all', 'bookPlacements')).every((row) => row.folderId === null), true);
  check('Delete folder: every book is still there', (await idb(page, 'all', 'books')).length, 6);

  // ---- unpin -----------------------------------------------------------
  await press(card(page, 880003).getByRole('button', { name: 'Unpin' }));
  await expectLayout(page, 'Unpin: back at the top of the rest', [
    ['Other books', [880003, 880004, 880002, 880005, 880006, 880001]],
  ]);

  // ---- two presses back to back --------------------------------------
  // Pin, then Move on another book before the pin has been read back. Each
  // write is computed from the stores when its turn comes; computed from
  // what was rendered, the Move renumbered its section with 880004 still
  // unpinned and wrote the pin away.
  // Both clicks in one synchronous task, so the second certainly comes before
  // any write or re-render. (Two Playwright taps run in parallel are one
  // two-finger touch, and one of them never becomes a click.)
  await page.evaluate(() => {
    const button = (id, name) =>
      document.querySelector(`[data-book-card="${id}"] button[aria-label="${name}"]`);
    button(880004, 'Pin to top').click();
    button(880005, 'Move down').click();
  });
  await expectLayout(page, 'Pin then Move at once: both land', [
    ['Pinned', [880004]],
    ['Other books', [880003, 880002, 880006, 880005, 880001]],
  ]);
  check('Pin then Move at once: the pin is stored', (await placements(page)).find(([id]) => id === 880004)?.[1], true);

  await context.close();
}

const own = process.env.VERIFY_URL
  ? null
  : await preview({ preview: { port: 4176, strictPort: false }, logLevel: 'warn' });
const base = process.env.VERIFY_URL ?? own.resolvedUrls.local[0];

const browser = await chromium.launch();
try {
  await runProfile(browser, base, 'Touch tablet, landscape 960x600', {
    viewport: { width: 960, height: 600 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await runProfile(browser, base, 'Touch tablet, portrait 600x960', {
    viewport: { width: 600, height: 960 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await runProfile(browser, base, 'Desktop', { viewport: { width: 1280, height: 800 } });
} finally {
  await browser.close();
  await own?.close();
}

console.log(`\nScreenshots in ${OUT}`);
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
