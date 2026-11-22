// Check Q: every request each LLM call site sends, every error it maps, and
// the pure values the cache and the token budgets rest on.
//
//   npm run verify:requests                      compare with docs/refactor/phase3/requests.json
//   npm run verify:requests -- --write           write the record (Phase 3 step 3a, and the two
//                                                steps that add a section: plan Design §8)
//   npm run verify:requests -- --out <file>      write this run's record elsewhere, compare nothing
//
// Why it exists. Phase 3 of the restructure (docs/refactor/plans/
// phase3-provider-seams.md, Design §1) merges the four Anthropic clients, the
// identical error mappings and the two Gemini POSTs into shared modules. The
// promise is that no request, error, message, cache key or token budget
// changes by a byte. Nothing else in the repository can see a request: the
// typecheck does not, the bundle comparison cannot (code moves between
// modules), and `npm run verify` only runs on the owner's PC and checks
// cache-key relations, not values. This records them, on the old code first,
// and every later step must reproduce the record exactly.
//
// How. Built by Vite's SSR build, like `npm run verify`, and run in Node. It
// imports the real modules by path and calls them: the registry's two
// providers (translate, validateKey), explainPhrase, glossWord, compileAyah,
// and the pure functions in prompt, models, profiles, registry and secrets.
// No browser, no build of the app, no fixtures, no network.
//
//   * `globalThis.fetch` is replaced by a stub that records each call and
//     answers from the scenario's queue of canned responses. The SDK reads the
//     global `fetch` when a client is constructed (client.mjs:111,
//     internal/shims.mjs getDefaultFetch), and every call site constructs one
//     per call, so the stub reaches all four Anthropic sites and both Gemini
//     ones without touching src/. A request with no canned answer left, a
//     request outside a scenario, or one to a host other than the two model
//     hosts fails the run loudly; it is never answered from the network.
//   * Recorded per request: method, URL, every header (through `new Headers`,
//     so names are lower-cased and sorted — order is not part of HTTP's
//     meaning, and the SDK builds them through its own merge), the body text
//     exactly as passed to fetch (never re-serialized: JSON key order is what
//     "byte-identical" means), and the names of any other init fields.
//   * A canned response can also drop the connection part-way through its
//     body (`dropAfterBytes`), the realistic way to reach the Anthropic
//     mapping's not-an-API-error branches (since FOUND_ISSUES 14, the
//     dropped-reply branch just before the last) and the body-read catches of
//     Gemini translate and compile: see the scenarios added after the 3a
//     review, near the end of the call-site scenarios.
//   * Every `ANTHROPIC_*` environment variable is deleted before anything
//     runs. The SDK reads ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN,
//     ANTHROPIC_CUSTOM_HEADERS and ANTHROPIC_LOG from process.env when a
//     client is built; the browser has no process.env, so this is what the
//     app sees. Without it the record would depend on the machine (the cloud
//     container sets ANTHROPIC_BASE_URL), and a set ANTHROPIC_AUTH_TOKEN would
//     put a real credential into an Authorization header of the record.
//
// What is pinned, and why (each would otherwise make two runs differ):
//
//   * setTimeout: a delay under 60 s is recorded in the scenario's `waits` and
//     run at 0 ms. That pins Gemini's 2/4/8 s backoff and the SDK's retry
//     sleeps without waiting for them. Longer ones (the SDK's 10-minute
//     request timeout, armed per request and cleared) pass through.
//   * Math.random = 0.5: the SDK's retry jitter when no retry-after header
//     is sent (the connection-failure scenarios).
//   * Date.now = 2026-11-16T12:00:00Z: gloss's createdAt, and the SDK's
//     reading of an HTTP-date retry-after (Date.parse(header) - Date.now()).
//     Only anthropic.translate.429-retry-after-http-date-only reaches that
//     branch: the older anthropic.translate.429-retry-after-http-date also
//     sends retry-after-ms, which the SDK reads first. There the app's
//     Number() made the date NaN until FOUND_ISSUES 11; since 15.4 the app
//     reads retry-after-ms first too (1 s), so the date is read by neither.
//     The -only scenario's date is read by both (30 s, this Date.now).
//   * Number.prototype.toLocaleString and String.prototype.localeCompare
//     default to 'en-US' when called without a locale: the truncation messages
//     format the budget with toLocaleString(). localeCompare stays pinned
//     in case a call site reaches one; glossaryHashOf, which once sorted with
//     it, sorts by code point since FOUND_ISSUES 13. Pinned in-process
//     rather than by running under LANG=C.UTF-8, because an environment
//     prefix in an npm script does not work in every shell, and on some
//     systems Node takes its default locale from the OS rather than LANG.
//   * navigator.onLine (Node's navigator has none): true, false in one gloss
//     scenario. localStorage: a Map, emptied before the secrets section.
//
// What is masked, and why. Four request headers: x-stainless-os,
// x-stainless-arch, x-stainless-runtime, x-stainless-runtime-version. They
// describe the machine running the check (Node on Linux here; Chrome on
// Android on the tablet), not the code; the record keeps their names with a
// placeholder value, so a header that disappears still shows. Nothing else is
// masked. user-agent and x-stainless-package-version carry the SDK version,
// which the lockfile pins: an SDK upgrade shows up here, which is right. The
// keys are fake, so x-api-key and x-goog-api-key are recorded as they are.
//
// Asserted on every scenario (a failure exits 1 even with --write): each fake
// key appears in exactly one place per request — its own header, x-api-key or
// x-goog-api-key — and in no URL, body, other header, result, error message,
// `raw` or progress string; no request carries an Authorization header. And
// once per run, the SDK-import allowlist (plan Q12, at the bottom of this
// file): which files of src/ may import `@anthropic-ai/sdk` as a value, and
// which may name GEMINI_BASE.
//
// What it does not cover. The browser: the platform headers are masked, and a
// browser's fetch may treat some headers (user-agent) differently from Node's;
// the owner's smoke test on the staged build covers that. The real APIs: the
// canned responses are written from the SDK's and the providers' parsers, not
// captured from the services. The UI paths that choose the inputs (which key,
// which model, which profile) — they are checked by U and by reading. The
// offline model's translation (only its model list and ids are recorded, in
// values.offlineModels). Explain's library search (searchLibrary), which sends no
// request. AppContext's legacy-profile inference, which is inside a React
// callback until step 3m.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const started = performance.now();
const ROOT = process.cwd();
const RECORD_PATH = join(ROOT, 'docs/refactor/phase3/requests.json');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const outFlag = args.indexOf('--out');
const OUT = outFlag >= 0 ? args[outFlag + 1] : null;
if (outFlag >= 0 && !OUT) {
  console.log('--out needs a file name');
  process.exit(2);
}

// ------------------------------------------------------------ environment

const scrubbedEnv = Object.keys(process.env)
  .filter((name) => name.startsWith('ANTHROPIC_'))
  .sort();
for (const name of scrubbedEnv) delete process.env[name];

const FIXED_NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
Date.now = () => FIXED_NOW;
Math.random = () => 0.5;

const nativeToLocaleString = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function toLocaleString(
  this: number,
  locales?: string | string[],
  options?: Intl.NumberFormatOptions,
): string {
  return nativeToLocaleString.call(this, locales ?? 'en-US', options);
};
const nativeLocaleCompare = String.prototype.localeCompare;
String.prototype.localeCompare = function localeCompare(
  this: string,
  that: string,
  locales?: string | string[],
  options?: Intl.CollatorOptions,
): number {
  return nativeLocaleCompare.call(this, that, locales ?? 'en-US', options);
};

let online = true;
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
}
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => online, configurable: true });

const storageMap = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (key: string) => (storageMap.has(key) ? (storageMap.get(key) as string) : null),
  setItem: (key: string, value: string) => void storageMap.set(key, String(value)),
  removeItem: (key: string) => void storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: (index: number) => [...storageMap.keys()][index] ?? null,
  get length() {
    return storageMap.size;
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: fakeLocalStorage,
  configurable: true,
  writable: true,
});

// ------------------------------------------------------------------ stubs

const ANTHROPIC_KEY = 'sk-ant-q-check-not-a-real-key';
const GEMINI_KEY = 'AIza-q-check-not-a-real-key';
const FAKE_KEYS = [ANTHROPIC_KEY, GEMINI_KEY];

const ANTHROPIC_ORIGIN = 'https://api.anthropic.com/';
const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com/';

const MASKED_HEADERS = new Set([
  'x-stainless-os',
  'x-stainless-arch',
  'x-stainless-runtime',
  'x-stainless-runtime-version',
]);
const MASK = '(platform, masked)';

/** A canned answer: an HTTP response, or a fetch that throws. */
type Canned =
  | {
      status: number;
      headers?: Record<string, string>;
      body?: string | null;
      /** Serve the body as a stream in pieces of this many bytes (mid-line, mid-character). */
      pieceBytes?: number;
      /**
       * The connection drops after this many bytes of the body: the stream
       * serves them (in `pieceBytes` pieces, 61 if unset) and then errors with
       * `TypeError('network error')`, which is what Chrome's fetch gives when a
       * body read fails after the headers arrived. The SDK retries only a fetch
       * that fails before the headers, so this reaches each site's error
       * mapping as whatever the SDK or the site makes of a body read error.
       */
      dropAfterBytes?: number;
    }
  | { throws: string };

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  otherInit: string[];
}

interface Active {
  id: string;
  queue: Canned[];
  requests: RecordedRequest[];
  waits: number[];
  warnings: string[];
  unexpected: number;
}

let active: Active | null = null;
const harnessFailures: string[] = [];

function harnessFail(id: string, message: string): void {
  harnessFailures.push(`${id}: ${message}`);
}

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
globalThis.setTimeout = ((handler: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
  const delay = Number(ms ?? 0);
  if (active && delay < 60_000) {
    active.waits.push(delay);
    return realSetTimeout(handler, 0, ...rest);
  }
  return realSetTimeout(handler, ms, ...rest);
}) as typeof setTimeout;

