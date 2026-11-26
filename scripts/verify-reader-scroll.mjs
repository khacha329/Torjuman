// The reader with the page as its scroller, checked in a real browser.
//
//   npm run verify:reader     (builds first; or VERIFY_URL=… node scripts/verify-reader-scroll.mjs)
//   VERIFY_ONLY=<text> node scripts/verify-reader-scroll.mjs   (only the controls scenarios
//                             whose title contains <text>, against the last build)
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
//     bringing its block to the middle; the read-mark ↑ ↓ and ↓ in turn
//     (FOUND_ISSUES 39); read marks near the ends of the book reached
//     (FOUND_ISSUES 52); a centred jump at the middle below the header,
//     settled in a few passes (FOUND_ISSUES 40); double-tap opening the
//     dictionary; the restored position applied once; a second book opened
//     by its URL at its own position (FOUND_ISSUES 31); an open popover's
//     outside-tap listener kept while the page scrolls (FOUND_ISSUES 34); a
//     popover that fits on neither side of its anchor (FOUND_ISSUES 47); an
//     open popover following its anchor moved without a scroll (FOUND_ISSUES
//     49); the divider dragged with a mouse; a divider drag ended by pointercancel
//     (FOUND_ISSUES 27); the margin menu's outside-tap listener kept while
//     the reader renders (FOUND_ISSUES 48); a second pointer during a divider
//     drag (FOUND_ISSUES 50); leaving the reader mid-drag (FOUND_ISSUES
//     51); the divider dragged with a finger (its width reported, its end
//     judged)
//   - portrait: the cards sheet's handle; the handle's count of every card
//     kind (FOUND_ISSUES 28); a marker opening a popover; the read-mark ↑ ↓
//     and ↓ in turn (FOUND_ISSUES 39); read marks near the ends, and one
//     under the open cards sheet (FOUND_ISSUES 52); the centred jump
//     (FOUND_ISSUES 40);
//     double-tap
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
      // The verse is put high on the screen and the popover's content waited
      // for, so the popover is measured at its final size and fits below the
      // verse both before and after the 60 px scroll. Before FOUND_ISSUES 37
      // was fixed it kept the place chosen for its short loading state, which
      // this check then measured; once it places itself again as it grows,
      // a verse lower down could find it clamped above (top 12) before the
      // scroll and below after it, depending on whether the translation had
      // arrived — a race in the check, not a fault in following the anchor.
      await verse.scrollIntoViewIfNeeded();
      await page.evaluate(({ id, y }) => {
        const element = document.querySelector(`[data-block-id="${id}"] [data-entity-id]`);
        window.scrollBy(0, element.getBoundingClientRect().top - y);
      }, { id: blockId(VERSE_BLOCK), y: POPOVER_ANCHOR_Y });
      await settle(page, 300);
      await verse.click();
      const close = page.getByRole('button', { name: 'Close', exact: true });
      await close.waitFor({ timeout: 5000 });
      await page.locator('[role="dialog"]').getByText('(bundled)').waitFor({ timeout: 10_000 });
      await settle(page, 300);
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
// nothing asserted the behaviour of the divider, Ctrl+\, Hide cards, the
// sheet's handle, a marker or card tap, the read-mark ↑ ↓, double-tap or the
// restore's guard (check U pictures some of those states, but judges no
// behaviour).
//
// Every scenario opens its own context and seeds the book afresh, so the
// existing checks and the performance report above run on exactly the page
// they always did (cards and marks would add marker and band nodes and move
// the DOM-node count), and a scenario that fails leaves nothing behind for
// the next. The extra rows are synthetic, like the book.

/** Two translation cards: one for the marker scenarios, one far down for the card tap. */
const MARKER_BLOCK = 300;
const CARD_BLOCK = 1000;
/** A block given a note by the one scenario that counts the sheet handle's cards. */
const NOTE_BLOCK = 200;
/** Where the verse is put before its popover is opened to follow a scroll: high enough that the popover fits below it. */
const POPOVER_ANCHOR_Y = 120;
/** A centred jump's tolerance, and the most jump writes it may take to settle in each layout (FOUND_ISSUES 40). */
const CENTRED_TOLERANCE_PX = 4;
const CENTRED_MAX_JUMPS_LANDSCAPE = 2;
const CENTRED_MAX_JUMPS_PORTRAIT = 4;
/** The verse's place, and the small scrolls, for the outside-tap listener check: the verse stays on screen. */
const LISTENER_ANCHOR_Y = 450;
/** Where the verse sits, and how far it is moved, for the popover that follows it (FOUND_ISSUES 49). */
const MOVED_ANCHOR_Y = 150;
const MOVED_ANCHOR_PX = 40;
/**
 * Where the verse sits for a popover that fits on neither side of it
 * (FOUND_ISSUES 47): at 960×600 the verse's middle is then at the middle of
 * the screen, with about 257 px of room above it and below it, and the grown
 * Qurʾān popover is taller (297 px in the container, 274 on the owner's PC).
 */
const SQUEEZED_ANCHOR_Y = 277;
const LISTENER_SCROLL_STEPS = 8;
const LISTENER_SCROLL_PX = 35;
/** How long the bundled translation is held back, and where the verse sits, for the growing popover. */
const GROWTH_DELAY_MS = 2500;
const LOW_ANCHOR_Y = 380;
/** A second book, opened by a hash change from the first, and its saved position. */
const SECOND_BOOK = 'shamela-515153';
const SECOND_BLOCKS = 400;
const SECOND_POSITION = 300;
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
  await putRows(page, 'seeding the controls rows', rows);
}

