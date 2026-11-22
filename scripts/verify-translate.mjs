// Check P: the translate pipeline, through the real reader, recorded.
//
//   npm run verify:translate                 compare with docs/refactor/phase5/translate.json
//   npm run verify:translate -- --write      write the record (Phase 5 step 5c, on the old code)
//   npm run verify:translate -- --out <file> write this run's record elsewhere, compare nothing
//   (or VERIFY_URL=… node scripts/verify-translate.mjs, against a running build)
//
// Why it exists. Phase 5 (docs/refactor/plans/phase5-big-ui-files.md, Design
// §1.4 and §7) moves the reader's parts out of ReaderScreen and the pure steps
// of `translate` out of useTranslator.ts. Check Q pins what each provider
// sends for a request built by hand; it never runs the hook, so nothing else
// sees how the reader builds that request, which cards it stores, what it
// says on screen, or in what order it does each step. This records all of
// that, on the old code first, and every later step must reproduce it.
//
// How. The production build, served by `vite preview`, in Chromium at
// 960×600 touch (the tablet's landscape, where the card panel sits beside the
// text). Every scenario is reached through the reader's own controls: a
// selection made the way the native handles make one (setBaseAndExtent, as
// check S does) and the rail's Translate; the card's Retranslate menu; the
// verse sheet's "Translate the surrounding passage"; a long press on the
// matn's margin, "Translate all…" and the proposal's Start. The book is
// synthetic: twelve blocks — a verse (Ibrāhīm 2, read from the committed
// muṣḥaf, as check U does), a numbered matn, two sharḥ blocks and the next
// numbered matn, the rest test sentences — with a Qurʾān and a ḥadīth entity
// written beside them (the book row's nameIndexSize 0 keeps them, as in U).
//
//   * generativelanguage.googleapis.com and api.anthropic.com are answered
//     from canned responses copied from Q's (Gemini: an SSE stream of `data:`
//     lines, an HTTP error with Gemini's error JSON, a connection drop;
//     Anthropic: a Messages event stream — the strict emit_translation tool,
//     and a research turn with a web search, with non-zero cache-read and
//     cache-write usage). A Claude group is needed beside the Gemini ones:
//     GeminiProvider never reads allowExternalLookup and its cost is always
//     null, so only Claude's requests and session line show the request's
//     flag, the cost sum and the per-provider count. Each request is HELD until the
//     scenario answers it, so the in-flight state (the loading card, the
//     rail's busy button, the batch's "Translating 2 of 3…") is recorded at a
//     fixed point rather than raced. A request with no answer by the end of
//     its scenario, or one that arrives where none is expected, is a failure.
//   * Every other off-origin request is aborted, so retrieval (quran.com,
//     sunnah.com, dorar) fails the same way on every run; the proxy's
//     same-origin paths are aborted too, as in U. No real network.
//   * Fake keys only, each under services/secrets.ts' localStorage name: a
//     Gemini key (`AIza-p-check-…`) and a sunnah.com key (`p-check-sunnah-…`,
//     which `translate` hands to enrichSegments) in the main group, an
//     Anthropic key (`sk-ant-p-check-…`) in the Claude group, none in the
//     no-key and on-device groups.
//
// A seventh group, "how a Gemini reply ends", was added with the change that
// names every finishReason, stops asking Gemini to echo the Arabic and keeps
// the whole segments of a reply that stops part-way: RECITATION and the retry
// in two halves, a stream cut mid-segment with no finish reason (the partial
// card and its "Translate the rest"), "[ {" with no finish reason (the
// interrupted card and its Retry), and a named stop (OTHER). Its replies use
// the new shape, piece numbers read from the request they answer
// (`piecesSent`). The other groups' canned answers still echo `arabic`, which
// the parser still reads, so their cards are the cards they were.
//
// Recorded per scenario: every request to the model host (method, URL, every
// header Chromium sends (allHeaders), and the body, parsed only when re-serializing it
// gives back the same text, otherwise the text itself); the `cards` store's
// rows afterwards, in key order, exactly as IndexedDB holds them; and what the
// screen says — the bars above the text (the no-key banner, the translator's
// notice, the batch proposal and progress), the panel's session line
// (CardPanel's stats), each card's text in the panel, and the rail's
// Translate button when it is up. Some scenarios also record a state while a
// request is held.
//
// Pinned, so two runs are the same: Date.now (page.clock, fixed: newId's
// time part and every createdAt; one instant per page load, a minute after
// the previous load's, so ids made after a reload cannot repeat older ones),
// Math.random (a seeded generator installed before the app's scripts, as D
// does: newId's suffix), the browser's time zone (UTC) and locale (en-US),
// service workers (blocked), the viewport.
//
// Masked, each keeping its header's name so a header that disappears still
// shows: x-goog-api-key's and x-api-key's values, replaced by a placeholder
// once each is asserted to be its host's fake key, so the record itself can be
// asserted to hold no key; the SDK's four platform headers (x-stainless-os,
// -arch, -runtime, -runtime-version), exactly as Q masks them; the three
// headers Chromium fills from the machine (user-agent, sec-ch-ua,
// sec-ch-ua-platform: the OS and the browser build), which would differ on
// the owner's PC; and the
// preview server's origin in origin and referer (its port is the first free
// one). Nothing else: no id, no timestamp, no card field. (The plan allowed
// newId ids and timestamps to be masked if two runs differed; they did not.)
//
// Asserted on every run (a failure exits 1 even with --write): each model key
// is in its own header (x-goog-api-key, x-api-key) of every request to its own
// host and nowhere else; the sunnah.com key only in a request to sunnah.com;
// no key in any request's URL or body or another header (allHeaders), in any
// IndexedDB store, sessionStorage, a cookie, Cache Storage's names, the DOM,
// the page's URL, history.state, window.name, the console or page errors, or
// this record; in localStorage only as the value of its own entry; no request
// carries an Authorization header. A model request that arrives after its
// scenario's end check fails that scenario, not the next.
//
// Not covered, said here as the plan asks: Claude's error paths and retries
// in the browser (the Claude group translates twice, both succeeding; Q pins
// what AnthropicProvider sends and maps for every error); the on-device
// model's real translation (`runOffline` needs a downloaded model — the
// `offline` scenarios record only its failures: the model's download refused,
// which OfflineProvider maps itself, and the bundled English refused, a plain
// Error, the one route found to `translate`'s non-TranslationError mapping);
// `addGlossaryTerm` (a window.prompt); the portrait sheet (S and R cover how
// the reader opens it after a translation). And four things in the three
// updaters Phase 5 step 5i3 moved, which no scenario can show, so 5i3's reviewer checked them
// by reading: the offline branch's stats updater (`withOfflineRequest`,
// useTranslator.ts:67-76 — both offline scenarios fail before it, and
// translateProse always loads the model); the streaming entry's removal in
// `finally` (`withoutStream`, translationSteps.ts:152-159 — the streaming
// text renders only while a card is loading, and a fulfilled response
// arrives at once); SessionStats.cacheWriteTokens (useTranslator.ts:91 —
// summed, and read nowhere in src/ui); and the cost sum's accumulation in
// the cloud stats updater (`previous.costUsd +`, `withCloudRequest`,
// useTranslator.ts:78-93 — every Claude session line comes from one
// translation after a fresh load, so a sum that dropped the previous total
// would show the same figure). These were lines 263-270, 356-360, 330 and
// 322-331 of useTranslator.ts when this check was written (Phase 5 step 5c).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const started = Date.now();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORD_PATH = join(ROOT, 'docs/refactor/phase5/translate.json');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const outFlag = args.indexOf('--out');
const OUT = outFlag >= 0 ? resolve(args[outFlag + 1] ?? '') : null;
if (outFlag >= 0 && !args[outFlag + 1]) {
  console.log('--out needs a file name');
  process.exit(2);
}

// The same watchdog and limits as check R (Phase 5 plan, the amendment to
// Q2): every setup and teardown wait has a limit of its own, and a watchdog
// bounds everything else and names the step a stall was in. A stall is a
// failure, never a pass.
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
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

const harnessFailures = [];
const harnessFail = (where, what) => harnessFailures.push(`${where}: ${what}`);

// ------------------------------------------------------------------ fixed inputs

