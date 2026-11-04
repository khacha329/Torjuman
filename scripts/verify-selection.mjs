// A selection that outlives scrolling, checked in a real browser.
//
//   npm run verify:selection
//
// Separate from `npm run verify` on purpose. That script runs in jsdom, which
// has no layout: the virtualizer never mounts or unmounts anything there, so
// the failure this guards against cannot happen in it. This needs Chromium,
// through Playwright (a devDependency; `npx playwright install chromium` once
// on a machine that has no browser for it yet).
//
// The bug: the reader is virtualized, so once the block a selection STARTED in
// scrolls more than the overscan away it unmounts, the selection's start
// boundary moves to its parent, and the selection re-anchors somewhere else.
// The page itself scrolls (BlockList), so scrolling here is the window's; the
// distances are past the 200-block overscan, so the pins are what is tested.
// A finger drag on the native handles cannot be simulated, so the same thing
// is done programmatically: select, scroll the start block far out of the
// mounted range, scroll back (or extend the selection the way a dragged handle
// does), then tap Translate on the rail — the real action — and read what it
// resolved from the card it stored. The provider's network is blocked, so the
// card is stored as a failed translation, carrying the anchors and the
// sourceText that readSelection produced. No API key is spent and no test hook
// exists in the app.
//
// Runs every case on a desktop profile and on touch-tablet profiles in
// landscape and portrait (hasTouch + isMobile).
// Against a running build:  VERIFY_URL=http://localhost:4173/ node scripts/verify-selection.mjs
// Otherwise it builds nothing itself; `npm run verify:selection` builds first.

import { chromium } from 'playwright';
import { preview } from 'vite';

const BOOK = 'shamela-424242';
const BLOCKS = 1200;

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    ok
      ? `  ok    ${label}`
      : `  FAIL  ${label}\n        expected ${JSON.stringify(expected)?.slice(0, 160)}\n        actual   ${JSON.stringify(actual)?.slice(0, 160)}`,
  );
}

/** Distinct Arabic per block, long enough that each one wraps over lines. */
function textOf(index) {
  return (
    `الفقرة ${index}: إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى، ` +
    `فمن كانت هجرته إلى الله ورسوله فهجرته إلى الله ورسوله — نهاية ${index}.`
  );
}
const blockId = (index) => `${BOOK}:p1:${index}`;

/** What a selection from (start, offset) to (end, offset) must yield. */
function expectedText(start, startOffset, end, endOffset) {
  if (start === end) return textOf(start).slice(startOffset, endOffset);
  const parts = [textOf(start).slice(startOffset)];
  for (let i = start + 1; i < end; i++) parts.push(textOf(i));
  parts.push(textOf(end).slice(0, endOffset));
  return parts.join('\n\n');
}

async function seed(page) {
  await page.evaluate(
    async ({ book, count, texts }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('shamela-reader');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const put = (store, rows) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite');
          for (const row of rows) tx.objectStore(store).put(row);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      await put('books', [{
        id: book, shamelaId: 424242, title: 'كتاب الاختبار', author: '', publisher: '', edition: '',
        volumeCount: 1, category: '', structureProfile: 'generic', importedAt: 1,
        importStatus: 'complete', totalPages: 1, fetchedPages: 1, volumeStarts: [1], hadithCollection: null,
      }]);
      await put('pages', [{ id: `${book}:p1`, bookId: book, pageIndex: 1, volume: 1, printPage: 1, rawHtml: '', fetchedAt: 1 }]);
      await put('blocks', Array.from({ length: count }, (_, i) => ({
        id: `${book}:p1:${i}`, bookId: book, pageId: `${book}:p1`, order: i, type: 'body',
        text: texts[i], normalized: texts[i], contentHash: `h${i}`, hadithNumber: null,
        tocNodeId: null, spans: [], anchor: null,
      })));
      db.close();
    },
    { book: BOOK, count: BLOCKS, texts: Array.from({ length: BLOCKS }, (_, i) => textOf(i)) },
  );
}

/** Select from a character offset in one block to one in another, as the handles would. */
async function select(page, from, fromOffset, to, toOffset) {
  await page.evaluate(
    ({ from, fromOffset, to, toOffset }) => {
      const position = (id, offset) => {
        const element = document.querySelector(`[data-block-id="${id}"]`);
        if (!element) throw new Error(`block ${id} is not mounted`);
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let seen = 0;
        while (walker.nextNode()) {
          const length = walker.currentNode.textContent.length;
          if (seen + length >= offset) return [walker.currentNode, offset - seen];
          seen += length;
        }
        throw new Error(`offset ${offset} is past the end of ${id}`);
      };
      const [startNode, startOffset] = position(from, fromOffset);
      const [endNode, endOffset] = position(to, toOffset);
      window.getSelection().setBaseAndExtent(startNode, startOffset, endNode, endOffset);
    },
    { from, fromOffset, to, toOffset },
  );
}