function makeResponse(canned: Extract<Canned, { status: number }>): Response {
  const init = { status: canned.status, headers: canned.headers ?? {} };
  if (canned.body == null) return new Response(null, init);
  if (canned.dropAfterBytes !== undefined) {
    // Pull-based, so the pieces before the drop are really read: an error
    // raised in start() would discard whatever was queued.
    const served = new TextEncoder().encode(canned.body).slice(0, canned.dropAfterBytes);
    const size = canned.pieceBytes ?? 61;
    let at = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= served.length) {
          controller.error(new TypeError('network error'));
          return;
        }
        controller.enqueue(served.slice(at, at + size));
        at += size;
      },
    });
    return new Response(stream, init);
  }
  if (!canned.pieceBytes) return new Response(canned.body, init);
  const bytes = new TextEncoder().encode(canned.body);
  const size = canned.pieceBytes;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += size) controller.enqueue(bytes.slice(at, at + size));
      controller.close();
    },
  });
  return new Response(stream, init);
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const scenario = active;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!scenario) {
    harnessFail('(outside a scenario)', `fetch ${url}`);
    throw new Error('Check Q: fetch outside a scenario');
  }
  const headers: Record<string, string> = {};
  for (const [name, value] of new Headers(init?.headers)) {
    headers[name] = MASKED_HEADERS.has(name) ? MASK : value;
  }
  let body: string | null = null;
  if (typeof init?.body === 'string') body = init.body;
  else if (init?.body != null) harnessFail(scenario.id, `a request body that is not a string (${typeof init.body})`);
  scenario.requests.push({
    method: init?.method ?? 'GET',
    url,
    headers,
    body,
    otherInit: Object.keys(init ?? {})
      .filter((name) => name !== 'method' && name !== 'headers' && name !== 'body')
      .sort(),
  });
  if (!url.startsWith(ANTHROPIC_ORIGIN) && !url.startsWith(GEMINI_ORIGIN)) {
    harnessFail(scenario.id, `a request to an unexpected host: ${url}`);
  }
  const next = scenario.queue.shift();
  if (!next) {
    scenario.unexpected++;
    harnessFail(scenario.id, `request ${scenario.requests.length} has no canned response: ${url}`);
    throw new Error('Check Q: no canned response left');
  }
  if ('throws' in next) throw new TypeError(next.throws);
  return makeResponse(next);
}) as typeof fetch;

const realWarn = console.warn;
const realError = console.error;
console.warn = (...parts: unknown[]) => {
  if (active) active.warnings.push(parts.map(String).join(' '));
  else realWarn(...parts);
};
console.error = (...parts: unknown[]) => {
  if (active) active.warnings.push(parts.map(String).join(' '));
  else realError(...parts);
};

// ------------------------------------------------------------ the modules

const registry = await import('../src/translation/providers/registry');
const { explainPhrase, explainModelFor } = await import('../src/translation/explain');
const { glossWord } = await import('../src/translation/gloss');
const { compileAyah, compileCacheKey } = await import('../src/qul/compile');
const { cacheKeyFor, glossaryHashOf } = await import('../src/translation/prompt');
const models = await import('../src/translation/models');
const { createDefaultProfile, STUDY_CIRCLE_PROMPT } = await import('../src/translation/profiles');
const { costOf } = await import('../src/translation/models');
const { secrets, API_KEY_STORAGE_KEYS } = await import('../src/services/secrets');
// Static imports only (the transformers.js import inside it is dynamic and
// never runs here): its model list supplies the offline ids the
// offlineModels, providerIdForModel and explainModelFor sections pass in.
const { OFFLINE_MODELS, offlineModelById } = await import('../src/translation/offline/OfflineProvider');

type TranslationRequest = import('../src/translation/TranslationProvider').TranslationRequest;
type StorageAdapter = import('../src/platform/storage/StorageAdapter').StorageAdapter;
type WordGloss = import('../src/types').WordGloss;
type GlossaryEntry = import('../src/types').GlossaryEntry;
type ProviderId = import('../src/types').ProviderId;
type CompileSource = import('../src/qul/compile').CompileSource;

// ------------------------------------------------------- the record shape

/**
 * JSON-safe copy: NaN and the infinities become strings (JSON.stringify would
 * write null), an undefined property is written as "(undefined)" rather than
 * dropped, so "absent" and "present but undefined" stay apart.
 */
function plain(value: unknown): unknown {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    return value;
  }
  if (value === undefined) return '(undefined)';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(plain);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = plain(entry);
  return out;
}

/** What a SyntaxError's message is recorded as (see describeError). */
const SYNTAX_ERROR_MASK = '(masked: the JavaScript engine\'s JSON parser wording)';

function describeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { thrown: String(error) };
  const record: Record<string, unknown> = { class: error.constructor.name, name: error.name };
  for (const field of ['kind', 'message', 'retryAfterSeconds', 'raw'] as const) {
    if (field in error) record[field] = plain((error as unknown as Record<string, unknown>)[field]);
  }
  // TranslationError.stopReason (the provider's finish reason, or 'none'):
  // recorded only when set, so the errors that carry none read as before.
  const stopReason = (error as unknown as Record<string, unknown>).stopReason;
  if (stopReason !== undefined && stopReason !== null) record.stopReason = plain(stopReason);
  // A SyntaxError's message is the JavaScript engine's wording, not the app's,
  // and it differs between Node versions: for the HTML body, `Unexpected token
  // '<', … is not valid JSON` in Node 20+, `Unexpected token < in JSON at
  // position 0` in Node 18. No step
  // can change it while the class stays SyntaxError, and a change in how the
  // app handles the error still shows in the class, name and kind. Masked so
  // Q gives the same answer on the owner's PC, whatever its Node.
  if (record.class === 'SyntaxError' && 'message' in record) record.message = SYNTAX_ERROR_MASK;
  return record;
}

type Entry = Record<string, unknown> & { id: string };
const record: Entry[] = [];

interface Context {
  progress: (partial: string) => void;
}

function containsFakeKey(text: string): boolean {
  return FAKE_KEYS.some((key) => text.includes(key));
}

/** Run one call-site scenario against its canned responses. */
async function scenario(
  id: string,
  queue: Canned[],
  run: (context: Context) => Promise<unknown>,
  extra?: () => Record<string, unknown>,
): Promise<void> {
  const progress: string[] = [];
  const scenarioState: Active = { id, queue: [...queue], requests: [], waits: [], warnings: [], unexpected: 0 };
  active = scenarioState;
  let outcome: Record<string, unknown>;
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      run({ progress: (partial) => void progress.push(partial) }),
      new Promise((_, reject) => {
        guard = realSetTimeout(() => reject(new Error('Check Q: scenario did not finish in 20 s')), 20_000);
      }),
    ]);
    outcome = { result: plain(result) };
  } catch (error) {
    outcome = { error: describeError(error) };
    if (error instanceof Error && error.message.startsWith('Check Q:')) harnessFail(id, error.message);
  } finally {
    realClearTimeout(guard);
    active = null;
  }

  const entry: Entry = {
    id,
    requests: scenarioState.requests,
    waits: scenarioState.waits.map((ms) => plain(ms)),
    outcome,
    progress: { count: progress.length, last: progress.at(-1) ?? null },
    ...(extra ? extra() : {}),
  };
  if (scenarioState.warnings.length > 0) entry.warnings = scenarioState.warnings;
  if (scenarioState.queue.length > 0) entry.unusedResponses = scenarioState.queue.length;
  if (scenarioState.unexpected > 0) entry.unexpectedRequests = scenarioState.unexpected;
  record.push(entry);

  // Key containment: the CLAUDE.md "Never" for keys, checked on every path.
  scenarioState.requests.forEach((request, index) => {
    const where = `request ${index + 1}`;
    const ownHeader = request.url.startsWith(ANTHROPIC_ORIGIN) ? 'x-api-key' : 'x-goog-api-key';
    const ownKey = request.url.startsWith(ANTHROPIC_ORIGIN) ? ANTHROPIC_KEY : GEMINI_KEY;
    if (containsFakeKey(request.url)) harnessFail(id, `${where}: a key in the URL`);
    if (request.body !== null && containsFakeKey(request.body)) harnessFail(id, `${where}: a key in the body`);
    if ('authorization' in request.headers) harnessFail(id, `${where}: an Authorization header`);
    const carriers = Object.entries(request.headers).filter(([, value]) => containsFakeKey(value));
    if (carriers.length !== 1 || carriers[0][0] !== ownHeader || carriers[0][1] !== ownKey) {
      harnessFail(id, `${where}: the key is not in exactly its own header (${carriers.map(([n]) => n).join(', ') || 'none'})`);
    }
  });
  if (containsFakeKey(JSON.stringify(outcome))) harnessFail(id, 'a key in the result or error');
  if (progress.some(containsFakeKey)) harnessFail(id, 'a key in a progress string');
  if (scenarioState.warnings.some(containsFakeKey)) harnessFail(id, 'a key in a console warning');
  if (extra && containsFakeKey(JSON.stringify(extra()))) harnessFail(id, 'a key in what was stored');
}

function values(id: string, compute: () => unknown): void {
  record.push({ id, values: plain(compute()) });
}

// -------------------------------------------------------- canned answers

interface AnthropicBlock {
  type: 'text' | 'tool_use' | 'server_tool_use' | 'web_search_tool_result';
  /** text: the text deltas; tool_use and server_tool_use: the input_json deltas. */
  deltas?: string[];
  id?: string;
  name?: string;
  /** web_search_tool_result: the whole block, sent in content_block_start. */
  block?: Record<string, unknown>;
}

/**
 * Token counts for a canned reply. A cache count may be null (the field sent
 * as null) or undefined (the field left out of message_start altogether, which
 * JSON.stringify does by itself): the API documents both counts as nullable,
 * and the app reads each with `?? 0`.
 */
interface CannedUsage {
  input: number;
  output: number;
  cacheRead: number | null | undefined;
  cacheWrite: number | null | undefined;
}

interface AnthropicMessage {
  model: string;
  blocks: AnthropicBlock[];
  stop: string;
  stopDetails?: Record<string, unknown>;
  usage?: CannedUsage;
  /**
   * End the stream with an in-stream `event: error` after this many events
   * (message_start counts as the first), instead of message_delta and
   * message_stop: what the API sends when it is overloaded part-way through a
   * reply that has already started.
   */
  errorAfterEvents?: number;
}

const DEFAULT_USAGE = { input: 120, output: 80, cacheRead: 0, cacheWrite: 400 };

let messageCounter = 0;
function messageId(): string {
  messageCounter++;
  return `msg_q${String(messageCounter).padStart(3, '0')}`;
}

function startBlock(block: AnthropicBlock): Record<string, unknown> {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: '', citations: null };
    case 'tool_use':
    case 'server_tool_use':
      return { type: block.type, id: block.id, name: block.name, input: {} };
    case 'web_search_tool_result':
      return block.block ?? {};
  }
}