const FIXED_NOW = Date.UTC(2026, 10, 17, 9, 0, 0);
const RANDOM_SEED = 0x5eed_7a11;
const VIEWPORT = { width: 960, height: 600 };
/**
 * The fake keys, each under services/secrets.ts' localStorage name. A model
 * key may appear in its own header of a request to its own host and nowhere
 * else; the sunnah.com key only in a request to sunnah.com (directly or
 * through the proxy's /sunnah/ route), never in a model request or a card.
 */
const KEYS = {
  gemini: { entry: 'shamela-reader.gemini-api-key', value: 'AIza-p-check-not-a-real-key', header: 'x-goog-api-key', host: 'generativelanguage.googleapis.com' },
  anthropic: { entry: 'shamela-reader.anthropic-api-key', value: 'sk-ant-p-check-not-a-real-key', header: 'x-api-key', host: 'api.anthropic.com' },
  sunnah: { entry: 'shamela-reader.sunnah-api-key', value: 'p-check-sunnah-not-a-real-key', header: null, host: null },
};
const FAKE_VALUES = Object.values(KEYS).map((key) => key.value);
const KEY_ENTRIES = new Set(Object.values(KEYS).map((key) => key.entry));
const KEY_HEADERS = new Map([[KEYS.gemini.header, KEYS.gemini], [KEYS.anthropic.header, KEYS.anthropic]]);
const isSunnahUrl = (url) => /^https:\/\/api\.sunnah\.com\//.test(url) || /\/sunnah\//.test(new URL(url).pathname);
const KEY_MASK = '(the fake key: asserted here, and nowhere else)';
const MACHINE_MASK = '(the machine and browser build, masked)';
const MACHINE_HEADERS = new Set(['user-agent', 'sec-ch-ua', 'sec-ch-ua-platform']);
// The SDK's platform headers, masked exactly as check Q masks them
// (scripts/verify-requests.ts, MASKED_HEADERS and MASK).
const PLATFORM_MASK = '(platform, masked)';
const PLATFORM_HEADERS = new Set(['x-stainless-os', 'x-stainless-arch', 'x-stainless-runtime', 'x-stainless-runtime-version']);
const ORIGIN_MASK = '(the preview server)';
const MODEL_HOSTS = new Set([KEYS.gemini.host, KEYS.anthropic.host]);
/** Copied from src/translation/models.ts (an .mjs cannot import TypeScript), never written by hand. */
const CLAUDE_MODEL = /export const CLAUDE_SONNET_5_5 = '([^']+)';/.exec(
  readFileSync(join(ROOT, 'src/translation/models.ts'), 'utf8'),
)[1];
const DB_VERSION = Number(/export const DB_VERSION = (\d+);/.exec(
  readFileSync(join(ROOT, 'src/platform/storage/idbSchema.ts'), 'utf8'),
)[1]);

const BOOK = 'shamela-616161';
const PER_PAGE = 4;
/** Ibrāhīm 2 from the committed muṣḥaf: U's verse (its sheet has tabs to show). */
const VERSE = (() => {
  const { counts, ayat } = JSON.parse(readFileSync(join(ROOT, 'public/quran/uthmani.json'), 'utf8'));
  return ayat[counts.slice(0, 13).reduce((sum, count) => sum + count, 0) + 1];
})();
const HADITH_QUOTE = '«هذا متن حديث تجريبي لفحص الترجمة، وليس من كتاب حقيقي»';
/** Synthetic, written for this check: the repository is public. */
const TEXTS = [
  'الفقرة الأولى: هذا نص تجريبي لفحص الترجمة، وليس من كتاب حقيقي.',
  VERSE,
  'الفقرة الثالثة: وفيه بيان لما سبق من القول، وليس من كتاب حقيقي.',
  'الفقرة الرابعة: نص آخر للتجربة يرد عليه خطأ مصطنع من الخادم.',
  `عن أبي هريرة رضي الله عنه قال: ${HADITH_QUOTE}.`,
  'شرح تجريبي أول: هذا شرح لفحص الترجمة، وليس من كتاب حقيقي.',
  'شرح تجريبي ثان: وفيه بيان لما سبق، وليس من كتاب حقيقي.',
  'هذا متن ثان تجريبي، وليس من كتاب حقيقي.',
  'الفقرة التاسعة: نص للتجربة يرفضه الخادم لأن المفتاح لا يصلح.',
  'الفقرة العاشرة: نص للتجربة يقطع جوابه قبل تمامه.',
  'الفقرة الحادية عشرة: نص للتجربة لا يصل طلبه إلى الخادم.',
  'الفقرة الثانية عشرة: آخر نص في هذا الكتاب التجريبي.',
];
const TYPES = ['body', 'body', 'body', 'body', 'hadith_matn', 'sharh', 'sharh', 'hadith_matn', 'body', 'body', 'body', 'body'];
const HADITH_NUMBERS = { 4: '1', 7: '2' };
const blockId = (index) => `${BOOK}:p${Math.floor(index / PER_PAGE) + 1}:${index}`;

function bookRows({ profiles = [], settings = {} } = {}) {
  const at = FIXED_NOW - 86_400_000;
  const pages = Math.ceil(TEXTS.length / PER_PAGE);
  const hadithAt = TEXTS[4].indexOf(HADITH_QUOTE);
  const entity = (key, type, index, start, end, extra) => ({
    id: `entity-${key}`, bookId: BOOK, startBlockId: blockId(index), startOffset: start,
    endBlockId: blockId(index), endOffset: end, type, matchQuality: 'exact', detectedAt: at, ...extra,
  });
  return {
    rows: {
      books: [{
        id: BOOK, shamelaId: 616161, title: 'كتاب فحص الترجمة', author: 'مؤلف تجريبي', publisher: '', edition: '',
        volumeCount: 1, category: '', structureProfile: 'generic', importedAt: at, importStatus: 'complete',
        totalPages: pages, fetchedPages: pages, volumeStarts: [1], hadithCollection: null, role: 'reading',
        nameIndexSize: 0,
      }],
      pages: Array.from({ length: pages }, (_, i) => ({
        id: `${BOOK}:p${i + 1}`, bookId: BOOK, pageIndex: i + 1, volume: 1, printPage: i + 1, rawHtml: '', fetchedAt: at,
      })),
      tocNodes: [{ id: `${BOOK}:toc0`, bookId: BOOK, parentId: null, title: 'الباب الأول', pageIndex: 1, order: 0, depth: 0 }],
      blocks: TEXTS.map((text, i) => ({
        id: blockId(i), bookId: BOOK, pageId: `${BOOK}:p${Math.floor(i / PER_PAGE) + 1}`, order: i, type: TYPES[i],
        text, normalized: text, contentHash: `h${i}`, hadithNumber: HADITH_NUMBERS[i] ?? null, tocNodeId: null,
        spans: [], anchor: null,
      })),
      entities: [
        entity('quran', 'quran', 1, 0, VERSE.length, { reference: '14:2', label: 'إبراهيم 2', textUthmani: VERSE }),
        entity('hadith', 'hadith', 4, hadithAt, hadithAt + HADITH_QUOTE.length, { reference: 'riyadussalihin:1' }),
      ],
      profiles,
    },
    // panelScope 'all' so the panel shows every card in book order, whatever
    // is scrolled into view: the record must not depend on where the page sits.
    settings: { panelScope: 'all', ...settings },
  };
}

// ------------------------------------------------------------------ canned responses

/** Q's Gemini stream: one `data:` line per chunk, the usage cumulative. */
function geminiStream(chunks) {
  const body = chunks
    .map((chunk) => {
      const candidate = { content: { parts: chunk.text === undefined ? [] : [{ text: chunk.text }], role: 'model' } };
      if (chunk.finishReason) candidate.finishReason = chunk.finishReason;
      const payload = { candidates: [candidate] };
      if (chunk.usage) {
        payload.usageMetadata = {
          promptTokenCount: chunk.usage.prompt,
          candidatesTokenCount: chunk.usage.candidates,
          ...(chunk.usage.cached !== undefined ? { cachedContentTokenCount: chunk.usage.cached } : {}),
          totalTokenCount: chunk.usage.prompt + chunk.usage.candidates,
        };
      }
      return `data: ${JSON.stringify(payload)}\r\n\r\n`;
    })
    .join('');
  return { status: 200, headers: { 'content-type': 'text/event-stream' }, body };
}
/** A complete answer: the segments' JSON in two chunks, then STOP. */
function answer(segments, { prompt = 640, candidates = 120, cached } = {}) {
  const text = JSON.stringify(segments);
  const cut = Math.floor(text.length / 2);
  return geminiStream([
    { text: text.slice(0, cut), usage: { prompt, candidates: Math.floor(candidates / 2) } },
    { text: text.slice(cut), finishReason: 'STOP', usage: { prompt, candidates, ...(cached !== undefined ? { cached } : {}) } },
  ]);
}
function geminiError(status, message, apiStatus) {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: { code: status, message, status: apiStatus } }),
  };
}
const prose = (arabic, english) => ({ type: 'prose', arabic, english });