/** Move the selection's focus, the way dragging the far handle does. */
async function extendTo(page, to, toOffset) {
  await page.evaluate(
    ({ to, toOffset }) => {
      const element = document.querySelector(`[data-block-id="${to}"]`);
      if (!element) throw new Error(`block ${to} is not mounted`);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let seen = 0;
      while (walker.nextNode()) {
        const length = walker.currentNode.textContent.length;
        if (seen + length >= toOffset) {
          window.getSelection().extend(walker.currentNode, toOffset - seen);
          return;
        }
        seen += length;
      }
    },
    { to, toOffset },
  );
}

/** Scroll the page until `index` is on screen, in steps, as a reader would. */
async function scrollUntilMounted(page, index) {
  for (let step = 0; step < 600; step++) {
    const there = await page.evaluate((id) => {
      const element = document.querySelector(`[data-block-id="${id}"]`);
      if (!element) return false;
      element.scrollIntoView({ block: 'center' });
      return true;
    }, blockId(index));
    if (there) {
      await page.waitForTimeout(250);
      return;
    }
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(30);
  }
  throw new Error(`could not scroll to block ${index}`);
}

async function scrollToTop(page) {
  for (let step = 0; step < 600; step++) {
    const top = await page.evaluate(() => {
      window.scrollBy(0, -1500);
      return window.scrollY;
    });
    await page.waitForTimeout(30);
    if (top === 0) break;
  }
  await page.waitForTimeout(250);
}

/** The lowest-numbered block in the DOM — how far the start has been left behind. */
async function lowestMounted(page) {
  return page.evaluate(() =>
    Math.min(...Array.from(document.querySelectorAll('[data-block-id]'), (el) =>
      Number(el.getAttribute('data-block-id').split(':').pop()))),
  );
}

/** Where the browser's selection actually sits, for the log. */
async function describeSelection(page) {
  return page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return 'no selection';
    const owner = (node) => {
      for (let n = node; n; n = n.parentNode) {
        if (n instanceof HTMLElement && n.hasAttribute('data-block-id')) {
          return `block ${n.getAttribute('data-block-id').split(':').pop()}`;
        }
      }
      return node instanceof HTMLElement ? `<${node.tagName.toLowerCase()} class="${node.className}">` : 'outside any block';
    };
    const range = selection.getRangeAt(0);
    return `starts in ${owner(range.startContainer)}, ends in ${owner(range.endContainer)}`;
  });
}

/** Tap Translate on the rail and read back the card it stored. */
async function translateAndRead(page) {
  await page.waitForTimeout(300); // the rail appears on a debounced selectionchange
  console.log(`  (selection ${await describeSelection(page)})`);
  const rail = page.getByRole('button', { name: 'Translate', exact: true });
  if ((await rail.count()) === 0) return null;
  await rail.click();
  for (let attempt = 0; attempt < 50; attempt++) {
    const card = await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('shamela-reader');
        request.onsuccess = () => resolve(request.result);
      });
      const cards = await new Promise((resolve) => {
        const request = db.transaction('cards').objectStore('cards').getAll();
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return cards.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    });
    if (card) return card;
    await page.waitForTimeout(100);
  }
  return null;
}

async function clearCards(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open('shamela-reader');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction('cards', 'readwrite');
      tx.objectStore('cards').clear();
      tx.oncomplete = resolve;
    });
    db.close();
  });
}

function anchorsOf(card) {
  return card && {
    startBlockId: card.startBlockId,
    startOffset: card.startOffset,
    endBlockId: card.endBlockId,
    endOffset: card.endOffset,
  };
}