/** An Anthropic Messages stream, as server-sent events. */
function anthropicStream(message: AnthropicMessage): Canned {
  const usage = message.usage ?? DEFAULT_USAGE;
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id: messageId(),
        type: 'message',
        role: 'assistant',
        model: message.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: usage.input,
          output_tokens: 1,
          cache_read_input_tokens: usage.cacheRead,
          cache_creation_input_tokens: usage.cacheWrite,
        },
      },
    },
  ];
  message.blocks.forEach((block, index) => {
    events.push({ type: 'content_block_start', index, content_block: startBlock(block) });
    for (const delta of block.deltas ?? []) {
      events.push({
        type: 'content_block_delta',
        index,
        delta:
          block.type === 'text'
            ? { type: 'text_delta', text: delta }
            : { type: 'input_json_delta', partial_json: delta },
      });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push({
    type: 'message_delta',
    delta: {
      stop_reason: message.stop,
      stop_sequence: null,
      ...(message.stopDetails ? { stop_details: message.stopDetails } : {}),
    },
    usage: { output_tokens: usage.output },
  });
  events.push({ type: 'message_stop' });
  if (message.errorAfterEvents !== undefined) {
    events.length = message.errorAfterEvents;
    events.push({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
  }
  return {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'request-id': 'req_q_stream' },
    body: events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    pieceBytes: 61,
  };
}

/** A non-streaming Messages response (messages.create). */
function anthropicJson(message: {
  model: string;
  content: Record<string, unknown>[];
  stop: string;
  usage?: CannedUsage;
}): Canned {
  const usage = message.usage ?? DEFAULT_USAGE;
  return {
    status: 200,
    headers: { 'content-type': 'application/json', 'request-id': 'req_q_json' },
    body: JSON.stringify({
      id: messageId(),
      type: 'message',
      role: 'assistant',
      model: message.model,
      content: message.content,
      stop_reason: message.stop,
      stop_sequence: null,
      usage: {
        input_tokens: usage.input,
        output_tokens: usage.output,
        cache_read_input_tokens: usage.cacheRead,
        cache_creation_input_tokens: usage.cacheWrite,
      },
    }),
  };
}

const ANTHROPIC_ERROR_TYPES: Record<number, string> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'permission_error',
  429: 'rate_limit_error',
  500: 'api_error',
};

/**
 * An Anthropic error response. Retryable statuses carry `retry-after-ms`
 * unless the scenario says otherwise, so the SDK never falls back to jittered
 * backoff (Math.random is pinned all the same).
 */
function anthropicError(status: number, headers: Record<string, string> = {}): Canned {
  return {
    status,
    headers: { 'content-type': 'application/json', 'request-id': `req_q_${status}`, ...headers },
    body: JSON.stringify({
      type: 'error',
      error: { type: ANTHROPIC_ERROR_TYPES[status] ?? 'api_error', message: `Synthetic ${status} for check Q.` },
    }),
  };
}

const RETRY_MS = { 'retry-after-ms': '250' };

function times<T>(count: number, make: () => T): T[] {
  return Array.from({ length: count }, make);
}

const CONNECTION_FAILURE: Canned = { throws: 'fetch failed' };

interface GeminiChunk {
  text?: string;
  finishReason?: string;
  usage?: { prompt: number; candidates: number; cached?: number };
}

/** A Gemini streamGenerateContent?alt=sse body, served in pieces split mid-line. */
function geminiStream(chunks: GeminiChunk[]): Canned {
  const body = chunks
    .map((chunk) => {
      const candidate: Record<string, unknown> = {
        content: { parts: chunk.text === undefined ? [] : [{ text: chunk.text }], role: 'model' },
      };
      if (chunk.finishReason) candidate.finishReason = chunk.finishReason;
      const payload: Record<string, unknown> = { candidates: [candidate] };
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
  return { status: 200, headers: { 'content-type': 'text/event-stream' }, body, pieceBytes: 23 };
}

function geminiError(status: number, message: string, apiStatus: string): Canned {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: { code: status, message, status: apiStatus } }),
  };
}

// --------------------------------------------------------- the inputs

// Synthetic, short, written for this check (no book text).
const GLOSSARY: GlossaryEntry[] = [
  { id: 'q-g1', arabic: 'المثال', english: 'the example', note: null, addedAt: 0 },
  { id: 'q-g2', arabic: 'التجربة', english: 'the trial', note: 'in the sense of a test', addedAt: 0 },
];

const TARGET = 'وهذا مثال قصير كتب للتجربة فقط.';

function translationRequest(overrides: Partial<TranslationRequest> = {}): TranslationRequest {
  return {
    targetText: TARGET,
    contextBefore: '',
    contextAfter: '',
    blockTypes: ['body'],
    systemPrompt: 'Translate the passage into plain English.',
    glossary: GLOSSARY,
    model: models.CLAUDE_SONNET_5_5,
    ...overrides,
  };
}

/** The one request per provider that runs the real profile text and every renderUser branch. */
function studyCircleRequest(model: string): TranslationRequest {
  return translationRequest({
    systemPrompt: STUDY_CIRCLE_PROMPT,
    contextBefore: 'سطر قبل النص للتجربة.',
    contextAfter: 'سطر بعد النص للتجربة.',
    blockTypes: ['body', 'hadith_matn', 'quran'],
    hadithNumbers: ['12'],
    knownQuranRefs: ['2:255'],
    model,
  });
}

const SEGMENTS_JSON = JSON.stringify({
  segments: [
    { type: 'prose', arabic: 'وهذا مثال قصير', english: 'And this is a short example' },
    { type: 'prose', arabic: 'كتب للتجربة فقط.', english: 'written only for the trial.', note: 'synthetic' },
  ],
});
const SEGMENTS_ARRAY = JSON.stringify(JSON.parse(SEGMENTS_JSON).segments);

/** Split a string into pieces of `size` characters (the deltas a stream would carry). */
function pieces(text: string, size: number): string[] {
  const out: string[] = [];
  for (let at = 0; at < text.length; at += size) out.push(text.slice(at, at + size));
  return out;
}

function emitTool(model: string, stop = 'tool_use'): Canned {
  return anthropicStream({
    model,
    blocks: [{ type: 'tool_use', id: 'toolu_q_emit', name: 'emit_translation', deltas: pieces(SEGMENTS_JSON, 40) }],
    stop,
  });
}

const anthropic = registry.providerFor('anthropic');
const gemini = registry.providerFor('gemini');

// ------------------------------------------------ Anthropic: translate

const SONNET = models.CLAUDE_SONNET_5_5;
const OPUS = models.CLAUDE_OPUS_5_5;
const translateAnthropic = (request: TranslationRequest) => (context: Context) =>
  anthropic.translate(request, ANTHROPIC_KEY, context.progress);

await scenario('anthropic.translate.tool-call', [emitTool(SONNET)], translateAnthropic(studyCircleRequest(SONNET)));
await scenario('anthropic.translate.opus-effort', [emitTool(OPUS)], translateAnthropic(translationRequest({ model: OPUS })));
await scenario(
  'anthropic.translate.dig-deeper',
  [
    anthropicStream({
      model: SONNET,
      blocks: [
        { type: 'text', deltas: ['Looking up ', 'the example.'] },
        { type: 'server_tool_use', id: 'srvtoolu_q1', name: 'web_search', deltas: ['{"query":', '"example"}'] },
        {
          type: 'web_search_tool_result',
          block: {
            type: 'web_search_tool_result',
            tool_use_id: 'srvtoolu_q1',
            content: [
              { type: 'web_search_result', url: 'https://example.org/q', title: 'Example', encrypted_content: 'eq', page_age: null },
            ],
          },
        },
      ],
      stop: 'pause_turn',
    }),
    anthropicStream({ model: SONNET, blocks: [{ type: 'text', deltas: ['The example ', 'is synthetic.'] }], stop: 'end_turn' }),
    emitTool(SONNET),
  ],
  translateAnthropic(translationRequest({ allowExternalLookup: true })),
);
await scenario(
  'anthropic.translate.max-tokens-then-success',
  [emitTool(SONNET, 'max_tokens'), emitTool(SONNET)],
  translateAnthropic(translationRequest()),
);
await scenario(
  'anthropic.translate.max-tokens-twice',
  [emitTool(SONNET, 'max_tokens'), emitTool(SONNET, 'max_tokens')],
  translateAnthropic(translationRequest()),
);
await scenario(
  'anthropic.translate.json-in-text',
  [anthropicStream({ model: SONNET, blocks: [{ type: 'text', deltas: ['Here it is:\n```json\n', SEGMENTS_ARRAY, '\n```'] }], stop: 'end_turn' })],
  translateAnthropic(translationRequest()),
);
await scenario(
  'anthropic.translate.prose-only',
  [anthropicStream({ model: SONNET, blocks: [{ type: 'text', deltas: ['I would rather describe ', 'the passage in prose.'] }], stop: 'end_turn' })],
  translateAnthropic(translationRequest()),
);
await scenario(
  'anthropic.translate.refusal',
  [
    anthropicStream({
      model: SONNET,
      blocks: [],
      stop: 'refusal',
      stopDetails: { type: 'refusal', category: null, explanation: 'Synthetic refusal for check Q.' },
    }),
  ],
  translateAnthropic(translationRequest()),
);
await scenario('anthropic.translate.401', [anthropicError(401)], translateAnthropic(translationRequest()));
await scenario('anthropic.translate.403', [anthropicError(403)], translateAnthropic(translationRequest()));
await scenario(
  'anthropic.translate.429-retry-after-7',
  times(3, () => anthropicError(429, { 'retry-after-ms': '7000', 'retry-after': '7' })),
  translateAnthropic(translationRequest()),
);
// retry-after-ms wins in the SDK and, since FOUND_ISSUES 15.4, in the app too
// (1 s), so the HTTP date here is read by neither. Before 15.4 the app read
// the date (NaN by Number() until FOUND_ISSUES 11, a date after it).
// ...-http-date-only, further down, exercises the date on both sides.
await scenario(
  'anthropic.translate.429-retry-after-http-date',
  times(3, () => anthropicError(429, { 'retry-after-ms': '1000', 'retry-after': 'Mon, 16 Nov 2026 12:00:30 GMT' })),
  translateAnthropic(translationRequest()),
);
await scenario('anthropic.translate.400', [anthropicError(400)], translateAnthropic(translationRequest()));
await scenario('anthropic.translate.500', times(3, () => anthropicError(500, RETRY_MS)), translateAnthropic(translationRequest()));
await scenario('anthropic.translate.connection-failure', times(3, () => CONNECTION_FAILURE), translateAnthropic(translationRequest()));

// ---------------------------------------------- Anthropic: validateKey

const keyCheckOk = anthropicJson({
  model: models.ANTHROPIC_KEY_CHECK_MODEL,
  content: [{ type: 'text', text: 'H', citations: null }],
  stop: 'max_tokens',
  usage: { input: 8, output: 1, cacheRead: 0, cacheWrite: 0 },
});
const validateAnthropic = (key: string) => () => anthropic.validateKey(key);
await scenario('anthropic.validateKey.empty', [], validateAnthropic('  '));
await scenario('anthropic.validateKey.200', [keyCheckOk], validateAnthropic(ANTHROPIC_KEY));
await scenario('anthropic.validateKey.401', [anthropicError(401)], validateAnthropic(ANTHROPIC_KEY));
await scenario('anthropic.validateKey.403', [anthropicError(403)], validateAnthropic(ANTHROPIC_KEY));
await scenario('anthropic.validateKey.429', times(3, () => anthropicError(429, RETRY_MS)), validateAnthropic(ANTHROPIC_KEY));
await scenario('anthropic.validateKey.400', [anthropicError(400)], validateAnthropic(ANTHROPIC_KEY));
await scenario('anthropic.validateKey.connection-failure', times(3, () => CONNECTION_FAILURE), validateAnthropic(ANTHROPIC_KEY));

// --------------------------------------------------- Gemini: translate

const GEMINI_MODEL = models.GEMINI_DEFAULT_MODEL;
const translateGemini = (request: TranslationRequest) => (context: Context) =>
  gemini.translate(request, GEMINI_KEY, context.progress);
const geminiRequest = (overrides: Partial<TranslationRequest> = {}) =>
  translationRequest({ model: GEMINI_MODEL, ...overrides });

const geminiOk = () =>
  geminiStream([
    { text: SEGMENTS_ARRAY.slice(0, 30), usage: { prompt: 300, candidates: 10 } },
    { text: SEGMENTS_ARRAY.slice(30, 90), usage: { prompt: 300, candidates: 40, cached: 0 } },
    { text: SEGMENTS_ARRAY.slice(90), finishReason: 'STOP', usage: { prompt: 300, candidates: 75, cached: 0 } },
  ]);
const geminiTruncated = () =>
  geminiStream([
    { text: SEGMENTS_ARRAY.slice(0, 50), usage: { prompt: 300, candidates: 20 } },
    { text: SEGMENTS_ARRAY.slice(50, 70), finishReason: 'MAX_TOKENS', usage: { prompt: 300, candidates: 2048 } },
  ]);

await scenario('gemini.translate.success', [geminiOk()], translateGemini(studyCircleRequest(GEMINI_MODEL)));
await scenario('gemini.translate.max-tokens-then-success', [geminiTruncated(), geminiOk()], translateGemini(geminiRequest()));
await scenario('gemini.translate.max-tokens-twice', [geminiTruncated(), geminiTruncated()], translateGemini(geminiRequest()));
await scenario(
  'gemini.translate.safety',
  [geminiStream([{ text: '[', finishReason: 'SAFETY', usage: { prompt: 300, candidates: 1 } }])],
  translateGemini(geminiRequest()),
);
await scenario(
  'gemini.translate.malformed',
  [geminiStream([{ text: 'Not a JSON array at all.', finishReason: 'STOP', usage: { prompt: 300, candidates: 6 } }])],
  translateGemini(geminiRequest()),
);
await scenario(
  'gemini.translate.429-four-times-retry-after-0',
  times(4, () => ({ ...geminiError(429, 'Resource has been exhausted.', 'RESOURCE_EXHAUSTED'), headers: { 'content-type': 'application/json', 'retry-after': '0' } })),
  translateGemini(geminiRequest()),
);
await scenario(
  'gemini.translate.429-then-200',
  [geminiError(429, 'Resource has been exhausted.', 'RESOURCE_EXHAUSTED'), geminiOk()],
  translateGemini(geminiRequest()),
);
await scenario('gemini.translate.401', [geminiError(401, 'Request had invalid authentication credentials.', 'UNAUTHENTICATED')], translateGemini(geminiRequest()));
await scenario(
  'gemini.translate.400-api-key-not-valid',
  [geminiError(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT')],
  translateGemini(geminiRequest()),
);
await scenario(
  'gemini.translate.400-model-not-found',
  [geminiError(400, 'models/gemini-q is not found for API version v1beta.', 'NOT_FOUND')],
  translateGemini(geminiRequest()),
);
await scenario(
  'gemini.translate.500-non-json',
  [{ status: 500, headers: { 'content-type': 'text/html' }, body: '<html>Synthetic 500</html>' }],
  translateGemini(geminiRequest()),
);
await scenario('gemini.translate.fetch-throws', [CONNECTION_FAILURE], translateGemini(geminiRequest()));
await scenario('gemini.translate.200-no-body', [{ status: 200, body: null }], translateGemini(geminiRequest()));

// ------------------------------------- Gemini: how a reply ends (the stops)
//
// Added with the change that names every finishReason, stops asking Gemini to
// echo the Arabic and keeps the whole segments of a reply that stops
// part-way. The passage is four synthetic sentences, so it is four numbered
// pieces (translation/sourceUnits.ts) and halves into two pieces each. The
// replies are in the new shape: each segment names the pieces it covers by
// `from` and `to`, and the app fills its Arabic in. "[ {" is the raw text the
// owner saw on the RECITATION failures; the cut fourth segment with no finish
// reason is the tablet's report.

const STOPS_TARGET =
  'الجملة الأولى للتجربة. الجملة الثانية للتجربة. الجملة الثالثة للتجربة. الجملة الرابعة للتجربة.';
const stopsRequest = () => geminiRequest({ targetText: STOPS_TARGET });
const piece = (from: number, to: number, english: string, type = 'prose') => ({ type, from, to, english });
/** A whole reply in the new shape, split across two chunks, then STOP. */
const piecesOk = (segments: unknown[], candidates = 40): Canned => {
  const text = JSON.stringify(segments);
  const cut = Math.floor(text.length / 2);
  return geminiStream([
    { text: text.slice(0, cut), usage: { prompt: 320, candidates: Math.floor(candidates / 2) } },
    { text: text.slice(cut), finishReason: 'STOP', usage: { prompt: 320, candidates } },
  ]);
};
const openBracket = (finishReason?: string): Canned =>
  geminiStream([{ text: '[ {', ...(finishReason ? { finishReason } : {}), usage: { prompt: 320, candidates: 2 } }]);
const FOUR = [
  piece(1, 1, 'The first sentence, for the test.'),
  piece(2, 2, 'The second sentence, for the test.'),
  piece(3, 3, 'The third sentence, for the test.'),
  piece(4, 4, 'The fourth sentence, for the test.'),
];
const HALF = [piece(1, 1, 'One half, its first sentence.'), piece(2, 2, 'One half, its second sentence.')];

await scenario('gemini.translate.pieces', [piecesOk([...FOUR.slice(0, 2), piece(3, 4, '', 'quran')], 60)], translateGemini(stopsRequest()));

// Quotations get pieces of their own, so a ḥadīth in "…" or ((…)) no longer
// shares one with the commentary after it (translation/sourceUnits.ts). Six
// pieces: قال الشيخ: | "متن…" | والمراد… | ثم قال: | ((متن ثان…)) | رواه مسلم.
const QUOTED_TARGET =
  'قال الشيخ: "متن للتجربة" والمراد به شيء آخر. ثم قال: ((متن ثان للتجربة)) رواه مسلم.';
const quotedRequest = () => geminiRequest({ targetText: QUOTED_TARGET });
await scenario(
  'gemini.translate.quoted-matn-pieces',
  [piecesOk([
    piece(1, 1, 'The shaykh said:'),
    piece(2, 2, '', 'hadith'),
    piece(3, 4, 'What is meant by it is something else. Then he said:'),
    piece(5, 6, '', 'hadith'),
  ])],
  translateGemini(quotedRequest()),
);
// The owner's card: an extra segment early on keeps the numbers in order but
// one piece late, and only the overflow at the end shows it. The clamp still
// fills the Arabic in; the segment now says why it may be wrong.
await scenario(
  'gemini.translate.numbers-run-past-the-end',
  [piecesOk([...FOUR, piece(5, 5, 'A fifth segment for a passage of four pieces.')])],
  translateGemini(stopsRequest()),
);
// A ḥadīth segment whose range takes in the commentary after the quotation.
// The provider passes it on unchanged, Arabic filled in from pieces 2–3: the
// note explaining it belongs to the ḥadīth lookup, and only when the lookup
// fails (retrieval/quotationOverrun.ts), so it is not recorded here.
await scenario(
  'gemini.translate.hadith-range-runs-on',
  [piecesOk([
    piece(1, 1, 'The shaykh said:'),
    piece(2, 3, '', 'hadith'),
    piece(4, 4, 'Then he said:'),
    piece(5, 6, '', 'hadith'),
  ])],
  translateGemini(quotedRequest()),
);
await scenario('gemini.translate.recitation-then-halves', [openBracket('RECITATION'), piecesOk(HALF), piecesOk(HALF)], translateGemini(stopsRequest()));
await scenario('gemini.translate.recitation-after-two-segments', [
  geminiStream([{ text: `${JSON.stringify(FOUR.slice(0, 2)).slice(0, -1)}, {"type":"prose","from":3`, finishReason: 'RECITATION', usage: { prompt: 320, candidates: 30 } }]),
  piecesOk([piece(1, 1, 'The third, sent alone.')]),
  piecesOk([piece(1, 1, 'The fourth, sent alone.')]),
], translateGemini(stopsRequest()));
await scenario('gemini.translate.recitation-again-in-second-half', [openBracket('RECITATION'), piecesOk(HALF), openBracket('RECITATION')], translateGemini(stopsRequest()));
await scenario('gemini.translate.recitation-again-in-first-half', [openBracket('RECITATION'), openBracket('RECITATION')], translateGemini(stopsRequest()));
await scenario('gemini.translate.recitation-one-word', [openBracket('RECITATION')], translateGemini(geminiRequest({ targetText: 'كلمة' })));
await scenario('gemini.translate.open-bracket-no-finish-reason', [openBracket()], translateGemini(stopsRequest()));
await scenario('gemini.translate.open-bracket-stop', [openBracket('STOP')], translateGemini(stopsRequest()));
await scenario(
  'gemini.translate.cut-mid-segment-no-finish-reason',
  [geminiStream([
    { text: JSON.stringify(FOUR.slice(0, 2)).slice(0, -1), usage: { prompt: 320, candidates: 20 } },
    { text: `,${JSON.stringify(FOUR[2])},{"type":"prose","from":4,"to":4,"english":"The fourth sen`, usage: { prompt: 320, candidates: 35 } },
  ])],
  translateGemini(stopsRequest()),
);
// The same two whole segments, then the connection drops a few bytes into
// the second chunk: the read throws (the `network` path), not a clean end.
const twoThenDrop = geminiStream([
  { text: JSON.stringify(FOUR.slice(0, 2)).slice(0, -1), usage: { prompt: 320, candidates: 20 } },
  { text: `,${JSON.stringify(FOUR.slice(2)).slice(1)}`, finishReason: 'STOP', usage: { prompt: 320, candidates: 40 } },
]) as Extract<Canned, { status: number }>;
const firstLineBytes = new TextEncoder().encode(String(twoThenDrop.body).split('\r\n\r\n')[0]).length + 4;
// `dropped` is declared further down, with the other body drops.
await scenario(
  'gemini.translate.cut-mid-segment-body-drop',
  [{ ...twoThenDrop, dropAfterBytes: firstLineBytes + 30 }],
  translateGemini(stopsRequest()),
);
await scenario(
  'gemini.translate.max-tokens-twice-after-segments',
  times(2, () => geminiStream([{ text: `${JSON.stringify(FOUR.slice(0, 3)).slice(0, -1)},{"type":"pro`, finishReason: 'MAX_TOKENS', usage: { prompt: 320, candidates: 2048 } }])),
  translateGemini(stopsRequest()),
);
await scenario(
  'gemini.translate.stop-without-closing-bracket',
  [geminiStream([{ text: JSON.stringify(FOUR).slice(0, -1), finishReason: 'STOP', usage: { prompt: 320, candidates: 50 } }])],
  translateGemini(stopsRequest()),
);
// STOP, but the array broke off after two of the four: partial, and its
// message does not call the kept segments "no structured output".
await scenario(
  'gemini.translate.stop-unclosed-after-two',
  [geminiStream([{ text: `${JSON.stringify(FOUR.slice(0, 2)).slice(0, -1)},{"type":"prose","from":3`, finishReason: 'STOP', usage: { prompt: 320, candidates: 30 } }])],
  translateGemini(stopsRequest()),
);
for (const reason of ['OTHER', 'BLOCKLIST', 'SPII', 'LANGUAGE', 'MALFORMED_RESPONSE', 'CONTINUATION', 'A_REASON_FROM_THE_FUTURE']) {
  await scenario(`gemini.translate.finish-${reason.toLowerCase().replace(/_/g, '-')}`, [openBracket(reason)], translateGemini(stopsRequest()));
}
await scenario(
  'gemini.translate.second-half-429',
  [openBracket('RECITATION'), piecesOk(HALF), ...times(4, () => ({ ...geminiError(429, 'Resource has been exhausted.', 'RESOURCE_EXHAUSTED'), headers: { 'content-type': 'application/json', 'retry-after': '0' } }))],
  translateGemini(stopsRequest()),
);

// ------------------------------------------------- Gemini: validateKey

const validateGemini = (key: string) => () => gemini.validateKey(key);
const geminiModelsList: Canned = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ models: [{ name: 'models/gemini-3.7-flash' }] }),
};
await scenario('gemini.validateKey.empty', [], validateGemini(''));
await scenario('gemini.validateKey.200', [geminiModelsList], validateGemini(GEMINI_KEY));
await scenario('gemini.validateKey.400', [geminiError(400, 'API key not valid.', 'INVALID_ARGUMENT')], validateGemini(GEMINI_KEY));
await scenario('gemini.validateKey.401', [geminiError(401, 'Unauthenticated.', 'UNAUTHENTICATED')], validateGemini(GEMINI_KEY));
await scenario('gemini.validateKey.403', [geminiError(403, 'Permission denied.', 'PERMISSION_DENIED')], validateGemini(GEMINI_KEY));
await scenario('gemini.validateKey.500', [geminiError(500, 'Internal error.', 'INTERNAL')], validateGemini(GEMINI_KEY));
await scenario('gemini.validateKey.fetch-throws', [CONNECTION_FAILURE], validateGemini(GEMINI_KEY));