// Q's Anthropic Messages stream, copied (scripts/verify-requests.ts:
// startBlock, anthropicStream, pieces), the message ids p-prefixed.
let messageCounter = 0;
const messageId = () => `msg_p${String(++messageCounter).padStart(3, '0')}`;
function pieces(text, size) {
  const out = [];
  for (let at = 0; at < text.length; at += size) out.push(text.slice(at, at + size));
  return out;
}
function startBlock(block) {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: '', citations: null };
    case 'tool_use':
    case 'server_tool_use':
      return { type: block.type, id: block.id, name: block.name, input: {} };
    case 'web_search_tool_result':
      return block.block ?? {};
  }
  throw new Error(`startBlock: ${block.type}`);
}
function anthropicStream({ model, blocks, stop, usage }) {
  const events = [{
    type: 'message_start',
    message: {
      id: messageId(), type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: usage.input, output_tokens: 1, cache_read_input_tokens: usage.cacheRead, cache_creation_input_tokens: usage.cacheWrite },
    },
  }];
  blocks.forEach((block, index) => {
    events.push({ type: 'content_block_start', index, content_block: startBlock(block) });
    for (const delta of block.deltas ?? []) {
      events.push({
        type: 'content_block_delta',
        index,
        delta: block.type === 'text' ? { type: 'text_delta', text: delta } : { type: 'input_json_delta', partial_json: delta },
      });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: usage.output } });
  events.push({ type: 'message_stop' });
  return {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'request-id': 'req_p_stream' },
    body: events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
  };
}
/** The structure pass's answer: emit_translation's input, streamed as input_json deltas. */
const emitTool = (segments, usage) => anthropicStream({
  model: CLAUDE_MODEL,
  blocks: [{ type: 'tool_use', id: 'toolu_p_emit', name: 'emit_translation', deltas: pieces(JSON.stringify({ segments }), 40) }],
  stop: 'tool_use',
  usage,
});
/** One research turn with a search call and its result (Q's researchTurn). */
const researchTurn = (usage) => anthropicStream({
  model: CLAUDE_MODEL,
  blocks: [
    { type: 'text', deltas: ['Research: ', 'the passage is a test sentence.'] },
    { type: 'server_tool_use', id: 'srvtoolu_p1', name: 'web_search', deltas: ['{"query":', '"test"}'] },
    {
      type: 'web_search_tool_result',
      block: {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_p1',
        content: [{ type: 'web_search_result', url: 'https://example.org/p', title: 'Example', encrypted_content: 'ep', page_age: null }],
      },
    },
  ],
  stop: 'end_turn',
  usage,
});
const DROP = 'drop the connection';

// ------------------------------------------------------------------ the browser

/** A seeded generator in place of Math.random, before any app script (D's mulberry32). */
function installRandom(seed) {
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every store's rows, by raw IndexedDB (never through the storage code under check). */
async function dumpDatabase(page, only = null) {
  return within(30_000, 'reading IndexedDB', page.evaluate(async (only) => {
    const db = await new Promise((ok, fail) => {
      const request = indexedDB.open('shamela-reader');
      request.onsuccess = () => ok(request.result);
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('reading the database was blocked'));
    });
    try {
      const out = {};
      for (const name of only ?? Array.from(db.objectStoreNames)) {
        out[name] = await new Promise((ok, fail) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => ok(request.result);
          request.onerror = () => fail(request.error);
        });
      }
      return out;
    } finally {
      db.close();
    }
  }, only));
}
async function writeRows(page, rows) {
  await within(30_000, 'writing rows', page.evaluate(async (rows) => {
    const db = await new Promise((ok, fail) => {
      const request = indexedDB.open('shamela-reader');
      request.onsuccess = () => ok(request.result);
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('writing: opening the database was blocked'));
    });
    try {
      for (const [store, list] of Object.entries(rows)) {
        if (list.length === 0) continue;
        await new Promise((ok, fail) => {
          const tx = db.transaction(store, 'readwrite');
          for (const row of list) tx.objectStore(store).put(row);
          tx.oncomplete = ok;
          tx.onerror = () => fail(tx.error);
          tx.onabort = () => fail(tx.error ?? new Error(`the ${store} transaction was aborted`));
        });
      }
    } finally {
      db.close();
    }
  }, rows));
}
async function patchSettings(page, patch) {
  await within(30_000, 'patching settings', page.evaluate(async (patch) => {
    const db = await new Promise((ok, fail) => {
      const request = indexedDB.open('shamela-reader');
      request.onsuccess = () => ok(request.result);
      request.onerror = () => fail(request.error);
    });
    try {
      await new Promise((ok, fail) => {
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const request = store.get('app');
        request.onsuccess = () => store.put({ ...(request.result ?? {}), ...patch, key: 'app' });
        tx.oncomplete = ok;
        tx.onerror = () => fail(tx.error);
      });
    } finally {
      db.close();
    }
  }, patch));
}

const cardsOf = async (page) => {
  const { cards } = await dumpDatabase(page, ['cards']);
  return cards.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};
async function untilCards(page, label, predicate) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const cards = await cardsOf(page);
    if (predicate(cards)) return cards;
    if (Date.now() > deadline) throw new Error(`timed out waiting for the cards: ${label}`);
    await sleep(100);
  }
}

/** What the screen says: the bars above the text, the panel, the session line, the rail. */
async function screen(page) {
  return within(15_000, 'reading the screen', page.evaluate(() => {
    const header = document.querySelector('header');
    const root = header?.parentElement;
    const bars = [];
    for (const child of root?.children ?? []) {
      if (child === header) continue;
      // The columns (text, panel), the bottom sheet, and the floating parts.
      if (child.querySelector('[data-block-id]')) continue;
      if (child.matches('[role="toolbar"], [role="dialog"], [role="menu"]')) continue;
      if (child.querySelector('[role="toolbar"], [role="dialog"], [role="menu"]')) continue;
      const text = child.innerText.trim();
      if (text) bars.push(text);
    }
    const panel = Array.from(document.querySelectorAll('[data-card-id]')).map((element) => ({
      id: element.getAttribute('data-card-id'),
      text: element.innerText.trim(),
    }));
    const sessionLabel = Array.from(document.querySelectorAll('span')).find((span) => span.textContent === 'This session');
    const toolbar = document.querySelector('[role="toolbar"][aria-label="Actions for the selected text"]');
    const translate = toolbar && toolbar.style.visibility === 'visible'
      ? Array.from(toolbar.querySelectorAll('button')).find((button) => /^Translat/.test(button.getAttribute('aria-label') ?? ''))
      : null;
    return {
      bars,
      session: sessionLabel ? sessionLabel.parentElement.parentElement.innerText.trim() : null,
      panel,
      rail: translate ? { label: translate.getAttribute('aria-label'), disabled: translate.disabled } : null,
    };
  }));
}
/** The screen once it has stopped changing (cards animate in and out). */
async function settledScreen(page) {
  let last = JSON.stringify(await screen(page));
  const deadline = Date.now() + 15_000;
  for (;;) {
    await sleep(400);
    const now = await screen(page);
    const text = JSON.stringify(now);
    if (text === last) return now;
    if (Date.now() > deadline) throw new Error('the screen did not settle within 15 s');
    last = text;
  }
}

/** Select [from, to) across blocks, as the native handles would (check S's way). */
async function select(page, [fromIndex, fromOffset], [toIndex, toOffset]) {
  await within(15_000, 'selecting', page.evaluate(({ from, fromOffset, to, toOffset }) => {
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
  }, { from: blockId(fromIndex), fromOffset, to: blockId(toIndex), toOffset }));
  await within(10_000, 'the rail appearing', page.waitForFunction(() =>
    document.querySelector('[role="toolbar"][aria-label="Actions for the selected text"]')?.style.visibility === 'visible'));
}
const wholeBlock = (index) => [[index, 0], [index, TEXTS[index].length]];
const railTranslate = (page) =>
  page.getByRole('toolbar', { name: 'Actions for the selected text' }).getByRole('button', { name: 'Translate', exact: true });