/** Write synthetic rows ({ store: [row, …] }) straight into the app's database. */
async function putRows(page, label, rows) {
  await within(60_000, label, page.evaluate(async (rows) => {
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
 * `index`: a jump off by one block puts another block there. A centred jump
 * lands its block's middle on that point (FOUND_ISSUES 40, fixed in lane A;
 * before, it landed half a header lower), and `centredJump` judges how close
 * it lands; this judges only which block is there.
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

/**
 * A centred jump (FOUND_ISSUES 40): the read-mark ↓ from the top of the book
 * centres the first mark. Its block's middle must land within a few px of the
 * middle of the area below the header — the place `atMiddle` judges — and the
 * jump must settle in a few passes. They are counted as the jump writes the
 * page gets from the tap until a second after it: the `window.scrollTo` calls
 * that carry a `behavior`, which are the virtualizer's scrollToIndex and
 * scrollToOffset (one per settleOn pass) and its reconciling pass; its
 * adjustments for blocks measured for the first time pass no behavior and
 * are not counted. Before the fix every centred jump ran all eight of
 * settleOn's passes: 8 writes in landscape, 10 in portrait.
 *
 * The bound is per layout (`maxJumps`), from what the fix measured. Landscape
 * takes 2: the first pass lands a few px off, from estimated heights next to
 * the target, and the second on it. Portrait takes 4: three passes and one
 * reconciling re-write of the same offset. Its taller visible area holds a
 * block between the header and the target that is first measured after the
 * second pass and shrinks about 55 px; the virtualizer compensates only for
 * blocks above the top of the window, so the target moves and needs a third
 * pass.
 */
async function centredJump(page, maxJumps) {
  await page.evaluate(() => {
    window.__jumps = 0;
    const scrollTo = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      const options = args[0];
      if (options && typeof options === 'object' && options.behavior !== undefined) window.__jumps++;
      return scrollTo(...args);
    };
  });
  await page.getByTitle('Next passage marked to read').click();
  await settle(page, 1000);
  const jumps = await page.evaluate(() => window.__jumps);
  // The virtual item, margins and all — what settleOn centres.
  const found = await page.evaluate((index) => {
    const element = document.querySelector(`[data-index="${index}"]`);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, headerBottom: document.querySelector('header').getBoundingClientRect().bottom, viewport: window.innerHeight };
  }, READ_MARKS[0]);
  const middle = found && Math.round((found.top + found.bottom) / 2);
  const visibleMiddle = found && Math.round((found.headerBottom + found.viewport) / 2);
  const off = found ? middle - visibleMiddle : null;
  check(
    `a centred jump (↓ to block ${READ_MARKS[0]}) puts its block's middle at the middle of the area below the header`,
    off !== null && Math.abs(off) <= CENTRED_TOLERANCE_PX,
    `block middle ${middle}, middle below the header ${visibleMiddle}, off by ${off}`,
  );
  check(
    `  and settles in at most ${maxJumps} jump writes`,
    jumps <= maxJumps,
    `${jumps} jump writes`,
  );
}

/**
 * ↓ ↓ ↓ from the top of the book visits the three read marks in order
 * (FOUND_ISSUES 39). ReadMarkNav used to find "next" from the block at the
 * top of the screen; a mark it had just centred sits below that block, so the
 * second ↓ found the same mark and the page stayed where it was. It now
 * counts from the block at the middle of the area below the header, where a
 * centred jump lands.
 */
async function readMarkSequence(page) {
  const next = page.getByTitle('Next passage marked to read');
  const visited = [];
  for (let step = 0; step < READ_MARKS.length; step++) {
    await next.click();
    await settle(page, 900);
    visited.push((await atMiddle(page, READ_MARKS[step])).block ?? null);
  }
  const disabled = await next.isDisabled();
  check(
    `↓ ↓ ↓ from the top visits the read marks in order (${READ_MARKS.join(', ')}), and ↓ is then off`,
    visited.join() === READ_MARKS.join() && disabled,
    `at the middle after each ↓: ${visited.join(', ')}; ↓ disabled after: ${disabled}`,
  );
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
  // VERIFY_ONLY=<text> runs just the scenarios whose title contains it (and
  // skips the two profile runs above): for trying one scenario against a
  // build while working on it. Without it, everything runs. A filter is named
  // in the result line, and one that runs no check fails the run, so a value
  // left in a shell cannot pass the gate with nothing checked.
  if (ONLY && !title.includes(ONLY)) return;
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

  // ↓ from a mark that ↑ centred: reported. Until FOUND_ISSUES 39 was fixed
  // ReadMarkNav found "next" from the block at the top of the screen, and a
  // centred mark is below it, so this landed on the same mark again (450);
  // it now goes on to 500. `readMarkSequence` judges ↓ in turn from the top.
  await next.click();
  await settle(page, 900);
  const landed = (await atMiddle(page, READ_MARKS[2])).block ?? null;
  console.log(`  report: ${JSON.stringify({ readMarkDown: { from: READ_MARKS[1], next: READ_MARKS[2], atMiddle: landed } })}`);
}

/** Read marks too near either end of the book to be centred (FOUND_ISSUES 52). */
const EDGE_READ_MARKS = [1, BLOCKS - 1];

/**
 * A read mark that cannot be centred counts as reached once it is wholly on
 * screen (FOUND_ISSUES 52, the owner's decision of 2026-11-26). Two more
 * marks are seeded, one near the top of the book and one near its end. At the
 * top, block 1's mark is on screen, so ↓ goes past it to the first of the
 * others; ↑ from there jumps to block 1 (centred as far as the top of the
 * page allows) and is then off. Past the middle marks, ↓ jumps to the mark
 * near the end (clamped at the bottom in portrait; whether the page reached
 * its bottom is reported) and is then off. On the old code
 * ↓ at the top offered block 1 and did not move, and after each clamped jump
 * the arrow still offered the same mark.
 */
async function readMarkEdges(page) {
  const read = (index) => ({
    id: `mark-read-${index}`, bookId: BOOK, startBlockId: blockId(index), startOffset: 0,
    endBlockId: blockId(index), endOffset: textOf(index).length, kind: 'read', scope: 'block',
    note: null, createdAt: 1 + index, collapsed: false,
  });
  await putRows(page, 'seeding the edge read marks', { marks: EDGE_READ_MARKS.map(read) });
  await page.reload();
  await page.locator(`[data-block-id="${blockId(0)}"]`).waitFor();
  await settle(page);
  const next = page.getByTitle('Next passage marked to read');
  const previous = page.getByTitle('Previous passage marked to read');
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  const whollyShown = (index) => page.evaluate((id) => {
    const rect = document.querySelector(`[data-block-id="${id}"]`)?.getBoundingClientRect();
    const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
    return rect ? rect.top >= headerBottom - 1 && rect.bottom <= window.innerHeight + 1 : false;
  }, blockId(index));

  const atTop = { scrollY: await scrollY(), previousOff: await previous.isDisabled() };
  await next.click();
  await settle(page, 900);
  const first = await atMiddle(page, READ_MARKS[0]);
  check(
    `at the top, ↓ goes past the read mark on screen (block ${EDGE_READ_MARKS[0]}) to block ${READ_MARKS[0]}`,
    atTop.scrollY === 0 && atTop.previousOff && first.ok,
    `at the top: scrollY ${atTop.scrollY}, ↑ off ${atTop.previousOff}; after ↓: ${JSON.stringify(first)}`,
  );
  await previous.click();
  await settle(page, 900);
  const back = { shown: await whollyShown(EDGE_READ_MARKS[0]), scrollY: await scrollY(), previousOff: await previous.isDisabled(), nextOn: !(await next.isDisabled()) };
  check(
    `  ↑ from there brings block ${EDGE_READ_MARKS[0]} wholly on screen near the top, and is then off`,
    back.shown && back.scrollY < 200 && back.previousOff && back.nextOn,
    JSON.stringify(back),
  );

  // Past the middle marks, ↓ goes to the one near the end.
  await jumpToPrinted(page, PAST_READ_MARKS);
  const pastOn = !(await next.isDisabled());
  if (pastOn) await next.click();
  await settle(page, 900);
  const end = {
    shown: await whollyShown(EDGE_READ_MARKS[1]),
    atBottom: await page.evaluate(() => Math.round(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2),
    nextOff: await next.isDisabled(),
    previousOn: !(await previous.isDisabled()),
  };
  check(
    `near the end, ↓ jumps to the last mark (block ${EDGE_READ_MARKS[1]}), wholly shown, and is then off`,
    pastOn && end.shown && end.nextOff && end.previousOn,
    `↓ on past the middle marks ${pastOn}; after: ${JSON.stringify(end)}`,
  );
}

/**
 * A read mark under the portrait cards sheet is not on screen (FOUND_ISSUES
 * 52): with the sheet open, the first read mark is put wholly inside the
 * window but under the sheet, below the middle block, and ↓ must bring it to
 * the middle. Counted as on screen, as the first version of 52's fix did by
 * measuring to the bottom of the window, ↓ went past it to the next mark.
 */
async function readMarkUnderSheet(page) {
  await page.getByRole('button', { name: /^▲ Cards/ }).tap();
  await settle(page, 400);
  const sheetTop = await page.evaluate(() => Math.round(document.querySelector('div.sticky.bottom-0').getBoundingClientRect().top));
  await jumpToPrinted(page, pageOf(READ_MARKS[0]));
  // The mark's block under the sheet, wholly inside the window and below the
  // middle of the area under the header (where ↓ counts from): its top 80 px
  // below that middle.
  await page.evaluate(({ id }) => {
    const middle = (document.querySelector('header').getBoundingClientRect().bottom + window.innerHeight) / 2;
    const rect = document.querySelector(`[data-block-id="${id}"]`).getBoundingClientRect();
    window.scrollBy(0, rect.top - (middle + 80));
  }, { id: blockId(READ_MARKS[0]) });
  await settle(page, 500);
  const under = await page.evaluate(({ id, sheetTop }) => {
    const rect = document.querySelector(`[data-block-id="${id}"]`).getBoundingClientRect();
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), sheetTop, viewport: window.innerHeight };
  }, { id: blockId(READ_MARKS[0]), sheetTop });
  await page.getByTitle('Next passage marked to read').click();
  await settle(page, 900);
  const landed = await atMiddle(page, READ_MARKS[0]);
  check(
    `with the cards sheet open, ↓ goes to a read mark under the sheet (block ${READ_MARKS[0]})`,
    under.top > under.sheetTop && under.bottom <= under.viewport && under.top > landed.middle && landed.ok,
    `under the sheet before: ${JSON.stringify(under)}; after ↓: ${JSON.stringify(landed)}`,
  );
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

/** The block whose margin is long-pressed to open the margin menu. */
const MARGIN_MENU_BLOCK = 1;

/**
 * Count the document's pointerdown registrations from here on, in
 * `window.__pointerdownAdds`: an outside-tap listener removed and added back
 * shows as one more registration.
 */
async function countPointerdownAdds(page) {
  await page.evaluate(() => {
    window.__pointerdownAdds = 0;
    const add = document.addEventListener.bind(document);
    document.addEventListener = (type, listener, options) => {
      if (type === 'pointerdown') window.__pointerdownAdds++;
      return add(type, listener, options);
    };
  });
}

/**
 * A finger's long press on a block's margin, through CDP touch events, so it
 * comes as the tablet's would: touchstart, held past the 480 ms the margin
 * waits, touchend. The margin menu opens.
 */
async function longPressMargin(page, context, index) {
  const target = page.locator(`[data-index="${index}"] [role="button"][aria-label$="skip"]`);
  const box = await target.boundingBox();
  if (!box) throw new Error(`block ${index}'s margin is not on screen`);
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + Math.min(20, box.height / 2)) };
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page, 300);
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
  await scenario(browser, base, profile, 'the read-mark ↓ in turn from the top', readMarkSequence);
  await scenario(browser, base, profile, 'read marks near the ends of the book count as reached', readMarkEdges);
  await scenario(browser, base, profile, 'a centred jump lands at the middle below the header', (page) => centredJump(page, CENTRED_MAX_JUMPS_LANDSCAPE));
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

  // A popover whose content arrives after it opens is placed again at its
  // final size (FOUND_ISSUES 37). The bundled translation is held back, so the
  // Qurʾān popover first places itself in its short loading state, below a
  // verse low on the screen; when the translation arrives it is several times
  // taller and no longer fits below. Nothing renders the reader in between —
  // no scroll, no resize, no tap — so only the popover's own size change can
  // place it again, not the reader re-rendering it.
  await scenario(browser, base, profile, 'a popover is placed again when its content grows', async (page) => {
    let held = 0;
    await page.route('**/quran/english.json', async (route) => {
      held++;
      await new Promise((resolve) => setTimeout(resolve, GROWTH_DELAY_MS));
      await route.continue();
    });
    const verse = page.locator(`[data-block-id="${blockId(VERSE_BLOCK)}"] [data-entity-id]`).first();
    await verse.waitFor({ timeout: 10_000 });
    await page.evaluate(({ id, y }) => {
      const element = document.querySelector(`[data-block-id="${id}"] [data-entity-id]`);
      window.scrollBy(0, element.getBoundingClientRect().top - y);
    }, { id: blockId(VERSE_BLOCK), y: LOW_ANCHOR_Y });
    await settle(page, 500);
    await verse.click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 5000 });
    await settle(page, 300);
    const box = () => page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      const rect = panel.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height), viewport: window.innerHeight };
    });
    const loading = await box();
    await dialog.getByText('(bundled)').waitFor({ timeout: GROWTH_DELAY_MS + 10_000 });
    await settle(page, 500);
    const grown = await box();
    check(
      'a popover that grows after opening is placed again, wholly on screen',
      held === 1 && grown.height > loading.height + 100 && grown.top >= 0 && grown.bottom <= grown.viewport,
      `loading ${JSON.stringify(loading)}, grown ${JSON.stringify(grown)}, translation requests held ${held}`,
    );
  });

  // An open popover follows its anchor when the anchor moves with no scroll,
  // no resize and no change in the popover's size (FOUND_ISSUES 49): layout
  // above it inside the viewport changes. Here the verse's own block gets
  // 40 px of padding above its text, set by hand on the element, so the verse
  // moves down while the block's top, below the header, stays put and the
  // virtualizer has nothing to correct by scrolling. The popover's place is
  // then compared with where a fresh placement puts it — a scroll event
  // dispatched by hand on the document, as a page scroll's is (on the
  // window, the popover's `contains` check would throw on its target), which
  // the popover answers by placing itself again —
  // so the check does not depend on which side it lands. On the old code it
  // stayed where it was until that scroll.
  await scenario(browser, base, profile, 'an open popover follows its anchor when layout moves it without a scroll', async (page) => {
    const verse = page.locator(`[data-block-id="${blockId(VERSE_BLOCK)}"] [data-entity-id]`).first();
    await verse.waitFor({ timeout: 10_000 });
    await page.evaluate(({ id, y }) => {
      const element = document.querySelector(`[data-block-id="${id}"] [data-entity-id]`);
      window.scrollBy(0, element.getBoundingClientRect().top - y);
    }, { id: blockId(VERSE_BLOCK), y: MOVED_ANCHOR_Y });
    await settle(page, 500);
    await verse.click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByText('(bundled)').waitFor({ timeout: 10_000 });
    await settle(page, 500);
    const state = () => page.evaluate((id) => {
      const panel = document.querySelector('[role="dialog"]').getBoundingClientRect();
      const anchor = document.querySelector(`[data-block-id="${id}"] [data-entity-id]`).getBoundingClientRect();
      return { panelTop: Math.round(panel.top), anchorTop: Math.round(anchor.top), anchorBottom: Math.round(anchor.bottom), scrollY: Math.round(window.scrollY) };
    }, blockId(VERSE_BLOCK));
    const before = await state();
    await page.evaluate(({ id, px }) => {
      document.querySelector(`[data-block-id="${id}"]`).style.paddingTop = `${px}px`;
    }, { id: blockId(VERSE_BLOCK), px: MOVED_ANCHOR_PX });
    await settle(page, 300);
    const moved = await state();
    await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
    await settle(page, 300);
    const replaced = await state();
    const detail = `before ${JSON.stringify(before)}, after the padding ${JSON.stringify(moved)}, after a scroll event ${JSON.stringify(replaced)}`;
    check(
      'an open popover is placed again when its anchor moves without a scroll',
      moved.anchorTop - before.anchorTop >= MOVED_ANCHOR_PX - 2 && moved.scrollY === before.scrollY && moved.panelTop !== before.panelTop && moved.panelTop === replaced.panelTop,
      detail,
    );
  });

  // A popover that fits on neither side of its anchor (FOUND_ISSUES 47, the
  // owner's decision of 2026-11-26): it goes on the side with more room, its
  // height capped to that room, its body scrolling, and it never covers the
  // anchor. The verse is put where the grown Qurʾān popover fits neither
  // below nor above it. On the old code the popover was clamped to the top of
  // the screen at its full height, over the verse. SCREENSHOT_DIR, if set,
  // receives a screenshot of it.
  await scenario(browser, base, profile, 'a popover that fits on neither side of its anchor', async (page) => {
    // Only the app's own server: the popover shows the bundled translation
    // and nothing from the network replaces it, so its height is the same on
    // every run (and the screenshot holds only committed text).
    const own = new URL(base).host;
    await page.route('**/*', (route) => (new URL(route.request().url()).host === own ? route.continue() : route.abort()));
    const verse = page.locator(`[data-block-id="${blockId(VERSE_BLOCK)}"] [data-entity-id]`).first();
    await verse.waitFor({ timeout: 10_000 });
    await page.evaluate(({ id, y }) => {
      const element = document.querySelector(`[data-block-id="${id}"] [data-entity-id]`);
      window.scrollBy(0, element.getBoundingClientRect().top - y);
    }, { id: blockId(VERSE_BLOCK), y: SQUEEZED_ANCHOR_Y });
    await settle(page, 500);
    await verse.click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByText('(bundled)').waitFor({ timeout: 10_000 });
    await settle(page, 500);
    const found = await page.evaluate((id) => {
      const panel = document.querySelector('[role="dialog"]');
      const body = panel.querySelector('.panel-body');
      const p = panel.getBoundingClientRect();
      const a = document.querySelector(`[data-block-id="${id}"] [data-entity-id]`).getBoundingClientRect();
      return {
        panel: { top: Math.round(p.top), bottom: Math.round(p.bottom) },
        anchor: { top: Math.round(a.top), bottom: Math.round(a.bottom) },
        body: { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight },
        viewport: window.innerHeight,
      };
    }, blockId(VERSE_BLOCK));
    if (shots) await page.screenshot({ path: `${shots}/landscape-960x600-popover-squeezed.png` });
    const clear = found.panel.bottom <= found.anchor.top || found.panel.top >= found.anchor.bottom;
    const roomBelow = found.viewport - found.anchor.bottom;
    const roomAbove = found.anchor.top;
    const largerSide = roomBelow >= roomAbove ? found.panel.top >= found.anchor.bottom : found.panel.bottom <= found.anchor.top;
    const onScreen = found.panel.top >= 0 && found.panel.bottom <= found.viewport;
    const scrolls = found.body.scrollHeight > found.body.clientHeight;
    check(
      'a popover that fits on neither side of its verse sits on the side with more room, clear of the verse and on screen',
      clear && largerSide && onScreen,
      JSON.stringify(found),
    );
    check(
      '  with its height capped and its body scrolling',
      scrolls,
      `body scrollHeight ${found.body.scrollHeight}, clientHeight ${found.body.clientHeight}`,
    );
  });

  // An open popover keeps its one outside-tap listener while the reader
  // renders under it (FOUND_ISSUES 34). Scrolling changes the top block, and
  // each change renders the reader; its sheets' `onClose`s are inline arrows,
  // new on every render. When AnchoredPanel's effects depended on `onClose`,
  // each render took the document's pointerdown listener away and added it
  // back a tick later, and a tap in that tick was not seen as an outside tap.
  // Counted rather than tapped: the tick is too short to hit on purpose.
  await scenario(browser, base, profile, 'an open popover keeps its outside-tap listener while the page scrolls', async (page) => {
    await page.evaluate(() => {
      window.__pointerdownAdds = 0;
      const add = document.addEventListener.bind(document);
      document.addEventListener = (type, listener, options) => {
        if (type === 'pointerdown') window.__pointerdownAdds++;
        return add(type, listener, options);
      };
    });
    const verse = page.locator(`[data-block-id="${blockId(VERSE_BLOCK)}"] [data-entity-id]`).first();
    await verse.waitFor({ timeout: 10_000 });
    await page.evaluate(({ id, y }) => {
      const element = document.querySelector(`[data-block-id="${id}"] [data-entity-id]`);
      window.scrollBy(0, element.getBoundingClientRect().top - y);
    }, { id: blockId(VERSE_BLOCK), y: LISTENER_ANCHOR_Y });
    await settle(page, 500);
    const addsBeforeOpening = await page.evaluate(() => window.__pointerdownAdds);
    await verse.click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByText('(bundled)').waitFor({ timeout: 10_000 });
    await settle(page, 500);
    const topBefore = await topBlock(page);
    const addsBefore = await page.evaluate(() => window.__pointerdownAdds);
    // The popover's own registration, so a listener never added at all
    // cannot pass as "none re-added".
    const addedOnOpening = addsBefore - addsBeforeOpening;
    for (let step = 0; step < LISTENER_SCROLL_STEPS; step++) {
      await page.evaluate((px) => window.scrollBy(0, px), LISTENER_SCROLL_PX);
      await settle(page, 150);
    }
    const topAfter = await topBlock(page);
    const added = (await page.evaluate(() => window.__pointerdownAdds)) - addsBefore;
    const open = (await dialog.count()) === 1;
    check(
      'an open popover does not re-register its outside-tap listener as the reader renders',
      open && topAfter !== topBefore && addedOnOpening >= 1 && added === 0,
      `top block ${topBefore} → ${topAfter}, pointerdown listeners added on opening ${addedOnOpening}, while scrolling ${added}, still open ${open}`,
    );
    // Then a tap on the text, clear of the popover and of its verse, must
    // close it: an outside tap still works after the scrolls. This does not
    // catch 34's fault — the old code's gap was one tick after each render,
    // and a tap here lands well after it (on the old code it closes too); the
    // registration count above is the guard. No other R or S scenario taps
    // outside an open popover.
    const target = await page.evaluate((anchorId) => {
      const panel = document.querySelector('[role="dialog"]').getBoundingClientRect();
      const anchor = document.querySelector(`[data-block-id="${anchorId}"] [data-entity-id]`)?.getBoundingClientRect();
      const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
      const away = (x, y, r) => !r || x < r.left - 20 || x > r.right + 20 || y < r.top - 20 || y > r.bottom + 20;
      // A point on a block's plain text, 20 px clear of the popover and the
      // verse, and not on any entity (a tap there would open another sheet,
      // not be a plain outside tap).
      for (let y = Math.ceil(headerBottom) + 20; y < window.innerHeight - 10; y += 10) {
        for (let x = 20; x < window.innerWidth; x += 20) {
          if (!away(x, y, panel) || !away(x, y, anchor)) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit?.closest('[data-entity-id]')) continue;
          const block = hit?.closest('[data-block-id]');
          if (block && block.getAttribute('data-block-id') !== anchorId) {
            return { x, y, block: block.getAttribute('data-block-id') };
          }
        }
      }
      return null;
    }, blockId(VERSE_BLOCK));
    if (target) await page.touchscreen.tap(target.x, target.y);
    await settle(page, 400);
    const closed = (await dialog.count()) === 0;
    check(
      '  and a tap on the text outside it then closes it',
      target !== null && closed,
      `tapped ${target ? `${target.block} at ${target.x},${target.y}` : 'nothing (no block clear of the popover)'}, closed ${closed}`,
    );
  });

  // The margin menu keeps its one outside-tap listener while the reader
  // renders under it (FOUND_ISSUES 48), as an open popover does (34 above).
  // Its `onClose` is an inline arrow in ReaderSheets, new on every reader
  // render; while the menu's effect depended on it, each render took the
  // document's pointerdown listener away and added it back a tick later, and
  // a tap in that tick was not seen as an outside tap. The page is scrolled
  // to change the top block, which renders the reader. Counted, as in 34's
  // scenario: the tick is too short to hit on purpose.
  await scenario(browser, base, profile, 'the margin menu keeps its outside-tap listener while the reader renders', async (page, context) => {
    await countPointerdownAdds(page);
    await longPressMargin(page, context, MARGIN_MENU_BLOCK);
    const menu = page.locator('[role="menu"]');
    const opened = (await menu.count()) === 1;
    const addedOnOpening = await page.evaluate(() => window.__pointerdownAdds);
    const topBefore = await topBlock(page);
    for (let step = 0; step < LISTENER_SCROLL_STEPS; step++) {
      await page.evaluate((px) => window.scrollBy(0, px), LISTENER_SCROLL_PX);
      await settle(page, 150);
    }
    const topAfter = await topBlock(page);
    const added = (await page.evaluate(() => window.__pointerdownAdds)) - addedOnOpening;
    const stillOpen = (await menu.count()) === 1;
    check(
      'a long press on the margin opens the margin menu, which does not re-register its outside-tap listener as the reader renders',
      opened && stillOpen && topAfter !== topBefore && addedOnOpening >= 1 && added === 0,
      `opened ${opened}, top block ${topBefore} → ${topAfter}, pointerdown listeners added on opening ${addedOnOpening}, while scrolling ${added}, still open ${stillOpen}`,
    );
    // A tap on the text, clear of the menu, closes it.
    const box = await menu.boundingBox();
    const tap = { x: box && box.x > 480 ? 160 : 700, y: 400 };
    await page.touchscreen.tap(tap.x, tap.y);
    await settle(page, 300);
    const closed = (await menu.count()) === 0;
    check('  and a tap on the text outside it then closes it', opened && closed, `tapped ${tap.x},${tap.y}, closed ${closed}`);
  });

  // A hash change straight from one book to another (FOUND_ISSUES 31): the
  // second book opens at its own saved position, not at the top. Reachable
  // only by editing the URL — the Library is otherwise between two books —
  // but a reader screen reused across books also restored nothing and could
  // save the first book's place under the second's id.
  await scenario(browser, base, profile, 'a second book opened by its URL restores its own position', async (page) => {
    const id = (index) => `${SECOND_BOOK}:p${Math.floor(index / PER_PAGE) + 1}:${index}`;
    const pages = Math.ceil(SECOND_BLOCKS / PER_PAGE);
    await putRows(page, 'seeding the second book', {
      books: [{
        id: SECOND_BOOK, shamelaId: 515153, title: 'كتاب ثان', author: '', publisher: '', edition: '',
        volumeCount: 1, category: '', structureProfile: 'generic', importedAt: 2, importStatus: 'complete',
        totalPages: pages, fetchedPages: pages, volumeStarts: [1], hadithCollection: null,
      }],
      pages: Array.from({ length: pages }, (_, i) => ({
        id: `${SECOND_BOOK}:p${i + 1}`, bookId: SECOND_BOOK, pageIndex: i + 1, volume: 1, printPage: i + 1, rawHtml: '', fetchedAt: 1,
      })),
      blocks: Array.from({ length: SECOND_BLOCKS }, (_, i) => ({
        id: id(i), bookId: SECOND_BOOK, pageId: `${SECOND_BOOK}:p${Math.floor(i / PER_PAGE) + 1}`, order: i, type: 'body',
        text: textOf(i), normalized: textOf(i), contentHash: `s${i}`, hadithNumber: null, tocNodeId: null, spans: [], anchor: null,
      })),
      positions: [{ bookId: SECOND_BOOK, blockOrder: SECOND_POSITION, updatedAt: 1 }],
    });
    await page.evaluate((book) => { location.hash = `#/read/${encodeURIComponent(book)}`; }, SECOND_BOOK);
    await page.locator(`[data-block-id^="${SECOND_BOOK}:"]`).first().waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => window.scrollY > 1000, null, { timeout: 10_000 }).catch(() => {});
    await settle(page, 900);
    const top = await topBlock(page);
    const firstBookLeft = await page.locator(`[data-block-id^="${BOOK}:"]`).count();
    check(
      'a hash change to another book opens it at its own saved position',
      top !== null && Math.abs(top - SECOND_POSITION) <= 1 && firstBookLeft === 0,
      `top block ${top}, saved ${SECOND_POSITION}, first book's blocks still mounted ${firstBookLeft}`,
    );
  });

  // The divider drags are the scenarios that write the panel's width; they
  // run last (the plan's 5b): the mouse drag, the drag ended by a
  // pointercancel, then the finger's.
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

  // A drag that ends in pointercancel (FOUND_ISSUES 27) — what a browser sends
  // when it takes a finger drag for itself. The cancel is dispatched on the
  // window by hand, so it comes at a known point of the drag on every run: it
  // must stop the drag where it got to, store that width, and turn text
  // selection back on, and the moves after it must not resize the panel.
  // Until the drag ends nothing is stored: every pointermove used to write the
  // whole settings row.
  await scenario(browser, base, profile, 'a divider drag that ends in pointercancel', async (page) => {
    const divider = page.getByRole('separator', { name: 'Resize card panel' });
    const box = await divider.boundingBox();
    const from = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 200) };
    const start = (await panelState(page)).aside;
    const storedAtStart = (await storedSettings(page))?.panelWidth ?? null;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y, { steps: 4 });
    await settle(page, 300);
    const during = { aside: (await panelState(page)).aside, stored: (await storedSettings(page))?.panelWidth ?? null };
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
    await settle(page, 300);
    const cancelled = {
      aside: (await panelState(page)).aside,
      stored: (await storedSettings(page))?.panelWidth ?? null,
      userSelect: await page.evaluate(() => document.body.style.userSelect),
    };
    // The button is still down in Playwright's mouse: these are moves of a
    // pointer the page has been told is cancelled.
    await page.mouse.move(from.x + 120, from.y, { steps: 4 });
    await settle(page, 300);
    const afterMoves = (await panelState(page)).aside;
    await page.mouse.up();
    await settle(page, 300);
    const detail = `panel ${start} → ${during.aside} during, ${cancelled.aside} at the cancel, ${afterMoves} after more moves; stored ${storedAtStart} → ${during.stored} during, ${cancelled.stored} at the cancel; user-select ${JSON.stringify(cancelled.userSelect)}`;
    check(
      'a divider drag stores its width only when it ends',
      during.aside < start && during.stored === storedAtStart,
      detail,
    );
    check(
      '  a pointercancel ends it where it got to: the width stored, text selection back on',
      cancelled.aside === during.aside && cancelled.stored === during.aside && cancelled.userSelect === '',
      detail,
    );
    check(
      '  and moves after the cancel leave the panel alone',
      afterMoves === cancelled.aside,
      detail,
    );
  });

  // A divider drag belongs to the pointer that started it (FOUND_ISSUES 50).
  // While the mouse drags the divider, a second pointer's events arrive —
  // dispatched by hand, so they come at known points of the drag on every
  // run: a pointerdown on the divider, a pointermove far to the left, and a
  // pointerup. None may move the panel or end the drag; the mouse's own
  // moves then still resize it, and its release stores the width. On the old
  // code the second pointer's move resized the panel to where it was and its
  // pointerup ended the drag.
  await scenario(browser, base, profile, 'a second pointer during a divider drag', async (page) => {
    const divider = page.getByRole('separator', { name: 'Resize card panel' });
    const box = await divider.boundingBox();
    const from = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 200) };
    const start = (await panelState(page)).aside;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y, { steps: 4 });
    await settle(page, 200);
    const during = (await panelState(page)).aside;
    const other = (type, clientX) => page.evaluate(({ type, clientX, y }) => {
      const event = new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: false, clientX, clientY: y, bubbles: true });
      const target = type === 'pointerdown' ? document.querySelector('[role="separator"]') : window;
      target.dispatchEvent(event);
    }, { type, clientX, y: from.y });
    await other('pointerdown', from.x);
    await other('pointermove', 200);
    await settle(page, 200);
    const afterOtherMove = (await panelState(page)).aside;
    await other('pointerup', 200);
    await settle(page, 200);
    const afterOtherUp = {
      aside: (await panelState(page)).aside,
      userSelect: await page.evaluate(() => document.body.style.userSelect),
    };
    await page.mouse.move(from.x + 100, from.y, { steps: 4 });
    await settle(page, 200);
    const afterMouseMove = (await panelState(page)).aside;
    await page.mouse.up();
    await settle(page, 300);
    const released = {
      aside: (await panelState(page)).aside,
      stored: (await storedSettings(page))?.panelWidth ?? null,
      userSelect: await page.evaluate(() => document.body.style.userSelect),
    };
    const detail = `panel ${start} → ${during} in the drag, ${afterOtherMove} after the other pointer's move, ${afterOtherUp.aside} after its pointerup (user-select ${JSON.stringify(afterOtherUp.userSelect)}), ${afterMouseMove} after the mouse moved on, ${released.aside} released; stored ${released.stored}, user-select ${JSON.stringify(released.userSelect)}`;
    check(
      "a second pointer's move and release during a divider drag neither move the panel nor end the drag",
      during < start && afterOtherMove === during && afterOtherUp.aside === during && afterOtherUp.userSelect === 'none',
      detail,
    );
    check(
      '  and the dragging pointer then still resizes it, and its release stores the width',
      afterMouseMove < during && released.aside === afterMouseMove && released.stored === released.aside && released.userSelect === '',
      detail,
    );
  });

  // Leaving the reader in the middle of a divider drag (FOUND_ISSUES 51):
  // the drag starts with the mouse, and with the button still down the hash
  // changes to the Library, which unmounts the reader. Text selection must be
  // back on on the next screen, and the width the drag reached stored. On
  // the old code `user-select` stayed "none" until a reload, and the width
  // was lost.
  await scenario(browser, base, profile, 'leaving the reader in the middle of a divider drag', async (page) => {
    const divider = page.getByRole('separator', { name: 'Resize card panel' });
    const box = await divider.boundingBox();
    const from = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 200) };
    const start = (await panelState(page)).aside;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y, { steps: 4 });
    await settle(page, 200);
    const during = {
      aside: (await panelState(page)).aside,
      userSelect: await page.evaluate(() => document.body.style.userSelect),
    };
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForFunction(() => document.querySelector('[data-block-id]') === null, null, { timeout: 10_000 });
    await settle(page, 400);
    const left = {
      userSelect: await page.evaluate(() => document.body.style.userSelect),
      stored: (await storedSettings(page))?.panelWidth ?? null,
    };
    await page.mouse.up();
    const detail = `panel ${start} → ${during.aside} in the drag (user-select ${JSON.stringify(during.userSelect)}); after leaving, user-select ${JSON.stringify(left.userSelect)}, stored width ${left.stored}`;
    check(
      'leaving the reader mid-drag turns text selection back on',
      during.userSelect === 'none' && left.userSelect === '',
      detail,
    );
    check(
      '  and stores the width the drag reached',
      during.aside < start && left.stored === during.aside,
      detail,
    );
  });

  // Reported (Phase 5 plan, Design §1.2): what Chromium's touch emulation
  // does with the divider. Until FOUND_ISSUES 27 was fixed the divider had no
  // touch-action and its window listeners ignored pointercancel, so the
  // browser took the drag part way and left it switched on: the report read
  // after 405, userSelect "none", and a stray mouse move resized the panel to
  // 300. Now the line shows what the fixed divider does, and its tail is
  // judged below. Only the tablet can say what a real finger does (the plan's
  // M, item 3).
  await scenario(browser, base, profile, 'the divider, dragged with a finger', async (page, context) => {
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
    // Judged since FOUND_ISSUES 27 was fixed: however far the finger got, the
    // drag is over once it ends — selection back on, and a stray mouse move
    // does not resize the panel. How far a real finger gets is the tablet's
    // to say.
    check(
      'after a finger drag on the divider, text selection is back on and a stray mouse move leaves the panel alone',
      userSelect === '' && afterStrayMove === after.aside,
      `user-select ${JSON.stringify(userSelect)}, panel ${after.aside} → ${afterStrayMove} after the stray move`,
    );
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

  // The handle counts every card kind the sheet lists (FOUND_ISSUES 28), as
  // the landscape edge tab does: the controls seed has two translation cards,
  // and one note is added here, so a handle counting translations alone says 2.
  await scenario(browser, base, profile, 'the sheet handle counts notes too', async (page) => {
    await putRows(page, 'seeding a note', {
      marks: [{
        id: 'mark-note', bookId: BOOK, startBlockId: blockId(NOTE_BLOCK), startOffset: 0,
        endBlockId: blockId(NOTE_BLOCK), endOffset: textOf(NOTE_BLOCK).length, kind: 'skip', scope: 'block',
        note: 'A placeholder note, not from a real book.', createdAt: 1 + NOTE_BLOCK, collapsed: false,
      }],
    });
    await page.reload();
    await page.locator(`[data-block-id="${blockId(0)}"]`).waitFor();
    await settle(page);
    const handle = page.getByRole('button', { name: /^▲ Cards/ });
    const text = (await handle.count()) === 1 ? (await handle.innerText()).trim() : null;
    check('the sheet handle counts translations and notes alike', text === '▲ Cards (3)', `handle ${JSON.stringify(text)}`);
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
  await scenario(browser, base, profile, 'the read-mark ↓ in turn from the top', readMarkSequence);
  await scenario(browser, base, profile, 'read marks near the ends of the book count as reached', readMarkEdges);
  await scenario(browser, base, profile, 'a read mark under the open cards sheet is not on screen', readMarkUnderSheet);
  await scenario(browser, base, profile, 'a centred jump lands at the middle below the header', (page) => centredJump(page, CENTRED_MAX_JUMPS_PORTRAIT));
  await scenario(browser, base, profile, 'double-tap opens the dictionary', doubleTap);
}

const ONLY = process.env.VERIFY_ONLY ?? '';

const own = process.env.VERIFY_URL
  ? null
  : await preview({ preview: { port: 4175, strictPort: false }, logLevel: 'warn' });
const base = process.env.VERIFY_URL ?? own.resolvedUrls.local[0];
const shots = process.env.SCREENSHOT_DIR;

const browser = await chromium.launch();
try {
  if (!ONLY) await runProfile(
    browser, base, 'Touch tablet, landscape 960×600',
    { viewport: { width: 960, height: 600 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    'beside', shots && `${shots}/landscape-960x600-selection.png`,
  );
  if (!ONLY) await runProfile(
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

const passed = failures === 0 && checks > 0;
const filter = ONLY ? ` (only scenarios matching ${JSON.stringify(ONLY)})` : '';
console.log(`\n${passed ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed${filter}\n`);
process.exit(passed ? 0 : 1);