// ------------------------------------------------------------- Explain

const EXPLAIN_SOURCES = [
  { bookId: 'q-book-1', blockId: 'q-book-1:p3:b2', bookTitle: 'كتاب تجريبي', volume: 1, printPage: 12, excerpt: 'نص مكتبي قصير للتجربة.' },
  { bookId: 'q-book-2', blockId: 'q-book-2:p9:b1', bookTitle: 'كتاب آخر', volume: null, printPage: null, excerpt: 'نص ثان للتجربة.' },
];
const explain = (model = SONNET, localSources = EXPLAIN_SOURCES) => (context: Context) =>
  explainPhrase({
    apiKey: ANTHROPIC_KEY,
    model,
    phrase: 'مثال قصير',
    context: TARGET,
    localSources,
    onProgress: context.progress,
  });
const explainResearch = (model = SONNET, stop = 'end_turn') =>
  anthropicStream({ model, blocks: [{ type: 'text', deltas: ['The phrase ', 'is a synthetic example.'] }], stop });
const EXPLANATION_JSON = JSON.stringify({
  explanation: 'A synthetic explanation for check Q.',
  localSourceIds: ['L1'],
  webSources: [{ url: 'https://example.org/q', title: 'Example', siteName: 'Example', excerpt: 'One sentence.' }],
});
const explainTool = (model = SONNET) =>
  anthropicStream({
    model,
    blocks: [{ type: 'tool_use', id: 'toolu_q_explain', name: 'emit_explanation', deltas: pieces(EXPLANATION_JSON, 50) }],
    stop: 'tool_use',
  });