async function centre(page, target) {
  await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await sleep(400);
  await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await sleep(300);
}

/**
 * One group of scenarios in a fresh context: the app booted, the book seeded,
 * the key written (or not), the book opened. The model host's requests are
 * held in `pending` until a scenario answers them.
 */
async function group(browser, base, name, { keys = ['gemini'], profile = null } = {}, run) {
  console.log(`\n=== ${name} ===`);
  step(`${name}: opening a context`);
  const context = await within(60_000, `${name}: opening a context`, browser.newContext({
    viewport: VIEWPORT, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block',
  }));
  const origin = new URL(base).origin;
  const allRequests = [];
  const pending = [];
  let received = 0;
  const logs = [];
  context.on('request', (request) => allRequests.push(request));
  const network = { refuseBundledEnglish: false };
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (/^\/(shamela|sunnah|quran-api|dorar)(\/|$)/.test(url.pathname)) return route.abort();
      if (network.refuseBundledEnglish && url.pathname.endsWith('/quran/english.json')) {
        return route.fulfill({ status: 404, body: 'Not found' });
      }
      return route.continue();
    }
    if (MODEL_HOSTS.has(url.hostname)) {
      received++;
      // Tagged with the scenario it arrived in, so a late request fails there
      // rather than being taken by the next scenario as its own.
      pending.push({ route, scenario: activeScenario });
      return undefined; // held until a scenario answers it
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => { logs.push(`pageerror: ${error.message}`); console.log(`  pageerror: ${error.message}`); });
  page.on('console', (message) => logs.push(`${message.type()}: ${message.text()}`));
  // Each page load gets its own fixed instant, a minute after the last. With
  // one instant for every load, newId gave the same ids again after a reload
  // (its counter restarts with the page and Math.random's seed is installed
  // afresh), and a card written after the reload overwrote an older one —
  // found while building this check. On the tablet the clock moves on.
  let loads = 0;
  const nextLoad = () => page.clock.setFixedTime(FIXED_NOW + 60_000 * loads++);
  await nextLoad();
  await page.addInitScript(installRandom, RANDOM_SEED);

  const entries = [];
  let consumed = 0;
  let activeScenario = '(setup)';
  /** The next held request, described; answered with `respond(canned)`. */
  const nextRequest = async (label) => {
    const deadline = Date.now() + 20_000;
    while (pending.length === 0) {
      if (Date.now() > deadline) throw new Error(`no model request arrived: ${label}`);
      await sleep(50);
    }
    consumed++;
    const { route, scenario: arrivedIn } = pending.shift();
    if (arrivedIn !== activeScenario) harnessFail(`${name}: ${arrivedIn}`, `a model request that arrived here (unexpected, or after the end check) was taken by ${activeScenario}`);
    const described = await describeRequest(route.request(), `${name}: ${label}`);
    return {
      described,
      respond: (canned) => (canned === DROP
        ? route.abort('failed')
        : route.fulfill({ status: canned.status, headers: canned.headers, body: canned.body })),
    };
  };
  /** Wait a little and check that no request came that was not asked for. */
  const noRequest = async (label) => {
    await sleep(800);
    if (pending.length > 0) harnessFail(`${name}: ${label}`, `${pending.length} unexpected model request(s)`);

  };
  const scenario = async (id, through, body) => {
    step(`${name}: ${id}`);
    activeScenario = id;
    console.log(`  -- ${id}`);
    const entry = { id, through, requests: [], states: [] };
    const ctx = {
      page,
      request: async (label) => {
        const held = await nextRequest(`${id}: ${label}`);
        entry.requests.push(held.described);
        return held;
      },
      state: async (at) => { entry.states.push({ at, ...(await settledScreen(page)) }); },
      noRequest: (label) => noRequest(`${id}: ${label}`),
    };
    try {
      await body(ctx);
      await noRequest(`${id}: at its end`);
      entry.cards = await cardsOf(page);
      entry.screen = await settledScreen(page);
    } catch (error) {
      harnessFail(`${name}: ${id}`, `did not run to its end: ${String(error?.message ?? error).split('\n')[0]}`);
      entry.error = 'did not run to its end';
    }
    entries.push(entry);
    activeScenario = `(after ${id})`;
  };

  let defaultProfile = null;
  try {
    step(`${name}: loading the app`);
    await page.goto(base);
    await within(30_000, `${name}: writing localStorage`, page.evaluate((entries) => {
      localStorage.setItem('shamela-reader.onboarded', '1');
      localStorage.setItem('shamela-reader.catalogOffered', '1');
      for (const [entry, value] of entries) localStorage.setItem(entry, value);
    }, keys.map((id) => [KEYS[id].entry, KEYS[id].value])));
    // The first boot creates the database and seeds the bundled QUL
    // resources; both are waited for (as in U), so the reload below never cuts
    // a first-boot write short.
    step(`${name}: waiting for the first boot`);
    const deadline = Date.now() + 30_000;
    for (;;) {
      const done = await within(15_000, 'polling the first boot', page.evaluate(async (version) => {
        const known = await indexedDB.databases();
        if (!known.some((db) => db.name === 'shamela-reader' && db.version === version)) return false;
        const db = await new Promise((ok, fail) => {
          const request = indexedDB.open('shamela-reader');
          request.onsuccess = () => ok(request.result);
          request.onerror = () => fail(request.error);
        });
        try {
          const row = await new Promise((ok, fail) => {
            const request = db.transaction('qulResources').objectStore('qulResources').get('qul-seed-matching-ayah');
            request.onsuccess = () => ok(request.result);
            request.onerror = () => fail(request.error);
          });
          const profiles = await new Promise((ok, fail) => {
            const request = db.transaction('profiles').objectStore('profiles').getAll();
            request.onsuccess = () => ok(request.result);
            request.onerror = () => fail(request.error);
          });
          return row !== undefined && profiles.length > 0;
        } finally {
          db.close();
        }
      }, DB_VERSION));
      if (done) break;
      if (Date.now() > deadline) throw new Error('the first boot did not finish within 30 s');
      await sleep(200);
    }
    step(`${name}: seeding`);
    ({ profiles: [defaultProfile] } = await dumpDatabase(page, ['profiles']));
    const profiles = profile ? [{ ...defaultProfile, ...profile }] : [];
    const seed = bookRows({ profiles, settings: profile ? { activeProfileId: profile.id } : {} });
    await writeRows(page, seed.rows);
    await patchSettings(page, seed.settings);
    step(`${name}: opening the book`);
    await page.goto(`${base}#/read/${encodeURIComponent(BOOK)}`);
    await nextLoad();
    await page.reload();
    await within(30_000, `${name}: the book's blocks`, page.locator(`[data-block-id="${blockId(0)}"]`).waitFor());
    await within(30_000, `${name}: the entities`, page.locator('[data-entity-id="entity-hadith"]').waitFor());
    await sleep(500);
    await run(scenario, { page, context, nextLoad, network, defaultProfile });
  } catch (error) {
    harnessFail(name, `the group did not run to its end: ${String(error?.message ?? error).split('\n')[0]}`);
  }

  // ---- where the key may be, and where it must not -------------------------
  step(`${name}: the key assertions`);
  try {
    if (received !== consumed) harnessFail(name, `${received - consumed} model request(s) never answered by a scenario`);
    const present = keys.map((id) => KEYS[id]);
    for (const request of allRequests) {
      const url = request.url();
      const host = new URL(url).hostname;
      // allHeaders, not headers: it includes what Chromium adds itself.
      const headers = await within(15_000, 'reading a request\'s headers', request.allHeaders());
      const body = request.postData() ?? '';
      if ('authorization' in headers) harnessFail(name, `an Authorization header (${url})`);
      for (const key of Object.values(KEYS)) {
        if (url.includes(key.value)) harnessFail(name, `a key is in a URL: ${url}`);
        if (body.includes(key.value)) harnessFail(name, `a key is in a request body (${url})`);
        for (const [header, value] of Object.entries(headers)) {
          if (!value.includes(key.value)) continue;
          const own = key.header ? header === key.header && host === key.host : isSunnahUrl(url);
          if (!own) harnessFail(name, `a key is in the ${header} header (${url})`);
        }
      }
      for (const key of present) {
        if (key.host === host && headers[key.header] !== key.value) harnessFail(name, `a request to ${host} without its fake key in ${key.header}`);
      }
    }
    const database = JSON.stringify(await dumpDatabase(page));
    const elsewhere = await within(15_000, 'reading the other stores', page.evaluate(async (entries) => {
      const local = {};
      for (let i = 0; i < localStorage.length; i++) {
        const name = localStorage.key(i);
        if (!entries.includes(name)) local[name] = localStorage.getItem(name);
      }
      const session = {};
      for (let i = 0; i < sessionStorage.length; i++) session[sessionStorage.key(i)] = sessionStorage.getItem(sessionStorage.key(i));
      const cacheNames = 'caches' in window ? await caches.keys() : [];
      return {
        local, session, cookie: document.cookie, cacheNames, dom: document.documentElement.outerHTML,
        url: location.href, historyState: history.state ?? null, windowName: window.name,
      };
    }, [...KEY_ENTRIES]));
    const ownEntries = await within(15_000, 'reading the key entries', page.evaluate((entries) =>
      entries.map((entry) => [entry, localStorage.getItem(entry)]), [...KEY_ENTRIES]));
    for (const key of Object.values(KEYS)) {
      if (database.includes(key.value)) harnessFail(name, `a key is in IndexedDB (${key.entry})`);
      for (const [where, text] of Object.entries(elsewhere)) {
        if (JSON.stringify(text).includes(key.value)) harnessFail(name, `a key (${key.entry}) is in ${where === 'local' ? 'another localStorage entry' : where}`);
      }
      for (const [entry, value] of ownEntries) {
        if (entry !== key.entry && (value ?? '').includes(key.value)) harnessFail(name, `${key.entry}'s key is under ${entry}`);
      }
      if (logs.some((line) => line.includes(key.value))) harnessFail(name, `a key (${key.entry}) is in the page's console or errors`);
    }
  } catch (error) {
    harnessFail(name, `the key assertions did not run: ${String(error?.message ?? error).split('\n')[0]}`);
  }
  step(`${name}: closing the context`);
  await within(60_000, `${name}: closing the context`, context.close());
  return { id: name, scenarios: entries };
}

