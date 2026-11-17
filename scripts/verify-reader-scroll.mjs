// The reader with the page as its scroller, checked in a real browser.
//
//   npm run verify:reader     (builds first; or VERIFY_URL=… node scripts/verify-reader-scroll.mjs)
//
// BlockList is a window virtualizer: the document scrolls, the header is
// sticky, and the side panel is a sticky column (or, in portrait, a sheet held
// to the bottom of the screen). This checks everything that used to rely on the
// reader's own scroll box, on touch-tablet profiles in landscape and portrait:
//
//   - the page is what scrolls, and the header and panel stay put
//   - jump-to-page, the table of contents and search land on the right block
//   - the reading position is restored after a reload
//   - measured heights stay right with content-visibility: on-screen blocks
//     neither overlap nor leave gaps, wherever the page has been scrolled
//   - DOM size and long tasks while scrolling a long section (reported)
//
// Then, after both profiles and on a book of their own (the same 1,500
// blocks plus three read marks, two translation cards and a small dictionary
// book), the reader's controls, each scenario in a fresh browser context so
// that nothing above runs on a different page and no scenario inherits
// another's state (Phase 5 plan, Design §1.2; step 5b):
//
//   - landscape: Ctrl+\ and the header's Hide cards with the edge tab; a
//     margin marker opening its card in the panel; a card in the panel
//     bringing its block to the middle; the read-mark ↑ ↓; double-tap
//     opening the dictionary; the restored position applied once; the
//     divider dragged with a mouse; the divider dragged with a finger
//     (reported, not judged: FOUND_ISSUES 27)
//   - portrait: the cards sheet's handle; a marker opening a popover; the
//     read-mark ↑ ↓; double-tap
//
// Like verify-selection.mjs it needs Chromium through Playwright, and is kept
// out of `npm run verify` because jsdom has no layout. SCREENSHOT_DIR, if set,
// receives a mid-selection screenshot of each layout.

import { chromium } from 'playwright';
import { preview } from 'vite';

const BOOK = 'shamela-515151';
const BLOCKS = 1500;
const PER_PAGE = 5;
const SEARCH_WORD = 'قنطرير';
const SEARCH_BLOCK = 1100;
/** A Qurʾānic verse (14:7), which the reader detects and marks as tappable. */
const VERSE_BLOCK = 12;
const VERSE =
  'وَإِذْ تَأَذَّنَ رَبُّكُمْ لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ ۖ وَلَئِن كَفَرْتُمْ إِنَّ عَذَابِي لَشَدِيدٌ';