async function runProfile(browser, base, name, contextOptions, screenshot) {
  console.log(`\n=== ${name} ===`);
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`  pageerror: ${error.message}`));
  // No translation leaves the machine: the provider's network is cut, so the
  // card is stored as a failed translation with what the selection resolved to.
  await page.route(/generativelanguage\.googleapis\.com|api\.anthropic\.com/, (route) => route.abort());

  await page.goto(base);
  await page.evaluate(() => {
    localStorage.setItem('shamela-reader.onboarded', '1');
    localStorage.setItem('shamela-reader.catalogOffered', '1');
    localStorage.setItem('shamela-reader.gemini-api-key', 'test-key-never-sent');
  });
  await page.waitForFunction(() => document.body.innerText.length > 0);
  await seed(page);
  await page.goto(`${base}#/read/${encodeURIComponent(BOOK)}`);
  await page.reload();
  await page.locator(`[data-block-id="${blockId(5)}"]`).waitFor();

  // ---- block 5 → block 8, then scroll 5 far out of range and back --------
  // 500 is more than OVERSCAN past 5: without its pin, 5 would unmount.
  await select(page, blockId(5), 4, blockId(8), 6);
  await scrollUntilMounted(page, 500);
  const left = await lowestMounted(page);
  console.log(`  (scrolled away: lowest block in the DOM ${left === 5 ? 'is the pinned 5' : `is ${left}`})`);
  // A pinned block is mounted, not in view: the saved reading position must
  // follow what is on screen, not jump back to the selection's start.
  await page.waitForTimeout(1200); // the position is saved after 900ms still
  const position = await page.evaluate(async (book) => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open('shamela-reader');
      request.onsuccess = () => resolve(request.result);
    });
    const row = await new Promise((resolve) => {
      const request = db.transaction('positions').objectStore('positions').get(book);
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return row?.blockOrder ?? null;
  }, BOOK);
  check('  meanwhile the reading position follows the screen, not the pinned block', position !== null && position > 50, true);
  await scrollToTop(page);
  if (screenshot) {
    // Blocks 5–8 in view, so the picture shows the selection itself (or its
    // absence) rather than the paragraphs above it.
    await page.evaluate((id) => {
      document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ block: 'start' });
    }, blockId(4));
    await page.waitForTimeout(400);
    await page.screenshot({ path: screenshot });
  }
  const short = await translateAndRead(page);
  check(
    'after scrolling 5 far away and back, the selection still starts in block 5 at offset 4',
    anchorsOf(short),
    { startBlockId: blockId(5), startOffset: 4, endBlockId: blockId(8), endOffset: 6 },
  );
  check('  and its text is the whole stored range', short?.sourceText ?? null, expectedText(5, 4, 8, 6));

  // ---- block 5 → block 65 selected, 5 scrolled off screen and back ---------
  await clearCards(page);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await scrollToTop(page);
  await select(page, blockId(5), 4, blockId(65), 6);
  await scrollUntilMounted(page, 500);
  await scrollToTop(page);
  const sixty = await translateAndRead(page);
  check(
    'a selection from block 5 to block 65, scrolled away and back, is unchanged',
    anchorsOf(sixty),
    { startBlockId: blockId(5), startOffset: 4, endBlockId: blockId(65), endOffset: 6 },
  );
  check(
    '  and complete, every block in between included',
    Array.from({ length: 59 }, (_, i) => textOf(6 + i)).every(
      (text) => sixty?.sourceText?.includes(text) ?? false,
    ),
    true,
  );
  check('  exactly', sixty?.sourceText ?? null, expectedText(5, 4, 65, 6));

  // ---- block 5 → block 185: the far handle dragged ~180 blocks down -------
  // Within OVERSCAN, so every block it spans stays mounted and the native
  // selection itself (not only the stored-text rebuild) holds the whole range.
  await clearCards(page);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await scrollToTop(page);
  await select(page, blockId(5), 4, blockId(5), 10);
  await scrollUntilMounted(page, 185);
  await extendTo(page, blockId(185), 6);
  const domComplete = await page.evaluate(
    (texts) => {
      const text = window.getSelection().toString();
      return texts.every((t) => text.includes(t));
    },
    Array.from({ length: 179 }, (_, i) => textOf(6 + i)),
  );
  check('a selection dragged across ~180 blocks spans only mounted blocks', domComplete, true);
  const long = await translateAndRead(page);
  check(
    '  and keeps both ends',
    anchorsOf(long),
    { startBlockId: blockId(5), startOffset: 4, endBlockId: blockId(185), endOffset: 6 },
  );
  check('  with the whole text', long?.sourceText ?? null, expectedText(5, 4, 185, 6));

  // ---- a selection inside one block is unchanged --------------------------
  await clearCards(page);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await scrollToTop(page);
  await select(page, blockId(7), 3, blockId(7), 20);
  const single = await translateAndRead(page);
  check('a selection inside one block reads as before', single?.sourceText ?? null, expectedText(7, 3, 7, 20));

  await context.close();
}

const own = process.env.VERIFY_URL
  ? null
  : await preview({ preview: { port: 4174, strictPort: false }, logLevel: 'warn' });
const base = process.env.VERIFY_URL ?? own.resolvedUrls.local[0];

const browser = await chromium.launch();
try {
  await runProfile(browser, base, 'Desktop', { viewport: { width: 1280, height: 800 } });
  await runProfile(browser, base, 'Touch tablet, landscape 960×600', {
    viewport: { width: 960, height: 600 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  }, process.env.SELECTION_SCREENSHOT);
  await runProfile(browser, base, 'Touch tablet, portrait 600×960', {
    viewport: { width: 600, height: 960 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
} finally {
  await browser.close();
  await own?.close();
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