/** Method, URL, headers (the key's value masked once asserted) and body of one model request. */
async function describeRequest(request, where) {
  const headers = await within(15_000, 'reading a request\'s headers', request.allHeaders());
  const host = new URL(request.url()).hostname;
  const out = {};
  for (const name of Object.keys(headers).sort()) {
    if (KEY_HEADERS.has(name)) {
      const key = KEY_HEADERS.get(name);
      if (host !== key.host || headers[name] !== key.value) harnessFail(where, `${name} is not ${host}'s fake key`);
      out[name] = KEY_MASK;
    } else if (PLATFORM_HEADERS.has(name)) {
      out[name] = PLATFORM_MASK;
    } else if (MACHINE_HEADERS.has(name)) {
      out[name] = MACHINE_MASK;
    } else if (name === 'origin' || name === 'referer') {
      out[name] = headers[name].replace(appOrigin, ORIGIN_MASK);
    } else {
      out[name] = headers[name];
    }
  }
  const raw = request.postData() ?? '';
  let body = raw;
  try {
    const parsed = JSON.parse(raw);
    if (JSON.stringify(parsed) === raw) body = parsed;
  } catch {
    // Not JSON: kept as text.
  }
  return { method: request.method(), url: request.url(), headers: out, body };
}

// ------------------------------------------------------------------ the scenarios

const card = (page, id) => page.locator(`[data-card-id="${id}"]`);
const retranslateMenu = async (page, id) => {
  await card(page, id).getByRole('button', { name: 'Retranslate ▾' }).click();
  return card(page, id).locator('div.absolute.bottom-full');
};
const newCards = (before, after) => after.filter((row) => !before.some((old) => old.id === row.id));

/** The matn's margin pressed for 600 ms (MarginTarget's hold is 480), then Translate all…. */
async function proposeBatch(page) {
  const margin = page.locator('[data-index="4"] [role="button"]').first();
  await centre(page, margin);
  const box = await margin.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(600);
  await page.mouse.up();
  const menu = page.getByRole('menu');
  await within(10_000, 'the margin menu', menu.waitFor());
  await menu.getByRole('button', { name: 'Translate all…' }).click();
  await within(10_000, 'the batch proposal', page.getByText("Translate this ḥadīth's commentary?").waitFor());
}

const THREE_BLOCKS = [[0, 'الفقرة '.length], [2, TEXTS[2].indexOf('،')]];
const threeBlockAnswer = (english) => answer([
  prose(TEXTS[0].slice('الفقرة '.length), `${english}: the first test sentence, not from a real book.`),
  { type: 'quran', arabic: VERSE, english: '', reference: '14:2' },
  prose(TEXTS[2].slice(0, TEXTS[2].indexOf('،')), 'The third: an explanation of what came before'),
], { cached: 0 });
const blockAnswer = (index, english, usage) => answer([prose(TEXTS[index], english)], usage);