// Twice this check hung with nothing on screen and the CPU idle (Phase 4
// step 4n, after its last portrait step; Phase 5 step 5a, between the
// landscape report and the portrait start), on bundles that had not
// changed, and five traced runs afterwards did not reproduce it. A hang
// gives no clue where it was, and once Phase 5 adds scenarios a hang caused
// by a real regression would look the same. So, by the owner's decision
// (Phase 5 plan, Owner's answers, the amendment to Q2), the waits around
// setup and teardown get limits of their own (the seed, the onboarding
// write, opening and closing contexts, closing the browser and the preview
// server), the seed's IndexedDB writes also fail on an abort or a blocked
// open, and a watchdog bounds every other wait, naming the step it was in. No assertion
// changed: a stall is reported as a failure of its own, not as a pass.
let currentStep = 'starting';
const step = (label) => { currentStep = label; };
const STALL_MS = 10 * 60_000;
const watchdog = setTimeout(() => {
  console.log(`\nFAIL — stalled for ${STALL_MS / 60_000} min at: ${currentStep}\n`);
  process.exit(2);
}, STALL_MS);
watchdog.unref();
/** A wait that had no limit of its own, given one, and named if it runs out. */
function within(ms, label, promise) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms: ${label}`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

let failures = 0;
let checks = 0;
function check(label, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const blockId = (index) => `${BOOK}:p${pageOf(index)}:${index}`;
function pageOf(index) {
  return Math.floor(index / PER_PAGE) + 1;
}
const firstBlockOfPage = (page) => (page - 1) * PER_PAGE;

function textOf(index) {
  if (index === VERSE_BLOCK) return VERSE;
  const word = index === SEARCH_BLOCK ? ` ${SEARCH_WORD}` : '';
  // Lengths vary so blocks differ in height, as real paragraphs do.
  const extra = 'وفيه بيان لما سبق من القول. '.repeat(index % 4);
  return `الفقرة ${index}: إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى${word}. ${extra}`;
}

async function seed(page) {
  const toc = [
    { title: 'كتاب الطهارة', page: 1 },
    { title: 'كتاب الصلاة', page: 60 },
    { title: 'كتاب الصيام', page: 200 },
  ];
  await within(60_000, 'seeding the book', page.evaluate(
    async ({ book, count, perPage, texts, toc }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('shamela-reader');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('seed: opening the database was blocked'));
      });
      const put = (store, rows) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite');
          for (const row of rows) tx.objectStore(store).put(row);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error(`seed: the ${store} transaction was aborted`));
        });
      const pages = Math.ceil(count / perPage);
      await put('books', [{
        id: book, shamelaId: 515151, title: 'كتاب التمرير', author: '', publisher: '', edition: '',
        volumeCount: 1, category: '', structureProfile: 'generic', importedAt: 1,
        importStatus: 'complete', totalPages: pages, fetchedPages: pages, volumeStarts: [1], hadithCollection: null,
      }]);
      await put('pages', Array.from({ length: pages }, (_, i) => ({
        id: `${book}:p${i + 1}`, bookId: book, pageIndex: i + 1, volume: 1, printPage: i + 1, rawHtml: '', fetchedAt: 1,
      })));
      await put('tocNodes', toc.map((node, i) => ({
        id: `${book}:toc${i}`, bookId: book, parentId: null, title: node.title, pageIndex: node.page, order: i, depth: 0,
      })));
      await put('blocks', Array.from({ length: count }, (_, i) => {
        const pageIndex = Math.floor(i / perPage) + 1;
        return {
          id: `${book}:p${pageIndex}:${i}`, bookId: book, pageId: `${book}:p${pageIndex}`, order: i, type: 'body',
          text: texts[i], normalized: texts[i], contentHash: `h${i}`, hadithNumber: null,
          tocNodeId: null, spans: [], anchor: null,
        };
      }));
      db.close();
    },
    { book: BOOK, count: BLOCKS, perPage: PER_PAGE, texts: Array.from({ length: BLOCKS }, (_, i) => textOf(i)), toc },
  ));
}

/** Where a block sits on screen, and where the header ends. */
async function placement(page, index) {
  return page.evaluate((id) => {
    const element = document.querySelector(`[data-block-id="${id}"]`);
    const header = document.querySelector('header');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      headerBottom: Math.round(header?.getBoundingClientRect().bottom ?? 0),
      viewport: window.innerHeight,
    };
  }, blockId(index));
}

/** The block the reader counts as "at the top": first one not behind the header. */
async function topBlock(page) {
  return page.evaluate(() => {
    const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
    let best = null;
    for (const element of document.querySelectorAll('[data-block-id]')) {
      const rect = element.parentElement.parentElement.getBoundingClientRect();
      if (rect.bottom <= headerBottom || rect.top >= window.innerHeight) continue;
      const index = Number(element.getAttribute('data-block-id').split(':').pop());
      if (best === null || index < best) best = index;
    }
    return best;
  });
}

/** On-screen blocks must sit edge to edge: no overlap, no gap. */
async function contiguity(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[data-index]'))
      .map((element) => ({ index: Number(element.getAttribute('data-index')), rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight)
      .sort((a, b) => a.index - b.index);
    let worst = 0;
    for (let i = 1; i < items.length; i++) {
      if (items[i].index !== items[i - 1].index + 1) continue;
      worst = Math.max(worst, Math.abs(items[i].rect.top - items[i - 1].rect.bottom));
    }
    return { pairs: items.length - 1, worst: Math.round(worst * 10) / 10 };
  });
}

async function settle(page, ms = 500) {
  await page.waitForTimeout(ms);
}

async function runProfile(browser, base, name, options, layout, screenshot) {
  console.log(`\n=== ${name} ===`);
  step(`${name}: opening a context`);
  const context = await within(60_000, `${name}: opening a context`, browser.newContext(options));
  // Long tasks from the very start, so the scroll measurement sees them all.
  await context.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__longTasks.push({ start: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // Not supported: reported as unavailable.
      window.__longTasks = null;
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`  pageerror: ${error.message}`));

  step(`${name}: loading the app`);
  await page.goto(base);
  await within(30_000, `${name}: marking onboarding done`, page.evaluate(() => {
    localStorage.setItem('shamela-reader.onboarded', '1');
    localStorage.setItem('shamela-reader.catalogOffered', '1');
  }));
  await page.waitForFunction(() => document.body.innerText.length > 0);
  step(`${name}: seeding`);
  await seed(page);
  step(`${name}: opening the book`);
  await page.goto(`${base}#/read/${encodeURIComponent(BOOK)}`);
  await page.reload();
  await page.locator(`[data-block-id="${blockId(0)}"]`).waitFor();
  await settle(page);

  // REPORT_ONLY measures and nothing else, so the same numbers can be taken
  // from a build where the reader still scrolls in a box of its own.
  step(`${name}: the checks`);
  if (!process.env.REPORT_ONLY) await runChecks(page, layout);
  step(`${name}: measuring scrolling`);
  await reportScrolling(page);
  if (screenshot) await screenshotSelection(page, screenshot);
  step(`${name}: closing the context`);
  await within(60_000, `${name}: closing the context`, context.close());
}