await scenario('explain.tool-call', [explainResearch(), explainTool()], explain());
await scenario('explain.opus', [explainResearch(OPUS), explainTool(OPUS)], explain(OPUS, []));
await scenario(
  'explain.research-pause-turn',
  [explainResearch(SONNET, 'pause_turn'), explainResearch(), explainTool()],
  explain(),
);
await scenario(
  'explain.structure-in-text',
  [explainResearch(), anthropicStream({ model: SONNET, blocks: [{ type: 'text', deltas: ['```json\n', EXPLANATION_JSON, '\n```'] }], stop: 'end_turn' })],
  explain(),
);
await scenario(
  'explain.neither',
  [explainResearch(), anthropicStream({ model: SONNET, blocks: [{ type: 'text', deltas: ['No structure here.'] }], stop: 'end_turn' })],
  explain(),
);
await scenario('explain.401', [anthropicError(401)], explain());
await scenario('explain.403', [anthropicError(403)], explain());
await scenario('explain.429', times(3, () => anthropicError(429, RETRY_MS)), explain());
await scenario('explain.500', times(3, () => anthropicError(500, RETRY_MS)), explain());
await scenario('explain.connection-failure', times(3, () => CONNECTION_FAILURE), explain());

// --------------------------------------------------------------- Gloss

const CACHED_GLOSS: WordGloss = {
  word: 'مثال',
  display: 'مِثَال',
  root: 'م ث ل',
  meaning: 'an example (cached)',
  note: null,
  isTechnicalTerm: false,
  model: models.ANTHROPIC_GLOSS_MODEL,
  createdAt: 1,
};

function gloss(options: { apiKey?: string; cached?: WordGloss; offline?: boolean } = {}) {
  const lookups: string[] = [];
  const stored: unknown[] = [];
  const storage = {
    getWordGloss: async (word: string) => {
      lookups.push(word);
      return options.cached;
    },
    putWordGloss: async (entry: WordGloss) => {
      stored.push(entry);
    },
  } as unknown as StorageAdapter;
  return {
    run: async () => {
      online = !options.offline;
      try {
        return await glossWord(storage, {
          apiKey: options.apiKey ?? ANTHROPIC_KEY,
          model: models.ANTHROPIC_GLOSS_MODEL,
          word: 'مِثَال',
          sentence: TARGET,
          blockType: 'hadith_matn',
        });
      } finally {
        online = true;
      }
    },
    extra: () => ({ storage: { lookups: [...lookups], stored: plain(stored) } }),
  };
}

const GLOSS_JSON = { word: 'مِثَال', root: 'م ث ل', meaning: 'an example', note: ' as used here ', isTechnicalTerm: false };
const glossTool = anthropicJson({
  model: models.ANTHROPIC_GLOSS_MODEL,
  content: [{ type: 'tool_use', id: 'toolu_q_gloss', name: 'emit_gloss', input: GLOSS_JSON }],
  stop: 'tool_use',
});

async function glossScenario(id: string, queue: Canned[], options: Parameters<typeof gloss>[0] = {}) {
  const g = gloss(options);
  await scenario(id, queue, g.run, g.extra);
}

await glossScenario('gloss.tool-call', [glossTool]);
await glossScenario('gloss.text-recovered', [
  anthropicJson({
    model: models.ANTHROPIC_GLOSS_MODEL,
    content: [{ type: 'text', text: `Here:\n${JSON.stringify({ ...GLOSS_JSON, isTechnicalTerm: true })}`, citations: null }],
    stop: 'end_turn',
  }),
]);
await glossScenario('gloss.parse', [
  anthropicJson({ model: models.ANTHROPIC_GLOSS_MODEL, content: [{ type: 'text', text: 'Just prose.', citations: null }], stop: 'end_turn' }),
]);
await glossScenario('gloss.cached', [], { cached: CACHED_GLOSS });
await glossScenario('gloss.offline', [], { offline: true });
await glossScenario('gloss.no-key', [], { apiKey: '' });
await glossScenario('gloss.401', [anthropicError(401)]);
await glossScenario('gloss.403', [anthropicError(403)]);
await glossScenario('gloss.429', times(3, () => anthropicError(429, RETRY_MS)));
await glossScenario('gloss.connection-failure', times(3, () => CONNECTION_FAILURE));

// ------------------------------------------------------------- Compile

const COMPILE_SOURCE: CompileSource = {
  ayahLabel: 'Synthetic 1:1',
  ayahKey: '1:1',
  arabic: 'نص تجريبي',
  english: 'A synthetic text.',
  englishAttribution: 'Check Q',
  tafsir: [{ name: 'Tafsir Q', coverage: '1:1', text: 'شرح تجريبي قصير.' }],
  similar: [{ label: '1:2', arabic: 'نص آخر', english: 'Another text.' }],
  topics: [{ name: 'Testing', description: 'A synthetic topic.' }],
  surah: { name: 'Q', text: 'A synthetic surah note.' },
};
const compile = (providerId: 'anthropic' | 'gemini', model: string) => () =>
  compileAyah({ providerId, model, apiKey: providerId === 'anthropic' ? ANTHROPIC_KEY : GEMINI_KEY, source: COMPILE_SOURCE });
const compiledAnthropic = anthropicJson({
  model: SONNET,
  content: [
    { type: 'text', text: '  A compiled account, ', citations: null },
    { type: 'text', text: 'in two blocks.  ', citations: null },
  ],
  stop: 'end_turn',
});
const compiledGemini = (text: string): Canned => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    candidates: [{ content: { parts: [{ text }, { text: ' Second part. ' }], role: 'model' }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 60, cachedContentTokenCount: 4, totalTokenCount: 560 },
  }),
});

await scenario('compile.anthropic.success', [compiledAnthropic], compile('anthropic', SONNET));
await scenario('compile.anthropic.401', [anthropicError(401)], compile('anthropic', SONNET));
await scenario('compile.anthropic.403', [anthropicError(403)], compile('anthropic', SONNET));
await scenario('compile.anthropic.429', times(3, () => anthropicError(429, RETRY_MS)), compile('anthropic', SONNET));
await scenario('compile.anthropic.connection-failure', times(3, () => CONNECTION_FAILURE), compile('anthropic', SONNET));
await scenario('compile.gemini.success', [compiledGemini(' A compiled account.')], compile('gemini', GEMINI_MODEL));
await scenario('compile.gemini.401', [geminiError(401, 'Unauthenticated.', 'UNAUTHENTICATED')], compile('gemini', GEMINI_MODEL));
await scenario('compile.gemini.403', [geminiError(403, 'Permission denied.', 'PERMISSION_DENIED')], compile('gemini', GEMINI_MODEL));
await scenario('compile.gemini.429', [geminiError(429, 'Resource has been exhausted.', 'RESOURCE_EXHAUSTED')], compile('gemini', GEMINI_MODEL));
await scenario('compile.gemini.500', [geminiError(500, 'Internal error.', 'INTERNAL')], compile('gemini', GEMINI_MODEL));
await scenario('compile.gemini.fetch-throws', [CONNECTION_FAILURE], compile('gemini', GEMINI_MODEL));
await scenario(
  'compile.gemini.empty-text',
  [
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '   ' }] } }] }),
    },
  ],
  compile('gemini', GEMINI_MODEL),
);

// ------------------------------- added after the step 3a review (gaps)
//
// Each group below covers a path a later Phase 3 step moves that the scenarios
// above did not reach. They run after every scenario above, so the message ids
// (msg_q…) and everything else those scenarios record are unchanged by them.

