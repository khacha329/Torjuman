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
  await page.evaluate(
    async ({ book, count, perPage, texts, toc }) => {
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
  );
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
  const context = await browser.newContext(options);
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

  await page.goto(base);
  await page.evaluate(() => {
    localStorage.setItem('shamela-reader.onboarded', '1');
    localStorage.setItem('shamela-reader.catalogOffered', '1');
  });
  await page.waitForFunction(() => document.body.innerText.length > 0);
  await seed(page);
  await page.goto(`${base}#/read/${encodeURIComponent(BOOK)}`);
  await page.reload();
  await page.locator(`[data-block-id="${blockId(0)}"]`).waitFor();
  await settle(page);

  // REPORT_ONLY measures and nothing else, so the same numbers can be taken
  // from a build where the reader still scrolls in a box of its own.
  if (!process.env.REPORT_ONLY) await runChecks(page, layout);
  await reportScrolling(page);
  if (screenshot) await screenshotSelection(page, screenshot);
  await context.close();
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
} finally {
  await browser.close();
  await own?.close();
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