async function runChecks(page, layout) {
  // ---- the page scrolls, the chrome stays ------------------------------------
  const scroller = await page.evaluate(() => {
    const surface = document.querySelector('.reader-surface');
    return {
      document: document.scrollingElement.scrollHeight > window.innerHeight * 10,
      nested: surface.scrollHeight > surface.clientHeight + 1 && getComputedStyle(surface).overflowY !== 'visible',
    };
  });
  check('the document is the scroller', scroller.document && !scroller.nested, JSON.stringify(scroller));

  await page.evaluate(() => window.scrollTo(0, 20000));
  await settle(page);
  const chrome = await page.evaluate(() => {
    const header = document.querySelector('header').getBoundingClientRect();
    const aside = document.querySelector('aside')?.getBoundingClientRect() ?? null;
    const sheet = Array.from(document.querySelectorAll('button')).find((b) => /Cards \(|Hide cards/.test(b.textContent) && b.className.includes('border-t'));
    return {
      scrolled: Math.round(window.scrollY),
      headerTop: Math.round(header.top),
      headerBottom: Math.round(header.bottom),
      asideTop: aside ? Math.round(aside.top) : null,
      asideBottom: aside ? Math.round(aside.bottom) : null,
      sheetBottom: sheet ? Math.round(sheet.getBoundingClientRect().bottom) : null,
      viewport: window.innerHeight,
    };
  });
  check('the header stays at the top while the page scrolls', chrome.scrolled > 10000 && chrome.headerTop === 0, JSON.stringify(chrome));
  if (layout === 'beside') {
    check(
      'the card panel is a column held under the header, to the bottom of the screen',
      chrome.asideTop === chrome.headerBottom && Math.abs(chrome.asideBottom - chrome.viewport) <= 1,
      `aside ${chrome.asideTop}–${chrome.asideBottom}, header ends ${chrome.headerBottom}, viewport ${chrome.viewport}`,
    );
  } else {
    check(
      'the cards sheet stays at the bottom of the screen',
      chrome.sheetBottom !== null && Math.abs(chrome.sheetBottom - chrome.viewport) <= 1,
      `sheet bar ends ${chrome.sheetBottom}, viewport ${chrome.viewport}`,
    );
  }
  check('  and the blocks on screen sit edge to edge', (await contiguity(page)).worst <= 1.5, JSON.stringify(await contiguity(page)));

  // ---- a popover follows its anchor as the page scrolls -----------------------
  if (layout === 'beside') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    const verse = page.locator(`[data-block-id="${blockId(VERSE_BLOCK)}"] [data-entity-id]`).first();
    if ((await verse.count()) === 0) {
      check('the verse is detected, so its popover can be tested', false, 'no entity marked');
    } else {
      await verse.scrollIntoViewIfNeeded();
      await settle(page, 300);
      await verse.click();
      const close = page.getByRole('button', { name: 'Close', exact: true });
      await close.waitFor({ timeout: 5000 });
      const panelTop = () =>
        page.evaluate(() => {
          const button = Array.from(document.querySelectorAll('button[aria-label="Close"]')).pop();
          return Math.round(button.closest('.fixed').getBoundingClientRect().top);
        });
      const before = await panelTop();
      await page.evaluate(() => window.scrollBy(0, 60));
      await settle(page, 300);
      const after = await panelTop();
      check('a popover follows its anchor as the page scrolls', Math.abs(before - after - 60) <= 2, `top ${before} → ${after}`);
      await page.evaluate(() => window.scrollBy(0, 3000));
      await settle(page, 400);
      check('  and closes once its text has left the screen', (await close.count()) === 0);
    }
  }

  // ---- jump to page (ج/ص) -----------------------------------------------------
  await page.getByLabel('Printed page').fill('120');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await settle(page, 900);
  const jumped = await placement(page, firstBlockOfPage(120));
  check(
    'jump to ص 120 puts its first block just below the header',
    jumped !== null && jumped.top >= jumped.headerBottom - 2 && jumped.top <= jumped.headerBottom + 80,
    JSON.stringify(jumped),
  );
  const indicator = await page.locator('header').innerText();
  check('  and the ج/ص indicator follows', indicator.includes('ص١٢٠'), indicator.match(/ج[^\s]*\s?ص[^\s]*/)?.[0] ?? indicator.slice(0, 60));
  check('  with the blocks on screen edge to edge', (await contiguity(page)).worst <= 1.5, JSON.stringify(await contiguity(page)));

  // ---- table of contents --------------------------------------------------------
  await page.getByRole('button', { name: 'Contents' }).click();
  await page.getByRole('button', { name: 'كتاب الصيام' }).click();
  await settle(page, 900);
  const toc = await placement(page, firstBlockOfPage(200));
  check(
    'a contents entry (page 200) lands on its first block, below the header',
    toc !== null && toc.top >= toc.headerBottom - 2 && toc.top <= toc.headerBottom + 80,
    JSON.stringify(toc),
  );

  // ---- search ----------------------------------------------------------------------
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByPlaceholder('بحث في هذا الكتاب…').fill(SEARCH_WORD);
  await page.getByText('1 result').waitFor({ timeout: 10_000 });
  await page.locator('button', { hasText: SEARCH_WORD }).first().click();
  await settle(page, 900);
  const found = await placement(page, SEARCH_BLOCK);
  const middle = found && (found.top + found.bottom) / 2;
  const visibleMiddle = found && (found.headerBottom + found.viewport) / 2;
  check(
    `a search result (block ${SEARCH_BLOCK}) is brought to the middle of the screen`,
    found !== null && Math.abs(middle - visibleMiddle) < found.viewport * 0.2,
    JSON.stringify(found),
  );
  check('  with the blocks on screen edge to edge', (await contiguity(page)).worst <= 1.5, JSON.stringify(await contiguity(page)));
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();

  // Scrolling back up over blocks laid out for the first time: their real
  // heights replace the estimates as they come on screen, and the page must not
  // be left with overlaps or gaps.
  for (let step = 0; step < 25; step++) {
    await page.evaluate(() => window.scrollBy(0, -400));
    await page.waitForTimeout(40);
  }
  await settle(page);
  check('scrolling up into never-seen blocks leaves no overlap or gap', (await contiguity(page)).worst <= 1.5, JSON.stringify(await contiguity(page)));

  // ---- reading position survives a reload ------------------------------------------
  // Block 700 opens page 141; the jump puts it at the top, below the header.
  await page.getByLabel('Printed page').fill(String(pageOf(700)));
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await settle(page, 900);
  const before = await topBlock(page);
  check('(before reloading, block 700 is the one at the top)', before === 700, `top block ${before}`);
  await page.waitForTimeout(1300); // saved 900ms after scrolling stops
  await page.reload();
  await page.locator('header').waitFor();
  await page.waitForFunction(() => window.scrollY > 1000, null, { timeout: 10_000 }).catch(() => {});
  await settle(page, 900);
  const after = await topBlock(page);
  check('the reading position is restored after a reload', before !== null && after !== null && Math.abs(after - before) <= 1, `before ${before}, after ${after}`);

}