/** Different, non-zero cache counts per turn, so a merge that drops, swaps or keeps only the last shows in usage and cost. */
const TURN_USAGE = [
  { input: 1103, output: 211, cacheRead: 0, cacheWrite: 4409 },
  { input: 1301, output: 307, cacheRead: 4409, cacheWrite: 613 },
  { input: 1709, output: 419, cacheRead: 5011, cacheWrite: 823 },
  { input: 1907, output: 503, cacheRead: 5821, cacheWrite: 1031 },
];
const STRUCTURE_USAGE = { input: 907, output: 1201, cacheRead: 2003, cacheWrite: 3203 };
const RETRY_USAGE = { input: 911, output: 2399, cacheRead: 3203, cacheWrite: 17 };

/** One research turn with a search call and its result, ending as `stop`. */
function researchTurn(model: string, turn: number, stop: string, usage: CannedUsage = TURN_USAGE[turn]): Canned {
  const toolId = `srvtoolu_q_turn${turn}`;
  return anthropicStream({
    model,
    blocks: [
      { type: 'text', deltas: [`Turn ${turn + 1}: `, 'searching.'] },
      { type: 'server_tool_use', id: toolId, name: 'web_search', deltas: ['{"query":', `"turn ${turn + 1}"}`] },
      {
        type: 'web_search_tool_result',
        block: {
          type: 'web_search_tool_result',
          tool_use_id: toolId,
          content: [
            { type: 'web_search_result', url: `https://example.org/q${turn + 1}`, title: 'Example', encrypted_content: 'eq', page_age: null },
          ],
        },
      },
    ],
    stop,
    usage,
  });
}

function emitToolWithUsage(model: string, usage: CannedUsage, stop = 'tool_use'): Canned {
  return anthropicStream({
    model,
    blocks: [{ type: 'tool_use', id: 'toolu_q_emit', name: 'emit_translation', deltas: pieces(SEGMENTS_JSON, 40) }],
    stop,
    usage,
  });
}

function explainToolWithUsage(model: string, usage: CannedUsage): Canned {
  return anthropicStream({
    model,
    blocks: [{ type: 'tool_use', id: 'toolu_q_explain', name: 'emit_explanation', deltas: pieces(EXPLANATION_JSON, 50) }],
    stop: 'tool_use',
    usage,
  });
}

// (a) for 3g's shared addUsage: summed usage across turns, cache counts included.
await scenario(
  'anthropic.translate.dig-deeper-cache-usage',
  [researchTurn(SONNET, 0, 'pause_turn'), researchTurn(SONNET, 1, 'end_turn'), emitToolWithUsage(SONNET, STRUCTURE_USAGE)],
  translateAnthropic(translationRequest({ allowExternalLookup: true })),
);
await scenario(
  'anthropic.translate.max-tokens-then-success-cache-usage',
  [emitToolWithUsage(SONNET, RETRY_USAGE, 'max_tokens'), emitToolWithUsage(SONNET, STRUCTURE_USAGE)],
  translateAnthropic(translationRequest()),
);
await scenario(
  'explain.cache-usage',
  // The second turn's usage, so the research pass has a non-zero cache read
  // of its own: keeping only the last pass's counts would then show.
  [researchTurn(SONNET, 0, 'end_turn', TURN_USAGE[1]), explainToolWithUsage(SONNET, STRUCTURE_USAGE)],
  explain(),
);

// (c) for 3h: four pause_turns use up the research turns at both sites; the
// fifth request is the structuring pass, with the notes of all four turns.
await scenario(
  'anthropic.translate.research-out-of-turns',
  [...[0, 1, 2, 3].map((turn) => researchTurn(SONNET, turn, 'pause_turn')), emitToolWithUsage(SONNET, STRUCTURE_USAGE)],
  translateAnthropic(translationRequest({ allowExternalLookup: true })),
);
await scenario(
  'explain.research-out-of-turns',
  [...[0, 1, 2, 3].map((turn) => researchTurn(SONNET, turn, 'pause_turn')), explainToolWithUsage(SONNET, STRUCTURE_USAGE)],
  explain(),
);

// (b) for 3e: the error mappings' last branch. A connection that drops after
// the headers is the realistic input. For a streamed call (translate,
// Explain) MessageStream wraps the body's TypeError in a plain AnthropicError
// (lib/MessageStream.mjs, _MessageStream_handleError), which is no APIError
// subclass, with the TypeError as its cause. For messages.create
// (validateKey, gloss, compile) response.json() rejects with the TypeError
// itself; in validateKey that is the `throw toTranslationError(error)` line.
// Both landed in the last branch as kind 'api', and Gemini translate and
// compile did not catch a body read error at all. Since FOUND_ISSUES 14 every
// one of them is kind 'network'.
const dropped = (canned: Canned, bytes: number): Canned => ({ ...(canned as Extract<Canned, { status: number }>), dropAfterBytes: bytes });
await scenario('anthropic.translate.body-drop', [dropped(emitTool(SONNET), 900)], translateAnthropic(translationRequest()));
await scenario(
  'anthropic.translate.empty-event-stream',
  [{ status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_q_empty' }, body: '' }],
  translateAnthropic(translationRequest()),
);
await scenario(
  'anthropic.translate.stream-error-event',
  [
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'request-id': 'req_q_overloaded' },
      body: `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })}\n\n`,
    },
  ],
  translateAnthropic(translationRequest()),
);
await scenario('anthropic.validateKey.body-drop', [dropped(keyCheckOk, 40)], validateAnthropic(ANTHROPIC_KEY));
await scenario('explain.body-drop', [dropped(explainResearch(), 700)], explain());
await glossScenario('gloss.body-drop', [dropped(glossTool, 40)]);
await scenario('compile.anthropic.body-drop', [dropped(compiledAnthropic, 40)], compile('anthropic', SONNET));
await scenario('compile.gemini.body-drop', [dropped(compiledGemini(' A compiled account.'), 40)], compile('gemini', GEMINI_MODEL));
await scenario('gemini.translate.body-drop', [dropped(geminiOk(), 120)], translateGemini(geminiRequest()));

// (d) for 3i: Gemini's own backoff past the first wait, 403, and the two
// places Gemini reports blocked content.
const gemini429 = (retryAfter?: string): Canned => ({
  ...geminiError(429, 'Resource has been exhausted.', 'RESOURCE_EXHAUSTED'),
  headers: { 'content-type': 'application/json', ...(retryAfter === undefined ? {} : { 'retry-after': retryAfter }) },
});
await scenario('gemini.translate.429-four-times-no-retry-after', times(4, () => gemini429()), translateGemini(geminiRequest()));
await scenario(
  'gemini.translate.429-http-date-none-3-then-200',
  // An HTTP-date retry-after was NaN to the old readRetryAfter (Number()), so
  // it backed off as if none were sent. Since FOUND_ISSUES 11 the date is
  // read (retryAfterSeconds, Date.now pinned): 30 s, then 4000 ms, then the
  // 3 s asked for. Still four requests.
  [gemini429('Mon, 16 Nov 2026 12:00:30 GMT'), gemini429(), gemini429('3'), geminiOk()],
  translateGemini(geminiRequest()),
);
await scenario('gemini.translate.403', [geminiError(403, 'Permission denied.', 'PERMISSION_DENIED')], translateGemini(geminiRequest()));
await scenario(
  'gemini.translate.prohibited-content',
  [geminiStream([{ text: '[', finishReason: 'PROHIBITED_CONTENT', usage: { prompt: 300, candidates: 1 } }])],
  translateGemini(geminiRequest()),
);
await scenario(
  'gemini.translate.prompt-blocked',
  // A blocked prompt: no candidates, only promptFeedback.blockReason. Until
  // FOUND_ISSUES 14.4 GeminiProvider did not read it, so it ended as an empty
  // parse failure; it is a refusal naming the reason since.
  [
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `data: ${JSON.stringify({
        promptFeedback: { blockReason: 'PROHIBITED_CONTENT' },
        usageMetadata: { promptTokenCount: 300, totalTokenCount: 300 },
      })}\r\n\r\n`,
      pieceBytes: 23,
    },
  ],
  translateGemini(geminiRequest()),
);