async function mainGroup(scenario, { page, nextLoad }) {
  let first = null;

  await scenario('translate', 'three blocks selected (the middle one a verse) → the rail\'s Translate; the request held, then answered', async (p) => {
    await select(page, ...THREE_BLOCKS);
    await railTranslate(page).click();
    const held = await p.request('the translation');
    await p.state('while the request is held');
    // Translate clears the selection (withSelection), so the rail goes; a
    // second selection while the request is held brings it back, busy.
    await select(page, ...wholeBlock(3));
    await p.state('while the request is held, another block selected');
    await page.evaluate(() => window.getSelection().removeAllRanges());
    await held.respond(threeBlockAnswer('A placeholder translation'));
    const cards = await untilCards(page, 'the complete card', (rows) => rows.some((row) => row.status === 'complete'));
    first = cards[0].id;
  });

  await scenario('cache-hit', 'the same selection again → Translate: served from the cache, no request', async (p) => {
    await page.evaluate(() => window.getSelection().removeAllRanges());
    await sleep(300);
    await select(page, ...THREE_BLOCKS);
    await railTranslate(page).click();
    await p.noRequest('a cached card');
  });

  let retranslated = null;
  await scenario('retranslate', 'the card\'s Retranslate ▾ → Same provider and model: a forced request; the old card kept until the new one is stored, then deleted (FOUND_ISSUES 42)', async (p) => {
    const before = await cardsOf(page);
    const menu = await retranslateMenu(page, first);
    await menu.getByRole('button', { name: 'Same provider and model' }).click();
    const held = await p.request('the forced retranslation');
    await held.respond(threeBlockAnswer('A second placeholder translation'));
    const after = await untilCards(page, 'the retranslated card', (rows) => !rows.some((row) => row.id === first) && rows.some((row) => row.status === 'complete'));
    retranslated = newCards(before, after)[0]?.id ?? null;
  });

  await scenario('retranslate-with', 'Retranslate ▾ → Gemini Flash Lite 3.5: the override\'s model in the URL and on the card; the old card deleted once the new one is stored', async (p) => {
    const before = await cardsOf(page);
    const menu = await retranslateMenu(page, retranslated);
    await menu.getByRole('button', { name: /^Flash Lite 3\.5/ }).click();
    const held = await p.request('the retranslation on another model');
    await held.respond(threeBlockAnswer('A third placeholder translation'));
    await untilCards(page, 'the card on the other model', (rows) => !rows.some((row) => row.id === retranslated) && newCards(before, rows).some((row) => row.status === 'complete'));
  });

  await scenario('stale', 'a glossary entry added (written to IndexedDB) and the reader reloaded: the card is stale (isStale\'s cacheKeyFor); the same selection then misses the cache', async (p) => {
    await writeRows(page, { glossary: [{ id: 'p-gloss-1', arabic: 'تجريبي', english: 'for testing', note: null, addedAt: FIXED_NOW }] });
    await nextLoad();
    await page.reload();
    await within(30_000, 'the book after the reload', page.locator('[data-entity-id="entity-hadith"]').waitFor());
    await sleep(500);
    await p.state('after the reload');
    const before = await cardsOf(page);
    await select(page, ...THREE_BLOCKS);
    await railTranslate(page).click();
    const held = await p.request('the translation with the new glossary');
    await held.respond(threeBlockAnswer('A fourth placeholder translation'));
    await untilCards(page, 'the new card', (rows) => newCards(before, rows).some((row) => row.status === 'complete'));
  });

  let blockCard = null;
  await scenario('block', 'the verse tapped → its sheet\'s "Translate the surrounding passage" (runTranslateBlock): the whole verse block', async (p) => {
    const before = await cardsOf(page);
    const verse = page.locator('[data-entity-id="entity-quran"]');
    await centre(page, verse);
    await verse.click();
    const button = page.getByRole('button', { name: 'Translate the surrounding passage' });
    await within(10_000, 'the verse sheet', button.waitFor());
    await button.click();
    const held = await p.request('the block');
    await held.respond(answer([{ type: 'quran', arabic: VERSE, english: '', reference: '14:2' }], { prompt: 700, candidates: 90, cached: 512 }));
    const after = await untilCards(page, 'the block card', (rows) => newCards(before, rows).some((row) => row.status === 'complete'));
    blockCard = newCards(before, after)[0].id;
  });

  const failing = (id, through, index, responses) =>
    scenario(id, through, async (p) => {
      const before = await cardsOf(page);
      await select(page, ...wholeBlock(index));
      await railTranslate(page).click();
      for (const [i, response] of responses.entries()) {
        const held = await p.request(`request ${i + 1}`);
        await held.respond(response);
      }
      await untilCards(page, 'the failed card', (rows) => newCards(before, rows).some((row) => row.status === 'error'));
    });
  await failing('error-400', 'block 4 selected → Translate, answered HTTP 400: the failed card (status, error, errorKind)', 3,
    [geminiError(400, 'Request contains an invalid argument.', 'INVALID_ARGUMENT')]);
  await failing('error-auth', 'block 9 → Translate, answered HTTP 403 PERMISSION_DENIED: errorKind auth', 8,
    [geminiError(403, 'Permission denied.', 'PERMISSION_DENIED')]);
  const partial = JSON.stringify([prose(TEXTS[9], 'The tenth: a sentence whose answer is cut')]).slice(0, 40);
  await failing('error-truncated', 'block 10 → Translate, answered MAX_TOKENS twice: the retry with a doubled budget, then errorKind truncated with rawResponse', 9,
    [geminiStream([{ text: partial, finishReason: 'MAX_TOKENS', usage: { prompt: 600, candidates: 2048 } }]),
      geminiStream([{ text: partial, finishReason: 'MAX_TOKENS', usage: { prompt: 600, candidates: 4096 } }])]);
  await failing('error-network', 'block 11 → Translate, the connection dropped: errorKind network', 10, [DROP]);

  // Until FOUND_ISSUES 41 a failed card was a cache hit, so selecting its
  // passage again showed the failure and sent nothing. Only a complete card is
  // a hit now: the selection is requested again, and the failed card stays.
  await scenario('error-cached', 'block 4 (the HTTP 400 one) selected again → Translate: a failed card is not a cache hit (FOUND_ISSUES 41), so a request, answered: a complete card beside the failed one', async (p) => {
    const before = await cardsOf(page);
    await select(page, ...wholeBlock(3));
    await railTranslate(page).click();
    const held = await p.request('the translation again');
    await held.respond(blockAnswer(3, 'The fourth: translated after the failure', { prompt: 640, candidates: 60 }));
    await untilCards(page, 'the complete card', (rows) => newCards(before, rows).some((row) => row.status === 'complete'));
  });

  // Until FOUND_ISSUES 42 the card was deleted before the request; with no
  // Claude key no request goes, so the card is kept and only the notice shows.
  await scenario('retranslate-no-key', 'the verse block\'s card → Retranslate ▾ → a Claude model, with no Claude key: the notice, and the card is kept (FOUND_ISSUES 42)', async (p) => {
    const menu = await retranslateMenu(page, blockCard);
    const claude = menu.locator('div.mt-1', { has: page.locator('p', { hasText: /^Claude/ }) }).getByRole('button').first();
    await claude.click();
    await within(10_000, 'the notice', page.getByText('Add one in Settings before translating.').waitFor());
    await p.noRequest('no Claude key');
  });

  await scenario('batch', 'the matn\'s margin held → Translate all… (the proposal) → Translate all: one held request per block of the range, in order; the third answered HTTP 500', async (p) => {
    await proposeBatch(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await p.state('the proposal');
    await page.getByRole('button', { name: 'Translate all', exact: true }).click();
    const answers = [
      answer([{ type: 'hadith', arabic: HADITH_QUOTE, english: '', reference: 'Riyad as-Salihin 1' }], { prompt: 610, candidates: 70 }),
      answer([prose(TEXTS[5], 'The first commentary: a test sentence, not from a real book.')], { prompt: 620, candidates: 80, cached: 0 }),
      geminiError(500, 'Internal error encountered.', 'INTERNAL'),
    ];
    for (const [i, canned] of answers.entries()) {
      const held = await p.request(`block ${i + 1} of 3`);
      await p.state(`block ${i + 1} of 3 held`);
      await held.respond(canned);
    }
    await within(20_000, 'the batch finishing', page.getByText(/^Finished — /).waitFor());
  });

  // Until FOUND_ISSUES 41 the failed card was served from the cache here too,
  // so the batch sent nothing. Now the two complete blocks come from the cache
  // and only the HTTP 500 block (block 7) is requested again.
  await scenario('batch-again', 'Translate all… → Translate all again: the two complete blocks from the cache; the HTTP 500 block requested again (FOUND_ISSUES 41) and answered', async (p) => {
    await page.getByRole('button', { name: 'Dismiss' }).last().click().catch(() => {});
    await proposeBatch(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Translate all', exact: true }).click();
    const held = await p.request('block 7, the failed one');
    await held.respond(answer([prose(TEXTS[6], 'The second commentary: translated after the failure.')], { prompt: 630, candidates: 80, cached: 0 }));
    await within(20_000, 'the batch finishing', page.getByText(/^Finished — /).waitFor());
  });
}

async function noKeyGroup(scenario, { page }) {
  await scenario('no-key', 'no key: the banner; block 1 selected → Translate: the notice, no request, no card', async (p) => {
    await select(page, ...wholeBlock(0));
    await railTranslate(page).click();
    await within(10_000, 'the notice', page.getByText('Add one in Settings before translating.').waitFor());
    await p.noRequest('no key');
  });
  await scenario('no-key-dismiss', 'the notice\'s Dismiss', async () => {
    const notice = page.locator('p', { hasText: 'Add one in Settings before translating.' });
    await notice.getByRole('button', { name: 'Dismiss' }).click();
    await within(10_000, 'the notice gone', notice.waitFor({ state: 'detached' }));
  });
  await scenario('no-key-batch', 'no key: the matn\'s margin → Translate all… → Translate all: every block refused, the notice again', async (p) => {
    await proposeBatch(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Translate all', exact: true }).click();
    await within(20_000, 'the batch finishing', page.getByText(/^Finished — /).waitFor());
    await p.noRequest('no key');
  });
}

const singleBlockGroup = (id, through, english) => async (scenario, { page }) => {
  await scenario(id, through, async (p) => {
    await select(page, ...wholeBlock(2));
    await railTranslate(page).click();
    const held = await p.request('the translation');
    await held.respond(blockAnswer(2, english, { prompt: 650, candidates: 60 }));
    await untilCards(page, 'the card', (rows) => rows.some((row) => row.status !== 'loading'));
  });
};

async function claudeGroup(scenario, { page, nextLoad, defaultProfile }) {
  const usage = { input: 1200, output: 300, cacheRead: 2048, cacheWrite: 400 };
  await scenario('claude-translate', 'a Claude profile, block 3 → Translate: one request (the strict emit_translation tool); the card\'s cost and usage; the session line "Claude: 1 · $…" and the cached tokens (withCloudRequest\'s cost sum and the provider\'s count)', async (p) => {
    await select(page, ...wholeBlock(2));
    await railTranslate(page).click();
    const held = await p.request('the translation');
    await held.respond(emitTool([prose(TEXTS[2], 'The third: a test sentence, translated by Claude.')], usage));
    await untilCards(page, 'the card', (rows) => rows.some((row) => row.status === 'complete'));
  });
  await scenario('claude-external-lookup', 'a Claude profile with allowExternalLookup (written, made active, the reader reloaded), block 4 → Translate: the research pass carries the web-search tool, then the structure pass with the research notes', async (p) => {
    await writeRows(page, { profiles: [{ ...defaultProfile, id: 'profile-p-check-claude-lookup', name: 'P: Claude, external lookup', providerId: 'anthropic', model: CLAUDE_MODEL, allowExternalLookup: true }] });
    await patchSettings(page, { activeProfileId: 'profile-p-check-claude-lookup' });
    await nextLoad();
    await page.reload();
    await within(30_000, 'the book after the reload', page.locator('[data-entity-id="entity-hadith"]').waitFor());
    await sleep(500);
    const before = await cardsOf(page);
    await select(page, ...wholeBlock(3));
    await railTranslate(page).click();
    const research = await p.request('the research pass');
    await research.respond(researchTurn({ input: 900, output: 120, cacheRead: 0, cacheWrite: 900 }));
    const structure = await p.request('the structure pass');
    await structure.respond(emitTool([prose(TEXTS[3], 'The fourth: researched, then translated.')], usage));
    await untilCards(page, 'the card', (rows) => newCards(before, rows).some((row) => row.status === 'complete'));
  });
}

async function offlineGroup(scenario, { page, nextLoad, network }) {
  await scenario('offline-no-bundle', 'a profile on the on-device model, the bundled English refused (HTTP 404): no key asked for, no model request, a plain Error mapped by translate itself to errorKind api', async (p) => {
    network.refuseBundledEnglish = true;
    await select(page, ...wholeBlock(2));
    await railTranslate(page).click();
    await untilCards(page, 'the failed card', (rows) => rows.some((row) => row.status === 'error'));
    await p.noRequest('on device');
  });
  await scenario('offline', 'the bundled English served again and the reader reloaded (loadQuranEnglish keeps its first answer for the page); block 4 → Translate: the model\'s download refused, OfflineProvider\'s own error', async (p) => {
    network.refuseBundledEnglish = false;
    await nextLoad();
    await page.reload();
    await within(30_000, 'the book after the reload', page.locator('[data-entity-id="entity-hadith"]').waitFor());
    await sleep(500);
    const before = await cardsOf(page);
    await select(page, ...wholeBlock(3));
    await railTranslate(page).click();
    await untilCards(page, 'the failed card', (rows) => newCards(before, rows).some((row) => row.status === 'error'));
    await p.noRequest('on device');
  });
}

// How a Gemini reply ends, through the reader: added with the change that
// names every finishReason, stops asking Gemini to echo the Arabic (each
// segment names the numbered pieces of the passage it covers, and the app
// fills the Arabic in), and keeps the whole segments of a reply that stops
// part-way. The replies are in that new shape; their piece numbers are read
// from the request each answers, so they follow the app's own cutting
// (translation/sourceUnits.ts) rather than a copy of it. "[ {" is the raw text
// the owner saw on the RECITATION failures; the segment cut mid-string with no
// finish reason is the tablet's report.

/** The numbered pieces a Gemini request sent as its target ("[1] …"), in order. */
const piecesSent = (held) => {
  const user = held.described.body.contents[0].parts[0].text;
  const target = user.slice(user.indexOf('<target>'), user.indexOf('</target>'));
  return [...target.matchAll(/^\[(\d+)\] (.*)$/gm)].map((match) => match[2]);
};
const piece = (from, to, english, extra = {}) => ({ type: 'prose', from, to, english, ...extra });
/** A reply that ends with no finish reason after `text`: the stream just closes. */
const endsWithout = (text) => geminiStream([{ text, usage: { prompt: 640, candidates: 30 } }]);
const stopsWith = (text, finishReason) => geminiStream([{ text, finishReason, usage: { prompt: 640, candidates: 2 } }]);

/**
 * P_SCREENSHOTS=<dir>: the cards this group makes, photographed at the
 * tablet's two sizes for a PR (CLAUDE.md: a UI change carries screenshots).
 * Off by default and never part of the record; a run that takes them resizes
 * the page and puts it back, so compare nothing from it.
 */
async function photograph(page, cardId, name) {
  const dir = process.env.P_SCREENSHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  for (const size of [VIEWPORT, { width: 600, height: 960 }]) {
    await page.setViewportSize(size);
    await sleep(600);
    // In portrait the cards are in the bottom sheet: open it.
    const sheet = page.getByRole('button', { name: /Cards \(\d+\)/ });
    if (size.width < size.height && (await sheet.count())) {
      await sheet.first().click();
      await sleep(800);
    }
    const target = page.locator(`[data-card-id="${cardId}"]`);
    if (await target.count()) await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await sleep(400);
    await page.screenshot({ path: join(dir, `${name}-${size.width}x${size.height}.png`) });
  }
  await page.setViewportSize(VIEWPORT);
  await sleep(600);
}

async function stopsGroup(scenario, { page }) {
  await scenario('recitation-halves', 'block 10 → Translate, answered "[ {" with finishReason RECITATION: the passage is sent again in two halves, one request each, and the card is the two halves\' segments', async (p) => {
    await select(page, ...wholeBlock(9));
    await railTranslate(page).click();
    const first = await p.request('the whole passage');
    await first.respond(stopsWith('[ {', 'RECITATION'));
    const one = await p.request('the first half');
    await one.respond(answer([piece(1, piecesSent(one).length, 'The tenth, its first half.')], { prompt: 600, candidates: 20 }));
    const two = await p.request('the second half');
    await two.respond(answer([piece(1, piecesSent(two).length, 'The tenth, its second half.')], { prompt: 610, candidates: 20 }));
    await untilCards(page, 'the complete card', (rows) => rows.some((row) => row.status === 'complete'));
  });

  let partialCard = null;
  await scenario('cut-mid-segment', 'blocks 1–3 → Translate, answered with the first block\'s segments whole and the next one cut mid-string, no finish reason: a partial card — those segments, the notice, "Finish reason: none", Translate the rest', async (p) => {
    const before = await cardsOf(page);
    await select(page, [0, 0], [2, TEXTS[2].length]);
    await railTranslate(page).click();
    const held = await p.request('the passage');
    const sent = piecesSent(held);
    const verseAt = sent.findIndex((text) => VERSE.startsWith(text.slice(0, 8)));
    const whole = JSON.stringify([
      piece(1, 1, 'The first: a heading.'),
      piece(2, verseAt, 'A test sentence, not from a real book.'),
    ]);
    await held.respond(endsWithout(`${whole.slice(0, -1)},{"type":"quran","from":${verseAt + 1},"to":${verseAt + 1},"english":"`));
    const after = await untilCards(page, 'the partial card', (rows) => newCards(before, rows).some((row) => row.status === 'complete'));
    partialCard = newCards(before, after)[0].id;
    await photograph(page, partialCard, 'partial-card');
  });

  await scenario('translate-the-rest', 'the partial card\'s Translate the rest: one request for the passage from the verse to the end of block 3, answered: a second card beside the partial one, which is kept', async (p) => {
    const before = await cardsOf(page);
    await card(page, partialCard).getByRole('button', { name: 'Translate the rest' }).click();
    const held = await p.request('the rest');
    const sent = piecesSent(held);
    const proseAt = sent.findIndex((text) => TEXTS[2].startsWith(text.slice(0, 8)));
    await held.respond(answer([
      piece(1, proseAt, '', { type: 'quran', reference: '14:2' }),
      piece(proseAt + 1, sent.length, 'The third: the rest, translated.'),
    ], { prompt: 620, candidates: 40 }));
    await untilCards(page, 'the card for the rest', (rows) => newCards(before, rows).some((row) => row.status === 'complete'));
  });

  await scenario('partial-not-cached', 'blocks 1–3 selected again → Translate: the partial card is not a cache hit (getCardByCacheKey skips it), so a request, answered whole: a complete card beside the partial one', async (p) => {
    const before = await cardsOf(page);
    await select(page, [0, 0], [2, TEXTS[2].length]);
    await railTranslate(page).click();
    const held = await p.request('the passage again');
    const sent = piecesSent(held);
    const verseAt = sent.findIndex((text) => VERSE.startsWith(text.slice(0, 8)));
    const proseAt = sent.findIndex((text) => TEXTS[2].startsWith(text.slice(0, 8)));
    await held.respond(answer([
      piece(1, verseAt, 'The first: translated whole this time.'),
      piece(verseAt + 1, proseAt, '', { type: 'quran', reference: '14:2' }),
      piece(proseAt + 1, sent.length, 'The third: translated whole this time.'),
    ], { prompt: 700, candidates: 60 }));
    await untilCards(page, 'the whole card', (rows) => newCards(before, rows).some((row) => row.status === 'complete'));
  });

  let interrupted = null;
  await scenario('interrupted', 'block 11 → Translate, answered "[ {" and the stream closed with no finish reason: errorKind interrupted, "Connection interrupted", "Finish reason: none", Retry', async (p) => {
    const before = await cardsOf(page);
    await select(page, ...wholeBlock(10));
    await railTranslate(page).click();
    const held = await p.request('the passage');
    await held.respond(endsWithout('[ {'));
    const after = await untilCards(page, 'the failed card', (rows) => newCards(before, rows).some((row) => row.status === 'error'));
    interrupted = newCards(before, after)[0].id;
    await photograph(page, interrupted, 'interrupted-card');
  });

  await scenario('interrupted-retry', 'the interrupted card\'s Retry: the passage requested again and answered; the failed card replaced', async (p) => {
    const before = await cardsOf(page);
    await card(page, interrupted).getByRole('button', { name: 'Retry' }).click();
    const held = await p.request('the retry');
    await held.respond(answer([piece(1, piecesSent(held).length, 'The eleventh: translated on the retry.')], { prompt: 640, candidates: 30 }));
    await untilCards(page, 'the retried card', (rows) => !rows.some((row) => row.id === interrupted) && newCards(before, rows).some((row) => row.status === 'complete'));
  });

  await scenario('finish-other', 'block 12 → Translate, answered "[ {" with finishReason OTHER: errorKind stopped, its own message and "Finish reason: OTHER", never a parse failure', async (p) => {
    const before = await cardsOf(page);
    await select(page, ...wholeBlock(11));
    await railTranslate(page).click();
    const held = await p.request('the passage');
    await held.respond(stopsWith('[ {', 'OTHER'));
    const after = await untilCards(page, 'the failed card', (rows) => newCards(before, rows).some((row) => row.status === 'error'));
    await photograph(page, newCards(before, after)[0].id, 'stopped-card');
  });
}

// ------------------------------------------------------------------ run

const own = process.env.VERIFY_URL
  ? null
  : await preview({ preview: { port: 4177, strictPort: false }, logLevel: 'warn' });
const base = process.env.VERIFY_URL ?? own.resolvedUrls.local[0];
const appOrigin = new URL(base).origin;

const groups = [];
const browser = await chromium.launch();
try {
  groups.push(await group(browser, base, 'with a key, the default profile', { keys: ['gemini', 'sunnah'] }, mainGroup));
  groups.push(await group(browser, base, 'without a key', { keys: [] }, noKeyGroup));
  groups.push(await group(browser, base, 'a profile with external lookup', {
    profile: { id: 'profile-p-check-external', name: 'P: external lookup', allowExternalLookup: true },
  }, singleBlockGroup('external-lookup', 'block 3 → Translate on a Gemini profile with allowExternalLookup: GeminiProvider sends no flag (its request is the plain one), so what this pins is the card: no search ran, so usedExternalLookup is false and it shows no "web search" label (FOUND_ISSUES 43; until then both came from the profile); the request\'s flag and a card that did search are seen in the Claude group', 'The third: with external lookup allowed')));
  groups.push(await group(browser, base, 'a profile with transliteration', {
    profile: { id: 'profile-p-check-translit', name: 'P: transliteration', useTransliteration: true },
  }, singleBlockGroup('transliteration', 'block 3 → Translate on a profile with useTransliteration: TRANSLITERATION_INSTRUCTION in the system prompt', 'The third: with transliteration')));
  groups.push(await group(browser, base, 'a Claude profile', {
    keys: ['anthropic'],
    profile: { id: 'profile-p-check-claude', name: 'P: Claude', providerId: 'anthropic', model: CLAUDE_MODEL },
  }, claudeGroup));
  groups.push(await group(browser, base, 'a profile on the device', {
    keys: [],
    profile: { id: 'profile-p-check-offline', name: 'P: on device', providerId: 'offline', model: 'opus-mt-ar-en' },
  }, offlineGroup));
  groups.push(await group(browser, base, 'how a Gemini reply ends', { keys: ['gemini'] }, stopsGroup));
} finally {
  step('closing the browser');
  await within(60_000, 'closing the browser', browser.close());
  step('closing the preview server');
  await within(60_000, 'closing the preview server', own ? own.close() : Promise.resolve());
}

const scenarios = groups.flatMap((entry) => entry.scenarios);
const requestCount = scenarios.reduce((sum, entry) => sum + entry.requests.length, 0);
const recordFile = {
  check: 'P — the translate pipeline through the reader, recorded (scripts/verify-translate.mjs)',
  pinned: {
    dateNow: `${new Date(FIXED_NOW).toISOString()} at the first page load, a minute later at each load after it`,
    mathRandom: `mulberry32, seed 0x${RANDOM_SEED.toString(16)}`,
    timezone: 'UTC',
    locale: 'en-US',
    viewport: `${VIEWPORT.width}×${VIEWPORT.height}, touch`,
    serviceWorkers: 'blocked',
  },
  masked: [
    ...[...KEY_HEADERS.keys()].map((name) => `${name}: ${KEY_MASK}`),
    ...[...MACHINE_HEADERS].map((name) => `${name}: ${MACHINE_MASK}`),
    ...[...PLATFORM_HEADERS].map((name) => `${name}: ${PLATFORM_MASK}`),
    `origin, referer: the app's origin written as ${ORIGIN_MASK}`,
  ],
  network: `${[...MODEL_HOSTS].join(' and ')} answered from canned responses; every other off-origin request, and the proxy's same-origin paths, aborted`,
  groups,
};
const text = `${JSON.stringify(recordFile, null, 2)}\n`;
for (const value of FAKE_VALUES) if (text.includes(value)) harnessFail('record', `a key is in the record (${value.slice(0, 12)}…)`);
const elapsed = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\nCheck P: ${groups.length} groups, ${scenarios.length} scenarios, ${requestCount} requests; ${Buffer.byteLength(text).toLocaleString('en-US')} bytes; ${elapsed} s.`);

if (harnessFailures.length > 0) {
  console.log(`\nFAIL: ${harnessFailures.length} harness assertion(s)`);
  for (const failure of harnessFailures) console.log(`  ${failure}`);
  if (OUT) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    console.log(`  (this run's record written to ${OUT})`);
  }
  process.exit(1);
}

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`  written to ${OUT}`);
  process.exit(0);
}
if (WRITE) {
  mkdirSync(dirname(RECORD_PATH), { recursive: true });
  writeFileSync(RECORD_PATH, text);
  console.log(`  written to ${relative(ROOT, RECORD_PATH)}`);
  process.exit(0);
}