/** DOM size and long tasks while scrolling a long section. Reported, not judged. */
async function reportScrolling(page) {
  const report = await page.evaluate(async () => {
    // Whichever element scrolls: the page here, or the reader's own box in a
    // build from before this change.
    const surface = document.querySelector('.reader-surface');
    const nested =
      surface.scrollHeight > surface.clientHeight + 1 && getComputedStyle(surface).overflowY !== 'visible';
    const scroller = nested ? surface : document.scrollingElement;
    scroller.scrollTop = 0;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const started = performance.now();
    const target = Math.min(scroller.scrollHeight * 0.6, 240000);
    await new Promise((resolve) => {
      const step = () => {
        scroller.scrollTop += 120;
        if (scroller.scrollTop >= target || performance.now() - started > 90000) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const ended = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const tasks = (window.__longTasks ?? []).filter((t) => t.start >= started && t.start <= ended);
    return {
      scroller: nested ? 'reader box' : 'page',
      scrolledPx: Math.round(scroller.scrollTop),
      seconds: Math.round((ended - started) / 100) / 10,
      domNodes: document.getElementsByTagName('*').length,
      mountedBlocks: document.querySelectorAll('[data-block-id]').length,
      longTasks: window.__longTasks === null ? 'unsupported' : tasks.length,
      longestMs: tasks.length ? Math.round(Math.max(...tasks.map((t) => t.duration))) : 0,
      totalBlockingMs: Math.round(tasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)),
    };
  });
  console.log(`  report: ${JSON.stringify(report)}`);
}

/** A selection across four paragraphs, near the top, with the rail showing. */
async function screenshotSelection(page, screenshot) {
  {
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await page.evaluate((ids) => {
      const position = (id, offset) => {
        const walker = document.createTreeWalker(document.querySelector(`[data-block-id="${id}"]`), NodeFilter.SHOW_TEXT);
        walker.nextNode();
        return [walker.currentNode, offset];
      };
      const [a, ao] = position(ids[0], 9);
      const [b, bo] = position(ids[1], 20);
      window.getSelection().setBaseAndExtent(a, ao, b, bo);
      document.querySelector(`[data-block-id="${ids[0]}"]`).scrollIntoView({ block: 'center' });
    }, [blockId(4), blockId(7)]);
    await settle(page, 700);
    await page.screenshot({ path: screenshot });
  }
}

// ------------------------------------------------- the reader's controls (5b)
//
// Added in Phase 5 step 5b, on the code as it was, so that the moves of the
// screen's hooks and parts that follow have something to fail on: before this
// nothing checked the divider, Ctrl+\, Hide cards, the sheet's handle, a
// marker or card tap, the read-mark ↑ ↓, double-tap or the restore's guard.
//
// Every scenario opens its own context and seeds the book afresh, so the
// existing checks and the performance report above run on exactly the page
// they always did (cards and marks would add marker and band nodes and move
// the DOM-node count), and a scenario that fails leaves nothing behind for
// the next. The extra rows are synthetic, like the book.

/** Two translation cards: one for the marker scenarios, one far down for the card tap. */
const MARKER_BLOCK = 300;
const CARD_BLOCK = 1000;
/** Three read marks, for the header's ↑ ↓. */
const READ_MARKS = [400, 450, 500];
/** A ج/ص page past the last read mark (block 545 opens it). */
const PAST_READ_MARKS = 110;
/** A small dictionary book, so double-tap has something to open. */
const DICTIONARY = 'shamela-515152';
/** The word double-tapped, in every block's text; its root is the dictionary's entry. */
const DOUBLE_TAP_WORD = 'الأعمال';
const DOUBLE_TAP_BLOCK = 2;

async function seedControls(page) {
  const cardText = (index) => textOf(index);
  const card = (key, index) => ({
    id: `card-${key}`, bookId: BOOK, kind: 'translation', startBlockId: blockId(index), startOffset: 0,
    endBlockId: blockId(index), endOffset: cardText(index).length, createdAt: 1 + index, collapsed: false,
    sourceText: cardText(index),
    segments: [{ type: 'prose', arabic: '', english: `Paragraph ${index}: a placeholder translation, not from a real book.`, source: 'model' }],
    coverage: 1, reachedEnd: true, profileId: 'profile-study-circle', promptVersion: 1, glossaryHash: 'synthetic',
    providerId: 'gemini', model: 'gemini-3.7-flash', cacheKey: `synthetic-${key}`, status: 'complete',
    usage: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: null,
  });
  const read = (index) => ({
    id: `mark-read-${index}`, bookId: BOOK, startBlockId: blockId(index), startOffset: 0,
    endBlockId: blockId(index), endOffset: textOf(index).length, kind: 'read', scope: 'block',
    note: null, createdAt: 1 + index, collapsed: false,
  });
  // The dictionary: one page, one root entry (ع م ل) and its text. Synthetic.
  const entryText = '(ع م ل) : مدخل تجريبي للتحقق من المعجم، وليس من كتاب حقيقي.';
  const rows = {
    books: [{
      id: DICTIONARY, shamelaId: 515152, title: 'معجم تجريبي', author: '', publisher: '', edition: '',
      volumeCount: 1, category: '', structureProfile: 'generic', importedAt: 1, importStatus: 'complete',
      totalPages: 1, fetchedPages: 1, volumeStarts: [1], hadithCollection: null, role: 'dictionary',
    }],
    pages: [{ id: `${DICTIONARY}:p1`, bookId: DICTIONARY, pageIndex: 1, volume: 1, printPage: 1, rawHtml: '', fetchedAt: 1 }],
    blocks: [{
      id: `${DICTIONARY}:p1:0`, bookId: DICTIONARY, pageId: `${DICTIONARY}:p1`, order: 0, type: 'body',
      text: entryText, normalized: entryText, contentHash: 'd0', hadithNumber: null, tocNodeId: null, spans: [], anchor: null,
    }],
    dictionaryEntries: [{ id: 'dict-0', bookId: DICTIONARY, root: 'عمل', rootDisplay: 'ع م ل', pageIndex: 1, volume: 1, printPage: 1 }],
    cards: [card('marker', MARKER_BLOCK), card('far', CARD_BLOCK)],
    marks: READ_MARKS.map(read),
  };
  await within(60_000, 'seeding the controls rows', page.evaluate(async (rows) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('shamela-reader');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('seed: opening the database was blocked'));
    });
    for (const [store, list] of Object.entries(rows)) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        for (const row of list) tx.objectStore(store).put(row);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error(`seed: the ${store} transaction was aborted`));
      });
    }
    db.close();
  }, rows));
}

