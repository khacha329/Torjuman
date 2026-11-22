import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { HadithIndexPart, HadithJsonEntry, QulEntry, QulResource } from '../types';
import { delay } from '../lib/delay';
import {
  buildHadithIndex,
  candidateNumbers,
  findHadithByText,
  INDEX_VERSION,
  type HadithTextIndex,
  type TextMatchOptions,
  type TextMatchResult,
} from './hadithText';

// The ḥadīth text index, stored and loaded (step 3 of
// docs/plans/hadith-text-matching.md).
//
// ---------------------------------------------------------------------------
// Where it lives
//
// As extra rows of the hadith-json resource it was built from, in the QUL
// entry store: `idx:<collection>:<part>`, sixteen parts. No new store, so no
// schema change on any tablet (trap 6), and the one range delete that removes
// a collection (deleteQulResource) removes its index with it. The keys cannot
// collide with the ḥadīth rows, which are `<collection>:<number>`.
//
// When it is built
//
// At import, from the entries already in memory, before the resource row is
// written — the same order the ḥadīth rows follow, so an interrupted import
// leaves rows nothing reads. And on first use for a collection imported before
// the index existed (the owner's tablet has some): the ḥadīth rows are read
// back in batches, the index is built and written, and the next load reads it.
// A part of another INDEX_VERSION is treated as missing, so a format change
// rebuilds rather than misreads.
//
// Loaded per collection, only when asked for, and kept in memory for the
// session: a tap in a Bukhārī sharḥ loads Bukhārī's 3 MB and nothing else. The
// memo is keyed by resource id and import time, so a re-import or a delete is
// never served the old index.
// ---------------------------------------------------------------------------

/** Parts per collection, by the top four bits of the window hash. */
export const INDEX_PARTS = 16;

/** Ḥadīth rows read per transaction while rebuilding an index from storage. */
const READ_BATCH = 500;

export function indexPartKey(collection: string, part: number): string {
  return `idx:${collection}:${part}`;
}

// ------------------------------------------------------------------ base64