// (f) compile with a bad Gemini key, which Gemini reports as 400, not 401.
await scenario(
  'compile.gemini.400',
  [geminiError(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT')],
  compile('gemini', GEMINI_MODEL),
);

// The SDK's HTTP-date branch (client.mjs retryRequest: Date.parse(header) -
// Date.now(), 30 000 ms with Date.now pinned). The older http-date scenario
// above also sends retry-after-ms, which the SDK reads first, so its Date.parse
// never runs; this one sends the date alone. The app's own reading was
// Number() of the header, NaN in both. Since FOUND_ISSUES 11 it reads the
// date, so this one reports 30 s; since 15.4 it reads retry-after-ms first, so
// the older one reports 1 s.
await scenario(
  'anthropic.translate.429-retry-after-http-date-only',
  times(3, () => anthropicError(429, { 'retry-after': 'Mon, 16 Nov 2026 12:00:30 GMT' })),
  translateAnthropic(translationRequest()),
);

// ------------------------- added after the second review (gaps 3e-3i)
//
// Like the group above, these run after every earlier scenario, so nothing
// those record (message ids included) moves.

// (3e) A 429 whose retry-after the app could not read: retry-after-ms alone
// (the SDK waits its 250 ms; the app read only retry-after, so it reported
// null until FOUND_ISSUES 15.4, and reports 0.25 s since), and no retry header
// at all (the SDK's own jittered backoff, Math.random pinned; still null).
await scenario(
  'anthropic.translate.429-retry-after-ms-only',
  times(3, () => anthropicError(429, RETRY_MS)),
  translateAnthropic(translationRequest()),
);
await scenario(
  'anthropic.translate.429-no-retry-headers',
  times(3, () => anthropicError(429)),
  translateAnthropic(translationRequest()),
);

// (3e) An in-stream error after the reply has started: message_start, a block
// and some deltas, then `event: error`. Once in the research pass, where the
// text deltas reach the progress callback before the error, and once in the
// structuring pass, part-way through the tool's arguments.
await scenario(
  'anthropic.translate.dig-deeper-stream-error-after-text',
  [
    anthropicStream({
      model: SONNET,
      blocks: [{ type: 'text', deltas: ['Looking up ', 'the example ', 'in the sources'] }],
      stop: 'end_turn',
      // message_start, content_block_start, three text deltas.
      errorAfterEvents: 5,
    }),
  ],
  translateAnthropic(translationRequest({ allowExternalLookup: true })),
);
await scenario(
  'anthropic.translate.stream-error-after-tool-deltas',
  [
    anthropicStream({
      model: SONNET,
      blocks: [{ type: 'tool_use', id: 'toolu_q_emit', name: 'emit_translation', deltas: pieces(SEGMENTS_JSON, 40) }],
      stop: 'tool_use',
      // message_start, content_block_start, three input_json deltas.
      errorAfterEvents: 5,
    }),
  ],
  translateAnthropic(translationRequest()),
);

// (3f) Several text blocks in one reply at every site that joins them. A reply
// with web search on comes back as text, server_tool_use, web_search_tool_result
// and then the answer in several text blocks; each site joins them with '\n'.
// The join shows in the next request's research notes (translate, Explain), in
// the result's raw (translate's text fallback) or in the parse error's raw
// (Explain's structuring pass, gloss), whose successful paths parse the JSON
// out and so would not show a changed separator.
function searchedTurn(model: string, toolId: string, before: string[], after: string[], stop: string): Canned {
  return anthropicStream({
    model,
    blocks: [
      ...before.map((text): AnthropicBlock => ({ type: 'text', deltas: [text] })),
      { type: 'server_tool_use', id: toolId, name: 'web_search', deltas: ['{"query":', '"example"}'] },
      {
        type: 'web_search_tool_result',
        block: {
          type: 'web_search_tool_result',
          tool_use_id: toolId,
          content: [
            { type: 'web_search_result', url: 'https://example.org/q', title: 'Example', encrypted_content: 'eq', page_age: null },
          ],
        },
      },
      ...after.map((text): AnthropicBlock => ({ type: 'text', deltas: pieces(text, 9) })),
    ],
    stop,
  });
}
await scenario(
  'anthropic.translate.dig-deeper-multi-text-blocks',
  [
    searchedTurn(SONNET, 'srvtoolu_q_multi1', ['Searching for the term.'], ['The first result says ', 'the example is synthetic.'], 'pause_turn'),
    anthropicStream({
      model: SONNET,
      blocks: [
        { type: 'text', deltas: ['One more note: '] },
        { type: 'text', deltas: ['nothing else ', 'to add.'] },
      ],
      stop: 'end_turn',
    }),
    emitTool(SONNET),
  ],
  translateAnthropic(translationRequest({ allowExternalLookup: true })),
);
await scenario(
  'anthropic.translate.text-fallback-multi-text-blocks',
  [
    anthropicStream({
      model: SONNET,
      blocks: [
        { type: 'text', deltas: ['Here is the translation ', 'as JSON.'] },
        { type: 'text', deltas: ['```json\n', SEGMENTS_ARRAY, '\n```'] },
      ],
      stop: 'end_turn',
    }),
  ],
  translateAnthropic(translationRequest()),
);
await scenario(
  'explain.research-multi-text-blocks',
  [searchedTurn(SONNET, 'srvtoolu_q_multi2', ['Looking in the library first.'], ['Passage L0 ', 'settles the meaning.'], 'end_turn'), explainTool()],
  explain(),
);
await scenario(
  'explain.structure-multi-text-blocks-neither',
  [
    explainResearch(),
    anthropicStream({
      model: SONNET,
      blocks: [
        { type: 'text', deltas: ['No structured answer.'] },
        { type: 'text', deltas: ['Only prose ', 'here.'] },
      ],
      stop: 'end_turn',
    }),
  ],
  explain(),
);
await glossScenario('gloss.multi-text-blocks-parse', [
  anthropicJson({
    model: models.ANTHROPIC_GLOSS_MODEL,
    content: [
      { type: 'text', text: 'The word means ', citations: null },
      { type: 'text', text: 'an example, roughly.', citations: null },
    ],
    stop: 'end_turn',
  }),
]);

// (3g) Cache counts null or left out, so each site's `?? 0` is reached. A null
// adds as 0 in JavaScript (`0 + null`), so the null scenarios pin only what the
// fallback value is; the absent ones are what make a dropped `?? 0` show (NaN).
// Mixed with numeric turns, so the sum across turns still shows.
const NULL_CACHE: CannedUsage = { input: 1213, output: 307, cacheRead: null, cacheWrite: null };
const ABSENT_CACHE: CannedUsage = { input: 1229, output: 311, cacheRead: undefined, cacheWrite: undefined };
await scenario('anthropic.translate.cache-usage-null', [emitToolWithUsage(SONNET, NULL_CACHE)], translateAnthropic(translationRequest()));
await scenario('anthropic.translate.cache-usage-absent', [emitToolWithUsage(SONNET, ABSENT_CACHE)], translateAnthropic(translationRequest()));
await scenario(
  'anthropic.translate.dig-deeper-cache-usage-absent-then-numbers',
  [researchTurn(SONNET, 0, 'end_turn', ABSENT_CACHE), emitToolWithUsage(SONNET, STRUCTURE_USAGE)],
  translateAnthropic(translationRequest({ allowExternalLookup: true })),
);
await scenario(
  'explain.cache-usage-null-then-numbers',
  [researchTurn(SONNET, 0, 'end_turn', NULL_CACHE), explainToolWithUsage(SONNET, STRUCTURE_USAGE)],
  explain(),
);
await scenario(
  'explain.cache-usage-numbers-then-absent',
  [researchTurn(SONNET, 0, 'end_turn', TURN_USAGE[1]), explainToolWithUsage(SONNET, ABSENT_CACHE)],
  explain(),
);

// (3i) compile's Gemini call with a 200 whose body is not the JSON it expects:
// empty, and an HTML page (a captive portal, say). Until FOUND_ISSUES 15.1
// response.json() rejected with V8's SyntaxError, which compileWithGemini did
// not catch, so the message recorded was V8's own; since, the body is read as
// text and a failed parse is an `api` TranslationError with the body as raw.
await scenario(
  'compile.gemini.200-empty-body',
  [{ status: 200, headers: { 'content-type': 'application/json' }, body: '' }],
  compile('gemini', GEMINI_MODEL),
);
await scenario(
  'compile.gemini.200-non-json',
  [{ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>Synthetic portal page</html>' }],
  compile('gemini', GEMINI_MODEL),
);

// --------------------------------------------------------- pure values

// Every model ID models.ts names, in a fixed order, plus one it does not.
const CLAUDE_IDS = Object.entries(models)
  .filter(([name, value]) => name.startsWith('CLAUDE_') && typeof value === 'string')
  .map(([, value]) => value as string)
  .sort();
const GEMINI_IDS = models.GEMINI_MODELS.map((option) => option.id);
const MODEL_IDS = [...CLAUDE_IDS, ...GEMINI_IDS, 'some-unknown-model'];
const PROVIDER_IDS: ProviderId[] = ['anthropic', 'gemini', 'offline'];
const TEXTS = { short: 'مثال', medium: 'ب'.repeat(20_000), long: 'ب'.repeat(400_000) };

const SELECTION = {
  startBlockId: 'q-book:p1:b1',
  startOffset: 3,
  endBlockId: 'q-book:p1:b4',
  endOffset: 17,
  profileId: 'profile-study-circle',
  profileVersion: 1,
  glossaryHash: glossaryHashOf(GLOSSARY),
};

values('values.glossaryHashOf', () => ({
  twoEntries: glossaryHashOf(GLOSSARY),
  reversed: glossaryHashOf([...GLOSSARY].reverse()),
  empty: glossaryHashOf([]),
  noteChanged: glossaryHashOf([GLOSSARY[0], { ...GLOSSARY[1], note: 'changed' }]),
}));

values('values.cacheKeyFor', () => {
  const byProvider: Record<string, Record<string, string>> = {};
  for (const providerId of PROVIDER_IDS) {
    byProvider[providerId] = {};
    for (const model of [SONNET, GEMINI_MODEL]) byProvider[providerId][model] = cacheKeyFor({ ...SELECTION, providerId, model });
  }
  const base = { ...SELECTION, providerId: 'gemini' as const, model: GEMINI_MODEL };
  return {
    byProvider,
    glossaryHashChanged: cacheKeyFor({ ...base, glossaryHash: 'changed' }),
    versionChanged: cacheKeyFor({ ...base, profileVersion: 2 }),
    startOffsetChanged: cacheKeyFor({ ...base, startOffset: 4 }),
    endOffsetChanged: cacheKeyFor({ ...base, endOffset: 18 }),
    profileChanged: cacheKeyFor({ ...base, profileId: 'profile-other' }),
  };
});

values('values.compileCacheKey', () => {
  const base = { ayahKey: '1:1', resourceIds: ['tafsir-b', 'tafsir-a', 'topics'], providerId: 'anthropic' as const, model: SONNET };
  return {
    base: compileCacheKey(base),
    resourcesReordered: compileCacheKey({ ...base, resourceIds: ['topics', 'tafsir-a', 'tafsir-b'] }),
    resourceAdded: compileCacheKey({ ...base, resourceIds: [...base.resourceIds, 'similar'] }),
    gemini: compileCacheKey({ ...base, providerId: 'gemini', model: GEMINI_MODEL }),
    otherModel: compileCacheKey({ ...base, model: OPUS }),
    otherAyah: compileCacheKey({ ...base, ayahKey: '1:2' }),
  };
});

values('values.budgets', () => {
  const byModel: Record<string, unknown> = {};
  for (const model of MODEL_IDS) {
    const lengths: Record<string, unknown> = {};
    for (const [name, text] of Object.entries(TEXTS)) {
      lengths[name] = {
        maxTokensFor: models.maxTokensFor(text, 4, model),
        maxTokensForMultiplier6: models.maxTokensFor(text, 6, model),
        explainStructureMaxTokens: models.explainStructureMaxTokens(text, model),
      };
    }
    byModel[model] = {
      outputCeilingFor: models.outputCeilingFor(model),
      outputConfigFor: models.outputConfigFor(model),
      successorModel: models.successorModel(model),
      isClaudeModel: models.isClaudeModel(model),
      lengths,
    };
  }
  const withoutModel: Record<string, number> = {};
  for (const [name, text] of Object.entries(TEXTS)) withoutModel[name] = models.maxTokensFor(text);
  return { MAX_TOKENS_CEILING: models.MAX_TOKENS_CEILING, withoutModel, byModel };
});

values('values.costOf', () => {
  const usages = {
    typical: { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 2_000, cacheWriteTokens: 300 },
    overLongContext: { inputTokens: 150_000, outputTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
  const out: Record<string, unknown> = {};
  for (const model of MODEL_IDS) {
    out[model] = { typical: costOf(model, usages.typical), overLongContext: costOf(model, usages.overLongContext) };
  }
  return out;
});

values('values.registry', () => {
  const describe = (provider: ReturnType<typeof registry.providerFor>) => ({
    id: provider.id,
    displayName: provider.displayName,
    isFree: provider.isFree,
    keyHelpUrl: provider.keyHelpUrl,
    fitFor: provider.fitFor,
    availableModels: provider.availableModels,
    defaultModel: provider.defaultModel,
  });
  const byId: Record<string, unknown> = {};
  for (const id of PROVIDER_IDS) {
    const findModelOption: Record<string, unknown> = {};
    for (const model of MODEL_IDS) findModelOption[model] = registry.findModelOption(id, model);
    byId[id] = {
      providerFor: registry.providerFor(id).id,
      badgeFor: registry.badgeFor(id),
      modelsFor: registry.modelsFor(id),
      modelsForIsProviderArray: registry.modelsFor(id) === registry.providerFor(id).availableModels,
      defaultModelFor: registry.defaultModelFor(id),
      findModelOption,
    };
  }
  return {
    allProviders: registry.allProviders().map(describe),
    cloudProviderIds: registry.cloudProviderIds(),
    PROVIDER_ORDER: registry.PROVIDER_ORDER,
    DEFAULT_PROVIDER_ID: registry.DEFAULT_PROVIDER_ID,
    OFFLINE_PROVIDER_ID: registry.OFFLINE_PROVIDER_ID,
    byId,
    createDefaultProfile: createDefaultProfile(),
  };
});

values('values.secrets', () => {
  storageMap.clear();
  const snapshot = () => Object.fromEntries([...storageMap.entries()].sort());
  const reads = () =>
    Object.fromEntries(
      PROVIDER_IDS.map((id) => [id, { get: secrets.getProviderKey(id), has: secrets.hasProviderKey(id) }]),
    );
  const steps: Record<string, unknown> = {
    API_KEY_STORAGE_KEYS,
    initially: { storage: snapshot(), reads: reads(), hasAnyProviderKey: secrets.hasAnyProviderKey() },
  };
  secrets.setProviderKey('gemini', '  q-secrets-gemini  ');
  steps.afterGemini = { storage: snapshot(), reads: reads(), hasAnyProviderKey: secrets.hasAnyProviderKey() };
  secrets.setProviderKey('anthropic', 'q-secrets-anthropic');
  steps.afterAnthropic = { storage: snapshot(), reads: reads(), hasAnyProviderKey: secrets.hasAnyProviderKey() };
  secrets.setProviderKey('gemini', '   ');
  secrets.setProviderKey('anthropic', '');
  steps.afterClearing = { storage: snapshot(), reads: reads(), hasAnyProviderKey: secrets.hasAnyProviderKey() };
  secrets.setSunnahKey('q-secrets-sunnah');
  steps.sunnah = { storage: snapshot(), get: secrets.getSunnahKey(), hasAnyProviderKey: secrets.hasAnyProviderKey() };
  storageMap.clear();
  return steps;
});

// For 3n: the offline model ids, which MODEL_IDS above does not hold, through
// every function 3n moves or that takes a model id, for every provider id.
values('values.offlineModels', () => {
  const ids = [...OFFLINE_MODELS.map((model) => model.id), 'some-unknown-model'];
  const byProvider: Record<string, unknown> = {};
  for (const providerId of PROVIDER_IDS) {
    const byModel: Record<string, unknown> = {};
    for (const model of ids) byModel[model] = registry.findModelOption(providerId, model);
    byProvider[providerId] = { findModelOption: byModel, defaultModelFor: registry.defaultModelFor(providerId) };
  }
  const byModel: Record<string, unknown> = {};
  for (const model of ids) {
    byModel[model] = {
      offlineModelById: offlineModelById(model).id,
      outputCeilingFor: models.outputCeilingFor(model),
      outputConfigFor: models.outputConfigFor(model),
      successorModel: models.successorModel(model),
      isClaudeModel: models.isClaudeModel(model),
      costOf: costOf(model, { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 2_000, cacheWriteTokens: 300 }),
    };
  }
  return { OFFLINE_MODELS, byProvider, byModel };
});

// Added in 3m (plan Design §8): the legacy-profile inference AppContext ran
// inline, `isClaudeModel(profile.model) ? 'anthropic' : 'gemini'`, now the
// registry's providerIdForModel. Every model id Q knows, the offline ones, and
// the empty string.
values('values.providerIdForModel', () => {
  const ids = [...MODEL_IDS, ...OFFLINE_MODELS.map((model) => model.id), 'some-model', ''];
  return Object.fromEntries(ids.map((model) => [model, registry.providerIdForModel(model)]));
});

// Added in 3q (plan Design §8): the Explain card's model, which
// useExplanations computed inline as `isClaudeModel(activeProfile.model) ?
// activeProfile.model : ANTHROPIC_EXPLAIN_FALLBACK_MODEL`, now explain.ts's
// explainModelFor. The same ids as the section above.
values('values.explainModelFor', () => {
  const ids = [...MODEL_IDS, ...OFFLINE_MODELS.map((model) => model.id), 'some-model', ''];
  return Object.fromEntries(ids.map((model) => [model, explainModelFor(model)]));
});

// ------------------------------------------- the SDK-import allowlist (Q12)

// Which files may import `@anthropic-ai/sdk` as a value (a type-only import is
// allowed anywhere), and which may name GEMINI_BASE. Through Phase 3 the
// lists were a superset that still named the call sites building their own
// client or URL; step 3r narrowed them to the end state (plan Design §10):
// the SDK as a value only in translation/anthropic.ts and AnthropicProvider.ts
// (which needs the SDK's error classes in validateKey), GEMINI_BASE only where
// it is defined and in translation/gemini.ts and GeminiProvider.ts (its key
// check's GET). A new file on either list is a decision, made in review.
const SDK_VALUE_IMPORTERS_ALLOWED = [
  'src/translation/anthropic.ts',
  'src/translation/providers/AnthropicProvider.ts',
];
const GEMINI_BASE_USERS_ALLOWED = [
  'src/translation/models.ts', // where it is defined
  'src/translation/gemini.ts',
  'src/translation/providers/GeminiProvider.ts',
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) out.push(path);
  }
  return out.sort();
}

const sdkImports: { file: string; kind: 'value' | 'type' }[] = [];
const geminiBaseUsers: string[] = [];
const geminiHostFiles: string[] = [];
for (const path of sourceFiles(join(ROOT, 'src'))) {
  const file = relative(ROOT, path).split('\\').join('/');
  const text = readFileSync(path, 'utf8');
  const statements = text.matchAll(/(?:^|\n)\s*(import|export)\s+([^;]*?)\s*from\s*['"]@anthropic-ai\/sdk(?:\/[^'"]*)?['"]/g);
  for (const match of statements) {
    const clause = match[2].trim();
    const named = clause.match(/\{([^}]*)\}/);
    const hasDefaultOrNamespace = clause.replace(/\{[^}]*\}/, '').replace(/^type\s+/, '').replace(/,/g, '').trim() !== '';
    const typeOnly =
      /^type\s/.test(clause) ||
      (!hasDefaultOrNamespace &&
        named !== null &&
        named[1].split(',').map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith('type ')));
    sdkImports.push({ file, kind: typeOnly ? 'type' : 'value' });
  }
  if (/import\s*\(\s*['"]@anthropic-ai\/sdk/.test(text) || /(?:^|\n)\s*import\s+['"]@anthropic-ai\/sdk/.test(text)) {
    sdkImports.push({ file, kind: 'value' });
  }
  if (/\bGEMINI_BASE\b/.test(text)) geminiBaseUsers.push(file);
  if (text.includes('generativelanguage.googleapis.com')) geminiHostFiles.push(file);
}
for (const { file, kind } of sdkImports) {
  if (kind === 'value' && !SDK_VALUE_IMPORTERS_ALLOWED.includes(file)) {
    harnessFail('allowlist', `${file} imports @anthropic-ai/sdk as a value`);
  }
}
for (const file of geminiBaseUsers) {
  if (!GEMINI_BASE_USERS_ALLOWED.includes(file)) harnessFail('allowlist', `${file} names GEMINI_BASE`);
}
for (const file of geminiHostFiles) {
  if (file !== 'src/translation/models.ts') harnessFail('allowlist', `${file} names the Gemini host`);
}

// ------------------------------------------------------------- the result

const scenarioCount = record.filter((entry) => 'requests' in entry).length;
const requestCount = record.reduce((sum, entry) => sum + (Array.isArray(entry.requests) ? entry.requests.length : 0), 0);
const recordFile = {
  check: 'Q — recorded requests (scripts/verify-requests.ts)',
  masked: [
    ...[...MASKED_HEADERS].map((name) => `${name}: ${MASK}`),
    `SyntaxError message: ${SYNTAX_ERROR_MASK}`,
  ],
  pinned: {
    dateNow: new Date(FIXED_NOW).toISOString(),
    mathRandom: 0.5,
    defaultLocale: 'en-US',
    'setTimeout under 60 s': 'recorded in waits, run at 0 ms',
  },
  entries: record,
};
const text = `${JSON.stringify(recordFile, null, 2)}\n`;
const elapsed = ((performance.now() - started) / 1000).toFixed(2);

console.log(`Check Q: ${scenarioCount} call-site scenarios, ${requestCount} requests, ${record.length - scenarioCount} value sections; ${Buffer.byteLength(text).toLocaleString()} bytes; ${elapsed} s.`);
if (scrubbedEnv.length > 0) console.log(`  environment: removed ${scrubbedEnv.join(', ')} for this run (the browser has no process.env)`);
console.log(
  `  SDK imports: ${sdkImports.map(({ file, kind }) => `${file} (${kind})`).join(', ')}\n` +
    `  GEMINI_BASE: ${geminiBaseUsers.join(', ')}`,
);

for (const entry of record) {
  if (entry.unusedResponses) harnessFail(entry.id, `${String(entry.unusedResponses)} canned response(s) not requested`);
}

if (harnessFailures.length > 0) {
  console.log(`\nFAIL: ${harnessFailures.length} harness assertion(s)`);
  for (const failure of harnessFailures) console.log(`  ${failure}`);
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

let expectedText: string;
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

// Report each differing entry with its first differing lines.
const expected = JSON.parse(expectedText) as typeof recordFile;
const expectedById = new Map(expected.entries.map((entry) => [entry.id, entry]));
const actualById = new Map(record.map((entry) => [entry.id, entry]));
const differing: string[] = [];
for (const id of new Set([...expectedById.keys(), ...actualById.keys()])) {
  const before = expectedById.get(id);
  const after = actualById.get(id);
  if (!before || !after) {
    differing.push(`${id}: ${before ? 'missing from this run' : 'not in the record'}`);
    continue;
  }
  const beforeLines = JSON.stringify(before, null, 2).split('\n');
  const afterLines = JSON.stringify(after, null, 2).split('\n');
  const first = beforeLines.findIndex((line, index) => line !== afterLines[index]);
  if (first === -1 && beforeLines.length === afterLines.length) continue;
  const at = first === -1 ? beforeLines.length : first;
  // A request body is one long line, so the excerpt starts a little before the
  // first character that differs rather than at the start of the line.
  const beforeLine = beforeLines[at] ?? '';
  const afterLine = afterLines[at] ?? '';
  let column = 0;
  while (column < beforeLine.length && beforeLine[column] === afterLine[column]) column++;
  const from = column > 120 ? column - 60 : 0;
  const excerpt = (lines: string[]) =>
    lines
      .slice(at, at + 3)
      .map((line, index) => `      ${index === 0 && from > 0 ? `…${line.slice(from, from + 200)}` : line.slice(0, 200)}`)
      .join('\n');
  differing.push(
    `${id}: first difference at line ${at + 1} of the entry, column ${column + 1}\n    record:\n${excerpt(beforeLines)}\n    this run:\n${excerpt(afterLines)}`,
  );
}
if (differing.length === 0) differing.push('(every entry is equal; the header or the formatting differs)');
console.log(`\nFAIL: ${differing.length} entr${differing.length === 1 ? 'y differs' : 'ies differ'} from ${relative(ROOT, RECORD_PATH)}`);
for (const line of differing) console.log(`  ${line}`);
process.exit(1);