/** The settings row as stored (one row, key 'app'), or null before the first write. */
async function storedSettings(page) {
  return within(30_000, 'reading the settings row', page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('shamela-reader');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('settings').objectStore('settings').get('app');
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }));
}

/** The card panel's width, or null with no panel; and whether the edge tab shows. */
async function panelState(page) {
  return page.evaluate(() => {
    const aside = document.querySelector('aside');
    return {
      aside: aside ? Math.round(aside.getBoundingClientRect().width) : null,
      edgeTab: document.querySelector('button[aria-label="Show cards"]') !== null,
    };
  });
}

/** Whether a block's paragraph carries the flash (bg-amber-100/70). */
async function flashed(page, index) {
  return page.evaluate(
    (id) => document.querySelector(`[data-block-id="${id}"]`)?.classList.contains('bg-amber-100/70') ?? null,
    blockId(index),
  );
}

/**
 * The block at the middle of the screen below the header, and whether it is
 * `index`. Judged this way, and not by how far the block's middle is from
 * the screen's, because a centred jump lands one header height below the
 * screen's middle today (the virtualizer centres in the screen and adds its
 * scrollPaddingStart; settleOn tests against the screen's middle: FOUND_ISSUES
 * 40). A jump off by one block puts another block there; a fix of 40 would not.
 */
async function atMiddle(page, index) {
  return page.evaluate((target) => {
    const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
    const middle = (headerBottom + window.innerHeight) / 2;
    let found = null;
    for (const element of document.querySelectorAll('[data-block-id]')) {
      const rect = element.getBoundingClientRect();
      if (rect.top <= middle && rect.bottom > middle) {
        found = { block: Number(element.getAttribute('data-block-id').split(':').pop()), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
      }
    }
    return { ...found, middle: Math.round(middle), ok: found?.block === target };
  }, index);
}

/** The jump to ج/ص page `printed`, as the header's Go does it. */
async function jumpToPrinted(page, printed) {
  await page.getByLabel('Printed page').fill(String(printed));
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await settle(page, 900);
}

/**
 * One scenario in a fresh context: the app booted, the book and the controls
 * rows seeded, the book opened at its top. A scenario that throws is one
 * failure, named, and the run goes on to the next.
 */
async function scenario(browser, base, profile, title, run) {
  const label = `${profile.short}: ${title}`;
  console.log(`  -- ${title}`);
  step(`${label}: opening a context`);
  const context = await within(60_000, `${label}: opening a context`, browser.newContext(profile.options));
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => console.log(`  pageerror: ${error.message}`));
    step(`${label}: loading the app`);
    await page.goto(base);
    await within(30_000, `${label}: marking onboarding done`, page.evaluate(() => {
      localStorage.setItem('shamela-reader.onboarded', '1');
      localStorage.setItem('shamela-reader.catalogOffered', '1');
    }));
    await page.waitForFunction(() => document.body.innerText.length > 0);
    step(`${label}: seeding`);
    await seed(page);
    await seedControls(page);
    step(`${label}: opening the book`);
    await page.goto(`${base}#/read/${encodeURIComponent(BOOK)}`);
    await page.reload();
    await page.locator(`[data-block-id="${blockId(0)}"]`).waitFor();
    await settle(page);
    step(label);
    await run(page, context);
  } catch (error) {
    check(`${title}: the scenario ran to its end`, false, String(error?.message ?? error).split('\n')[0]);
  } finally {
    step(`${label}: closing the context`);
    await within(60_000, `${label}: closing the context`, context.close());
  }
}