function toBase64(array: Uint32Array): string {
  const bytes = new Uint8Array(array.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < array.length; i++) view.setUint32(i * 4, array[i], true);
  // In slices: String.fromCharCode over a few megabytes of arguments at once
  // overflows the call stack.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint32Array | null {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  if (binary.length % 4 !== 0) return null;
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const out = new Uint32Array(binary.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint32(i * 4, true);
  return out;
}

// -------------------------------------------------------------- encode/decode

/** An index as its sixteen stored parts; part 0 carries the counts and the build time. */
export function encodeIndex(index: HadithTextIndex, builtMs: number): HadithIndexPart[] {
  const parts: HadithIndexPart[] = [];
  let start = 0;
  for (let part = 0; part < INDEX_PARTS; part++) {
    let end = start;
    while (end < index.keys.length && index.keys[end] >>> 28 === part) end++;
    parts.push({
      t: 'hadith-index',
      v: index.version,
      collection: index.collection,
      part,
      keys: toBase64(index.keys.subarray(start, end)),
      values: toBase64(index.values.subarray(start, end)),
      ...(part === 0
        ? { entries: index.entries, positions: index.keys.length, builtMs: Math.round(builtMs) }
        : {}),
    });
    start = end;
  }
  return parts;
}

/**
 * The index back from its parts, or null when anything is off: a part
 * missing, of another version or collection, undecodable, or out of order.
 * Null means "rebuild", never "no ḥadīth".
 */
export function decodeIndex(
  collection: string,
  parts: readonly (HadithIndexPart | undefined)[],
): HadithTextIndex | null {
  if (parts.length !== INDEX_PARTS) return null;
  const keyRuns: Uint32Array[] = [];
  const valueRuns: Uint32Array[] = [];
  for (let part = 0; part < INDEX_PARTS; part++) {
    const stored = parts[part];
    if (!stored || stored.v !== INDEX_VERSION || stored.collection !== collection || stored.part !== part) {
      return null;
    }
    const keys = fromBase64(stored.keys);
    const values = fromBase64(stored.values);
    if (!keys || !values || keys.length !== values.length) return null;
    for (const key of keys) if (key >>> 28 !== part) return null;
    keyRuns.push(keys);
    valueRuns.push(values);
  }
  const join = (runs: Uint32Array[]) => {
    const out = new Uint32Array(runs.reduce((n, run) => n + run.length, 0));
    let at = 0;
    for (const run of runs) {
      out.set(run, at);
      at += run.length;
    }
    return out;
  };
  const keys = join(keyRuns);
  for (let i = 1; i < keys.length; i++) if (keys[i - 1] > keys[i]) return null;
  return {
    collection,
    version: INDEX_VERSION,
    keys,
    values: join(valueRuns),
    entries: parts[0]?.entries ?? 0,
  };
}

// ------------------------------------------------------------------- build

export interface IndexProgress {
  collection: string;
  /** 'reading' only when rebuilding from storage; 'building' always. */
  stage: 'reading' | 'building';
  done: number;
  total: number;
}

/**
 * Build a collection's index and write its parts under `resourceId`.
 *
 * Yields to the event loop after every BUILD_CHUNK ḥadīth (a macrotask, so the
 * import screen repaints), and reports progress when asked.
 */
export async function writeHadithIndex(
  storage: StorageAdapter,
  resourceId: string,
  collection: string,
  entries: readonly Pick<HadithJsonEntry, 'number' | 'arabic'>[],
  onProgress?: (progress: IndexProgress) => void,
): Promise<HadithTextIndex> {
  const started = Date.now();
  const index = await buildHadithIndex(collection, entries, {
    onChunk: async (done) => {
      onProgress?.({ collection, stage: 'building', done, total: entries.length });
      await delay(0);
    },
  });
  const builtMs = Date.now() - started;
  await storage.putQulEntries(
    encodeIndex(index, builtMs).map((value, part) => ({
      id: `${resourceId}|${indexPartKey(collection, part)}`,
      resourceId,
      key: indexPartKey(collection, part),
      value,
    })),
  );
  return index;
}

async function readParts(
  storage: StorageAdapter,
  resource: QulResource,
  collection: string,
): Promise<(HadithIndexPart | undefined)[]> {
  const keys = Array.from({ length: INDEX_PARTS }, (_, part) => indexPartKey(collection, part));
  const rows = await storage.getQulEntries(resource.id, keys);
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return keys.map((key) => {
    const value = byKey.get(key);
    return value?.t === 'hadith-index' ? value : undefined;
  });
}

/** Every ḥadīth row of a resource, read back by number in batches. */
async function readEntries(
  storage: StorageAdapter,
  resource: QulResource,
  collection: string,
  onProgress?: (progress: IndexProgress) => void,
): Promise<HadithJsonEntry[]> {
  const out: HadithJsonEntry[] = [];
  for (let from = 1; from <= resource.entryCount; from += READ_BATCH) {
    const keys: string[] = [];
    for (let n = from; n < from + READ_BATCH && n <= resource.entryCount; n++) {
      keys.push(`${collection}:${n}`);
    }
    for (const row of await storage.getQulEntries(resource.id, keys)) {
      if (row.value.t === 'hadith-json') out.push(row.value);
    }
    onProgress?.({
      collection,
      stage: 'reading',
      done: Math.min(from + READ_BATCH - 1, resource.entryCount),
      total: resource.entryCount,
    });
  }
  return out;
}

// -------------------------------------------------------------------- load

export interface LoadedIndex {
  resource: QulResource;
  index: HadithTextIndex;
}

const memo = new Map<string, Promise<HadithTextIndex>>();

const memoKey = (resource: QulResource) => `${resource.id}@${resource.importedAt}`;

/**
 * The indexes of the imported collections among `collections`, in that order
 * (the order is the matcher's priority). A collection not imported is left
 * out. Missing or stale parts are rebuilt and written first — the "self-heal"
 * for collections imported before the index existed — with progress reported.
 *
 * Collections come from the stored resources (`resource.collection`), not the
 * registry, so a check can seed a synthetic one.
 */
export async function loadHadithIndexes(
  storage: StorageAdapter,
  collections: readonly string[],
  onProgress?: (progress: IndexProgress) => void,
): Promise<LoadedIndex[]> {
  const resources = (await storage.listQulResources()).filter(
    (resource) => resource.kind === 'hadith-json' && resource.collection,
  );
  // Forget what was deleted or replaced, so its arrays can be collected.
  const live = new Set(resources.map(memoKey));
  for (const key of memo.keys()) if (!live.has(key)) memo.delete(key);

  const loaded: LoadedIndex[] = [];
  for (const collection of collections) {
    const resource = resources.find((r) => r.collection === collection);
    if (!resource) continue;
    const key = memoKey(resource);
    let pending = memo.get(key);
    if (!pending) {
      pending = loadOne(storage, resource, collection, onProgress);
      memo.set(key, pending);
      // A failed load is not remembered: the next call tries again.
      pending.catch(() => memo.delete(key));
    }
    loaded.push({ resource, index: await pending });
  }
  return loaded;
}

async function loadOne(
  storage: StorageAdapter,
  resource: QulResource,
  collection: string,
  onProgress?: (progress: IndexProgress) => void,
): Promise<HadithTextIndex> {
  const decoded = decodeIndex(collection, await readParts(storage, resource, collection));
  if (decoded) return decoded;
  const entries = await readEntries(storage, resource, collection, onProgress);
  return writeHadithIndex(storage, resource.id, collection, entries, onProgress);
}

/** For tests: forget every loaded index. */
export function forgetLoadedIndexes(): void {
  memo.clear();
}

// ------------------------------------------------------------------ status

export type IndexStatus =
  | { built: true; positions: number; builtMs: number | null }
  | { built: false; reason: 'missing' | 'stale' };

/** What Settings says about a collection's index, from part 0 alone. */
export async function hadithIndexStatus(
  storage: StorageAdapter,
  resource: QulResource,
): Promise<IndexStatus> {
  if (!resource.collection) return { built: false, reason: 'missing' };
  const row = await storage.getQulEntry(resource.id, indexPartKey(resource.collection, 0));
  if (!row || row.value.t !== 'hadith-index') return { built: false, reason: 'missing' };
  if (row.value.v !== INDEX_VERSION) return { built: false, reason: 'stale' };
  return { built: true, positions: row.value.positions ?? 0, builtMs: row.value.builtMs ?? null };
}

// ------------------------------------------------------------------ search

/**
 * `findHadithByText` over stored collections: names the candidates, reads
 * their Arabic (one read per collection), then matches. The two calls get the
 * same indexes and mode, which is the contract that makes `arabicOf` complete.
 */
export async function searchHadithText(
  storage: StorageAdapter,
  loaded: readonly LoadedIndex[],
  text: string,
  options: TextMatchOptions,
): Promise<TextMatchResult & { entries: Map<string, HadithJsonEntry> }> {
  const indexes = loaded.map((item) => item.index);
  const wanted = candidateNumbers(indexes, text, options.mode);
  const entries = new Map<string, HadithJsonEntry>();
  for (const { resource, index } of loaded) {
    const numbers = wanted.get(index.collection);
    if (!numbers?.length) continue;
    const rows: QulEntry[] = await storage.getQulEntries(
      resource.id,
      numbers.map((n) => `${index.collection}:${n}`),
    );
    for (const row of rows) {
      if (row.value.t === 'hadith-json') entries.set(`${index.collection}:${row.value.number}`, row.value);
    }
  }
  const result = findHadithByText(indexes, text, {
    ...options,
    arabicOf: (collection, number) => entries.get(`${collection}:${number}`)?.arabic,
  });
  return { ...result, entries };
}