let expectedText;
try {
  expectedText = readFileSync(RECORD_PATH, 'utf8');
} catch {
  console.log(`FAIL: no record at ${relative(ROOT, RECORD_PATH)} (run with --write on the old code first)`);
  process.exit(1);
}
if (expectedText === text) {
  console.log(`PASS: identical to ${relative(ROOT, RECORD_PATH)}`);
  process.exit(0);
}

// Each differing scenario with its first differing lines.
const expected = JSON.parse(expectedText);
const byId = (file) => new Map(file.groups.flatMap((entry) => entry.scenarios).map((entry) => [entry.id, entry]));
const before = byId(expected);
const after = byId(recordFile);
const differing = [];
for (const id of new Set([...before.keys(), ...after.keys()])) {
  const was = before.get(id);
  const now = after.get(id);
  if (!was || !now) {
    differing.push(`${id}: ${was ? 'missing from this run' : 'not in the record'}`);
    continue;
  }
  const wasLines = JSON.stringify(was, null, 2).split('\n');
  const nowLines = JSON.stringify(now, null, 2).split('\n');
  const first = wasLines.findIndex((line, index) => line !== nowLines[index]);
  if (first === -1 && wasLines.length === nowLines.length) continue;
  const at = first === -1 ? wasLines.length : first;
  const wasLine = wasLines[at] ?? '';
  const nowLine = nowLines[at] ?? '';
  let column = 0;
  while (column < wasLine.length && wasLine[column] === nowLine[column]) column++;
  const from = column > 120 ? column - 60 : 0;
  const excerpt = (lines) => lines.slice(at, at + 3)
    .map((line, index) => `      ${index === 0 && from > 0 ? `…${line.slice(from, from + 200)}` : line.slice(0, 200)}`)
    .join('\n');
  differing.push(`${id}: first difference at line ${at + 1} of the scenario, column ${column + 1}\n    record:\n${excerpt(wasLines)}\n    this run:\n${excerpt(nowLines)}`);
}
if (differing.length === 0) differing.push('(every scenario is equal; the header or the formatting differs)');
console.log(`\nFAIL: ${differing.length} scenario${differing.length === 1 ? ' differs' : 's differ'} from ${relative(ROOT, RECORD_PATH)}`);
for (const line of differing) console.log(`  ${line}`);
process.exit(1);