/** The header's ↑ ↓ between read marks: the counter, then each jump centres its mark. */
async function readMarkJumps(page) {
  const counter = (await page.getByTitle('Passages marked to read').innerText()).trim();
  check('the read-mark counter says 3', counter === '3', `counter "${counter}"`);
  const next = page.getByTitle('Next passage marked to read');
  const previous = page.getByTitle('Previous passage marked to read');

  // From the top of the book, ↓ goes to the first mark.
  await next.click();
  await settle(page, 900);
  const first = await atMiddle(page, READ_MARKS[0]);
  check(`↓ from the top brings the first read mark (block ${READ_MARKS[0]}) to the middle`, first.ok, JSON.stringify(first));

  // From past the last mark, ↑ twice goes to the last and then the middle one.
  await jumpToPrinted(page, PAST_READ_MARKS);
  await previous.click();
  await settle(page, 900);
  const last = await atMiddle(page, READ_MARKS[2]);
  check(`↑ from past the marks brings the last (block ${READ_MARKS[2]}) to the middle`, last.ok, JSON.stringify(last));
  await previous.click();
  await settle(page, 900);
  const middle = await atMiddle(page, READ_MARKS[1]);
  check(`  and ↑ again the one before it (block ${READ_MARKS[1]})`, middle.ok, JSON.stringify(middle));

  // ↓ from a mark that ↑ centred: reported, not judged. ReadMarkNav finds
  // "next" from the block at the top of the screen, and a centred mark is not
  // at the top, so this can land on the same mark again (FOUND_ISSUES 39).
  await next.click();
  await settle(page, 900);
  const landed = (await atMiddle(page, READ_MARKS[2])).block ?? null;
  console.log(`  report: ${JSON.stringify({ readMarkDown: { from: READ_MARKS[1], next: READ_MARKS[2], atMiddle: landed } })}`);
}

/** Double-tap a word: the dictionary sheet opens and the selection is gone. */
async function doubleTap(page) {
  const point = await page.evaluate(({ id, word }) => {
    const element = document.querySelector(`[data-block-id="${id}"]`);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const at = walker.currentNode.textContent.indexOf(word);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(walker.currentNode, at);
      range.setEnd(walker.currentNode, at + word.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  }, { id: blockId(DOUBLE_TAP_BLOCK), word: DOUBLE_TAP_WORD });
  if (!point) throw new Error(`"${DOUBLE_TAP_WORD}" is not on screen in block ${DOUBLE_TAP_BLOCK}`);
  await page.mouse.dblclick(point.x, point.y);
  const sheet = page.locator('[role="dialog"]', { hasText: 'Dictionary' });
  const opened = await sheet.waitFor({ timeout: 5000 }).then(() => true, () => false);
  const heading = opened ? (await sheet.locator('[lang="ar"]').first().innerText()).trim() : null;
  check('double-tap on a word opens the dictionary sheet', opened, `heading ${JSON.stringify(heading)}`);
  await settle(page, 300);
  const selection = await page.evaluate(() => ({
    collapsed: window.getSelection()?.isCollapsed ?? true,
    rail: document.querySelector('[role="toolbar"]') !== null,
  }));
  check('  and leaves no selection behind (no rail)', selection.collapsed && !selection.rail, JSON.stringify(selection));
}

async function landscapeControls(browser, base, profile) {
  await scenario(browser, base, profile, 'Ctrl+\\ toggles the card panel', async (page) => {
    const before = await panelState(page);
    await page.keyboard.press('Control+Backslash');
    await settle(page, 400);
    const hidden = await panelState(page);
    const storedHidden = (await storedSettings(page))?.panelCollapsed ?? null;
    check(
      'Ctrl+\\ hides the panel and leaves the edge tab, and the setting is stored',
      before.aside !== null && hidden.aside === null && hidden.edgeTab && storedHidden === true,
      `panel ${before.aside} → ${hidden.aside}, edge tab ${hidden.edgeTab}, stored panelCollapsed ${storedHidden}`,
    );
    await page.keyboard.press('Control+Backslash');
    await settle(page, 400);
    const shown = await panelState(page);
    const storedShown = (await storedSettings(page))?.panelCollapsed ?? null;
    check(
      '  and again brings it back at its width, stored',
      hidden.aside === null && shown.aside === before.aside && !shown.edgeTab && storedShown === false,
      `panel ${shown.aside}, edge tab ${shown.edgeTab}, stored panelCollapsed ${storedShown}`,
    );
  });

  await scenario(browser, base, profile, 'Hide cards and the edge tab', async (page) => {
    const before = await panelState(page);
    await page.getByRole('button', { name: 'Hide cards', exact: true }).tap();
    await settle(page, 400);
    const hidden = await panelState(page);
    const label = await page.locator('header').getByRole('button', { name: /^(Show|Hide) cards$/ }).innerText();
    check(
      'Hide cards hides the panel, leaves the edge tab, and the button says Show cards',
      before.aside !== null && hidden.aside === null && hidden.edgeTab && label.trim() === 'Show cards',
      `panel ${before.aside} → ${hidden.aside}, edge tab ${hidden.edgeTab}, button "${label.trim()}"`,
    );
    // Tapped only if it is there, so a panel that never hid fails here too.
    if (hidden.edgeTab) await page.locator('button[aria-label="Show cards"]').tap();
    await settle(page, 400);
    const shown = await panelState(page);
    check(
      '  and the edge tab brings it back at the width it had',
      hidden.edgeTab && shown.aside === before.aside && !shown.edgeTab,
      `panel ${shown.aside}, edge tab ${shown.edgeTab}`,
    );
  });

  await scenario(browser, base, profile, 'a margin marker opens its card in the panel', async (page) => {
    await jumpToPrinted(page, pageOf(MARKER_BLOCK));
    await page.locator(`[data-index="${MARKER_BLOCK}"] button[aria-label="Open translation"]`).tap();
    await settle(page, 300);
    const state = await page.evaluate(() => {
      const card = document.querySelector('aside [data-card-id="card-marker"] article');
      return { inPanel: card !== null, active: card?.classList.contains('border-accent') ?? false, popover: document.querySelector('[role="dialog"]') !== null };
    });
    const flashOn = await flashed(page, MARKER_BLOCK);
    check('tapping a marker makes its card the active one in the panel, no popover', state.inPanel && state.active && !state.popover, JSON.stringify(state));
    await page.waitForTimeout(2000);
    const flashOff = await flashed(page, MARKER_BLOCK);
    check('  and flashes its block, cleared after 1.6 s', flashOn === true && flashOff === false, `flash ${flashOn} → ${flashOff}`);
  });

  await scenario(browser, base, profile, 'a card in the panel brings its text to the middle', async (page) => {
    await page.locator('aside').getByRole('button', { name: 'All', exact: true }).tap();
    const card = page.locator(`aside [data-card-id="card-far"] article`);
    await card.waitFor();
    await card.locator('p[lang="ar"]').tap();
    await settle(page, 900);
    const found = await placement(page, CARD_BLOCK);
    const middle = found && (found.top + found.bottom) / 2;
    const visibleMiddle = found && (found.headerBottom + found.viewport) / 2;
    const active = await card.evaluate((element) => element.classList.contains('border-accent'));
    check(
      `tapping a card brings its block (${CARD_BLOCK}) to the middle of the screen, the card active`,
      found !== null && Math.abs(middle - visibleMiddle) < found.viewport * 0.2 && active,
      `${JSON.stringify(found)}, active ${active}`,
    );
    check('  and flashes the block', (await flashed(page, CARD_BLOCK)) === true);
  });

  await scenario(browser, base, profile, 'the read-mark ↑ ↓', readMarkJumps);
  await scenario(browser, base, profile, 'double-tap opens the dictionary', doubleTap);

  await scenario(browser, base, profile, 'the reading position is restored once', async (page) => {
    await jumpToPrinted(page, pageOf(700));
    await page.waitForTimeout(1300); // saved 900ms after scrolling stops
    await page.reload();
    await page.locator('header').waitFor();
    await page.waitForFunction(() => window.scrollY > 1000, null, { timeout: 10_000 }).catch(() => {});
    await settle(page, 900);
    const restored = await topBlock(page);
    // Then a jump elsewhere, and long enough for the position to be saved and
    // for any second restore to have pulled the page back.
    await jumpToPrinted(page, 20);
    const jumped = await topBlock(page);
    await page.waitForTimeout(2500);
    const later = await topBlock(page);
    check(
      'after the restore, a jump elsewhere stays where it landed',
      Math.abs(restored - 700) <= 1 && jumped === firstBlockOfPage(20) && later === jumped,
      `restored ${restored}, jumped to ${jumped}, 2.5 s later ${later}`,
    );
  });

  // The pointer drag is the one scenario that writes the panel's width; it
  // runs last of the judged ones (the plan's 5b), then the finger's report.
  await scenario(browser, base, profile, 'the divider, dragged with a mouse', async (page) => {
    const divider = page.getByRole('separator', { name: 'Resize card panel' });
    const drag = async (to) => {
      const box = await divider.boundingBox();
      const from = { x: box.x + box.width / 2, y: box.y + 200 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      const during = await page.evaluate(() => document.body.style.userSelect);
      await page.mouse.move(to, from.y, { steps: 8 });
      await page.mouse.up();
      await settle(page, 400);
      const after = await page.evaluate(() => document.body.style.userSelect);
      return { from: Math.round(from.x), to, during, after, ...(await panelState(page)), stored: (await storedSettings(page))?.panelWidth ?? null };
    };
    const width = await page.evaluate(() => window.innerWidth);
    const start = (await panelState(page)).aside;
    // 120 px to the right: narrower by the drag. (To the left first, as the
    // plan put it, cannot widen it here: 960 px is already at the clamp's
    // ceiling, 45% of the screen, 432 px.)
    const narrower = await drag(Math.round((await divider.boundingBox()).x + 3 + 120));
    check(
      'dragging the divider 120 px right narrows the panel to the pointer, and stores that width',
      narrower.aside === width - narrower.to && Math.abs(start - narrower.aside - 120) <= 6 && narrower.stored === narrower.aside,
      `panel ${start} → ${narrower.aside} (pointer at ${narrower.to}), stored ${narrower.stored}`,
    );
    // Far to the left: held at the clamp's ceiling, in the panel and in the setting.
    const wider = await drag(200);
    check(
      '  dragged far left it stops at the clamp (45% of the screen), and stores the clamped width',
      wider.aside === Math.floor(width * 0.45) && wider.stored === wider.aside,
      `panel ${wider.aside}, stored ${wider.stored}`,
    );
    check(
      '  and text selection is off during each drag and back on after',
      narrower.during === 'none' && wider.during === 'none' && narrower.after === '' && wider.after === '',
      `during ${JSON.stringify([narrower.during, wider.during])}, after ${JSON.stringify([narrower.after, wider.after])}`,
    );
  });

  // Reported, not judged (Phase 5 plan, Design §1.2): what Chromium's touch
  // emulation does with the divider today. The divider has no touch-action
  // and its window listeners ignore pointercancel (FOUND_ISSUES 27), so a
  // finger drag may be taken by the browser; a mouse move afterwards shows
  // whether the drag was left switched on. Only the tablet can say what a
  // real finger does (the plan's M, item 3). Every later step must print the
  // same line.
  await scenario(browser, base, profile, 'the divider, dragged with a finger (reported)', async (page, context) => {
    const divider = page.getByRole('separator', { name: 'Resize card panel' });
    const box = await divider.boundingBox();
    const from = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 200) };
    const before = (await panelState(page)).aside;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + 15 * i, y: from.y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(page, 400);
    const after = await panelState(page);
    const userSelect = await page.evaluate(() => document.body.style.userSelect);
    const stored = (await storedSettings(page))?.panelWidth ?? null;
    // A plain mouse move over the text, no button held.
    await page.mouse.move(700, 300);
    await page.mouse.move(720, 320);
    await settle(page, 400);
    const afterStrayMove = (await panelState(page)).aside;
    console.log(`  report: ${JSON.stringify({ fingerDrag: { from: from.x, to: from.x + 120, before, after: after.aside, userSelect, storedWidth: stored, afterStrayMouseMove: afterStrayMove } })}`);
  });
}

async function portraitControls(browser, base, profile) {
  await scenario(browser, base, profile, 'the cards sheet opens and closes', async (page) => {
    await page.evaluate(() => window.scrollTo(0, 5000));
    await settle(page);
    const scrolled = await page.evaluate(() => Math.round(window.scrollY));
    await page.getByRole('button', { name: /^▲ Cards/ }).tap();
    await settle(page, 400);
    const open = await page.evaluate(() => {
      const sheet = document.querySelector('div.sticky.bottom-0 > div');
      return {
        height: sheet ? Math.round(sheet.getBoundingClientRect().height) : null,
        bottom: sheet ? Math.round(sheet.getBoundingClientRect().bottom) : null,
        scrollY: Math.round(window.scrollY),
        viewport: window.innerHeight,
      };
    });
    check(
      'the handle opens a sheet 55% of the screen tall at its bottom, and the page does not scroll',
      open.height === Math.round(open.viewport * 0.55) && Math.abs(open.bottom - open.viewport) <= 1 && open.scrollY === scrolled,
      `${JSON.stringify(open)}, scrollY before ${scrolled}`,
    );
    // Tapped only if the sheet opened, so a handle that does nothing fails here too.
    const hide = page.getByRole('button', { name: '▼ Hide cards' });
    if ((await hide.count()) === 1) await hide.tap();
    await settle(page, 400);
    const closed = await page.evaluate(() => ({
      sheet: document.querySelector('div.sticky.bottom-0 > div') !== null,
      scrollY: Math.round(window.scrollY),
    }));
    const handle = await page.getByRole('button', { name: /^▲ Cards/ }).count();
    check(
      '  and tapped again closes it, the page still where it was',
      open.height !== null && !closed.sheet && handle === 1 && closed.scrollY === scrolled,
      `${JSON.stringify(closed)}, handle ${handle}`,
    );
  });

  await scenario(browser, base, profile, 'a margin marker opens a popover', async (page) => {
    await jumpToPrinted(page, pageOf(MARKER_BLOCK));
    await page.locator(`[data-index="${MARKER_BLOCK}"] button[aria-label="Open translation"]`).tap();
    const popover = page.locator('[role="dialog"]', { hasText: `Paragraph ${MARKER_BLOCK}: a placeholder translation` });
    const opened = await popover.waitFor({ timeout: 5000 }).then(() => true, () => false);
    const title = opened ? (await popover.locator('.text-\\[11px\\].font-medium').first().innerText()).trim() : null;
    check('tapping a marker opens its card in a popover', opened && title === 'Translation', `title ${JSON.stringify(title)}`);
  });

  await scenario(browser, base, profile, 'the read-mark ↑ ↓', readMarkJumps);
  await scenario(browser, base, profile, 'double-tap opens the dictionary', doubleTap);
}

const own = process.env.VERIFY_URL
  ? null
  : await preview({ preview: { port: 4175, strictPort: false }, logLevel: 'warn' });
const base = process.env.VERIFY_URL ?? own.resolvedUrls.local[0];
const shots = process.env.SCREENSHOT_DIR;

const browser = await chromium.launch();
try {
  await runProfile(
    browser, base, 'Touch tablet, landscape 960×600',
    { viewport: { width: 960, height: 600 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    'beside', shots && `${shots}/landscape-960x600-selection.png`,
  );
  await runProfile(
    browser, base, 'Touch tablet, portrait 600×960',
    { viewport: { width: 600, height: 960 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    'sheet', shots && `${shots}/portrait-600x960-selection.png`,
  );
  if (!process.env.REPORT_ONLY) {
    console.log('\n=== The reader\'s controls, landscape 960×600 (each in a fresh context) ===');
    await landscapeControls(browser, base, {
      short: 'landscape',
      options: { viewport: { width: 960, height: 600 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    });
    console.log('\n=== The reader\'s controls, portrait 600×960 (each in a fresh context) ===');
    await portraitControls(browser, base, {
      short: 'portrait',
      options: { viewport: { width: 600, height: 960 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    });
  }
} finally {
  step('closing the browser');
  await within(60_000, 'closing the browser', browser.close());
  step('closing the preview server');
  await within(60_000, 'closing the preview server', own ? own.close() : Promise.resolve());
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
