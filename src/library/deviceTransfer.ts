import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import { API_KEY_STORAGE_KEYS } from '../app/secrets';

// Moving everything on one tablet to another, as one file.
//
// The per-book transfer (transfer.ts) and the work backup exist for picking
// things up piecemeal. This is the other case: the same person, a second
// tablet, and the wish to carry on exactly where they left off — books, QUL
// resources, Itqan narrator profiles, dictionaries, biographies, glossary,
// cards, marks, reading positions and settings, without fetching or importing
// any of it again.
//
// So it is deliberately a copy, not a curated export. Every store travels row
// for row, untouched, including the stored page HTML that transfer.ts drops:
// the receiving tablet must be able to re-parse a book exactly as the sending
// one could. Nothing is recomputed on arrival, so nothing can come out
// different.
//
// The receiving tablet is REPLACED, not merged. Restoring reads the whole file
// twice: once to prove it is complete and readable, writing nothing, and only
// then — after the user confirms — to clear the database and write. A file cut
// short in transit is refused before anything on the tablet is touched.

export const DEVICE_TRANSFER_FORMAT = 'hashiya-device';
export const DEVICE_TRANSFER_VERSION = 1;
export const DEVICE_TRANSFER_EXTENSION = '.hashiya-device.gz';

/** Prefix of every localStorage entry the app writes. */
const LOCAL_PREFIX = 'shamela-reader.';

/**
 * Rows per line. Large enough that the per-line overhead vanishes, small
 * enough that one line — a batch of pages with their HTML — stays a few MB.
 */
const BATCH = 250;

/**
 * NDJSON, gzipped. One header, then batches of rows, then the app's own
 * localStorage, then an end marker.
 *
 * The header's counts and the end marker are what make truncation detectable:
 * a file that stops early is otherwise a valid, smaller database.
 */
interface HeaderLine {
  kind: 'header';
  format: typeof DEVICE_TRANSFER_FORMAT;
  version: number;
  /** The database schema version that wrote it. Must match the reader's. */
  schemaVersion: number;
  exportedAt: number;
  counts: Record<string, number>;
  includesApiKeys: boolean;
}

interface RowsLine {
  kind: 'rows';
  store: string;
  rows: unknown[];
}

interface LocalLine {
  kind: 'local';
  items: Record<string, string>;
}

interface EndLine {
  kind: 'end';
  rows: number;
}

type Line = HeaderLine | RowsLine | LocalLine | EndLine;

/** The slice of localStorage this needs, so it can be tested without a browser. */
export interface LocalStore {
  keys(): string[];
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const browserLocalStore: LocalStore = {
  keys: () => {
    try {
      return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key): key is string => key !== null);
    } catch {
      return [];
    }
  },
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private browsing or blocked site data. The database still restored.
    }
  },
};

export interface DeviceTransferProgress {
  phase: 'counting' | 'writing' | 'checking' | 'restoring' | 'done';
  done: number;
  total: number;
  message: string;
}

type OnProgress = (progress: DeviceTransferProgress) => void;

/** What a transfer file holds, read without writing anything. */
export interface DeviceTransferSummary {
  exportedAt: number;
  counts: Record<string, number>;
  totalRows: number;
  includesApiKeys: boolean;
  /** Size once decompressed — roughly what it will take up on arrival. */
  uncompressedBytes: number;
}

// ------------------------------------------------------------------ export

/**
 * Write every store to one compressed file.
 *
 * Streamed, store by store and batch by batch, rather than assembled in memory:
 * a library of several books is hundreds of megabytes of text, and a tablet
 * that ran out of memory half way through would lose the export and possibly
 * the tab.
 */
export async function exportDevice(
  storage: StorageAdapter,
  options: { includeApiKeys: boolean; local?: LocalStore; onProgress?: OnProgress },
): Promise<Blob> {
  const local = options.local ?? browserLocalStore;
  const onProgress = options.onProgress ?? (() => {});

  onProgress({ phase: 'counting', done: 0, total: 1, message: 'Counting what to send…' });

  const stores = storage.listStoreNames();
  const counts: Record<string, number> = {};
  for (const store of stores) counts[store] = await storage.countStoreRows(store);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const items: Record<string, string> = {};
  for (const key of local.keys()) {
    if (!key.startsWith(LOCAL_PREFIX)) continue;
    if (!options.includeApiKeys && API_KEY_STORAGE_KEYS.includes(key)) continue;
    const value = local.get(key);
    if (value !== null) items[key] = value;
  }

  const header: HeaderLine = {
    kind: 'header',
    format: DEVICE_TRANSFER_FORMAT,
    version: DEVICE_TRANSFER_VERSION,
    schemaVersion: storage.schemaVersion,
    exportedAt: Date.now(),
    counts,
    includesApiKeys: options.includeApiKeys,
  };

  // A pull-driven stream: the next batch is read only when compression has
  // taken the previous one, so memory stays at about one batch.
  let storeIndex = 0;
  let after: unknown = undefined;
  let written = 0;
  let stage: 'header' | 'rows' | 'local' | 'end' | 'closed' = 'header';

  const lines = new ReadableStream<string>({
    async pull(controller) {
      if (stage === 'header') {
        controller.enqueue(toLine(header));
        stage = 'rows';
        return;
      }

      if (stage === 'rows') {
        while (storeIndex < stores.length) {
          const store = stores[storeIndex];
          const { rows, lastKey } = await storage.readStoreRows(store, after, BATCH);
          if (rows.length === 0) {
            storeIndex++;
            after = undefined;
            continue;
          }
          after = lastKey;
          written += rows.length;
          controller.enqueue(toLine({ kind: 'rows', store, rows } satisfies RowsLine));
          onProgress({
            phase: 'writing',
            done: written,
            total,
            message: `Packing ${store} — ${written.toLocaleString()} of ${total.toLocaleString()} records…`,
          });
          return;
        }
        stage = 'local';
      }

      if (stage === 'local') {
        controller.enqueue(toLine({ kind: 'local', items } satisfies LocalLine));
        stage = 'end';
        return;
      }

      if (stage === 'end') {
        controller.enqueue(toLine({ kind: 'end', rows: written } satisfies EndLine));
        stage = 'closed';
        controller.close();
      }
    },
  });

  const bytes = lines.pipeThrough(new TextEncoderStream());
  const blob =
    typeof CompressionStream === 'undefined'
      ? // Uncompressed rather than no transfer at all. The reader tells the
        // two apart by content, not by the filename.
        await new Response(bytes).blob()
      : await new Response(bytes.pipeThrough(new CompressionStream('gzip'))).blob();

  // Rows can change while the export runs if the user keeps working. Saying
  // so beats a file whose header disagrees with its body, which the reader
  // would rightly refuse.
  if (written !== total) {
    throw new Error(
      'The library changed while the transfer file was being written. Try again without using the app in the meantime.',
    );
  }

  onProgress({ phase: 'done', done: total, total, message: 'Ready to send.' });
  return new File([blob], deviceTransferFilename(header.exportedAt), {
    type: 'application/gzip',
  });
}

export function deviceTransferFilename(at: number = Date.now()): string {
  return `hashiya-tablet-${new Date(at).toISOString().slice(0, 10)}${DEVICE_TRANSFER_EXTENSION}`;
}

// -------------------------------------------------------------------- read

/**
 * Pass 1: read the whole file and prove it is complete, writing nothing.
 *
 * Every way a file can be wrong is checked here, before the user is even asked
 * to confirm, so that the destructive pass cannot discover a problem after it
 * has already emptied the tablet.
 */
export async function inspectDeviceFile(
  file: Blob,
  storage: StorageAdapter,
  onProgress: OnProgress = () => {},
): Promise<DeviceTransferSummary> {
  let header: HeaderLine | null = null;
  let ended: EndLine | null = null;
  const seen: Record<string, number> = {};
  let seenTotal = 0;
  const size = { bytes: 0 };
  const localStores = new Set(storage.listStoreNames());

  for await (const line of readLines(file, size)) {
    if (ended) throw new Error('The file continues past its end marker, so it is not a transfer file.');

    if (!header) {
      header = parseHeader(line, storage.schemaVersion);
      for (const store of Object.keys(header.counts)) {
        if (!localStores.has(store)) {
          throw new Error(
            `The file holds "${store}", which this version of the app does not have. Update the app on both tablets and try again.`,
          );
        }
      }
      continue;
    }

    if (line.kind === 'rows') {
      if (!(line.store in header.counts)) {
        throw new Error(`The file holds rows for "${line.store}" that its header does not list.`);
      }
      if (!Array.isArray(line.rows)) throw new Error('The file is damaged: a batch of rows is not a list.');
      seen[line.store] = (seen[line.store] ?? 0) + line.rows.length;
      seenTotal += line.rows.length;
      onProgress({
        phase: 'checking',
        done: seenTotal,
        total: totalOf(header.counts),
        message: `Checking the file — ${seenTotal.toLocaleString()} records read…`,
      });
      continue;
    }

    if (line.kind === 'local') continue;
    if (line.kind === 'end') {
      ended = line;
      continue;
    }

    throw new Error('The file is damaged: it contains a line of an unknown kind.');
  }

  if (!header) throw new Error('The file is empty.');

  const expected = totalOf(header.counts);
  const short = Object.entries(header.counts).find(([store, count]) => (seen[store] ?? 0) !== count);
  if (!ended || short || ended.rows !== seenTotal || seenTotal !== expected) {
    throw new Error(
      `The file is incomplete: ${seenTotal.toLocaleString()} of ${expected.toLocaleString()} records arrived. ` +
        'It was probably cut short while being sent. Send it again from the other tablet.',
    );
  }

  return {
    exportedAt: header.exportedAt,
    counts: header.counts,
    totalRows: expected,
    includesApiKeys: header.includesApiKeys,
    uncompressedBytes: size.bytes,
  };
}

/**
 * Pass 2: empty this tablet and write the file into it.
 *
 * Only after `inspectDeviceFile` has accepted the same file and the user has
 * confirmed. localStorage entries from the file are written over this
 * tablet's; nothing else in localStorage is removed, so a key entered only on
 * this tablet survives a file that was sent without keys.
 */
export async function restoreDevice(
  file: Blob,
  storage: StorageAdapter,
  options: { local?: LocalStore; onProgress?: OnProgress } = {},
): Promise<void> {
  const local = options.local ?? browserLocalStore;
  const onProgress = options.onProgress ?? (() => {});

  let total = 0;
  let restored = 0;
  let cleared = false;

  for await (const line of readLines(file)) {
    if (line.kind === 'header') {
      const header = parseHeader(line, storage.schemaVersion);
      total = totalOf(header.counts);
      await storage.clearAllStores();
      cleared = true;
      continue;
    }
    if (!cleared) throw new Error('The file does not start with a header.');

    if (line.kind === 'rows') {
      await storage.putStoreRows(line.store, line.rows);
      restored += line.rows.length;
      onProgress({
        phase: 'restoring',
        done: restored,
        total,
        message: `Restoring ${line.store} — ${restored.toLocaleString()} of ${total.toLocaleString()} records…`,
      });
      continue;
    }

    if (line.kind === 'local') {
      for (const [key, value] of Object.entries(line.items)) {
        if (key.startsWith(LOCAL_PREFIX)) local.set(key, value);
      }
    }
  }

  onProgress({ phase: 'done', done: restored, total, message: 'Done.' });
}

/**
 * Whether this tablet has room, judged before anything is cleared.
 *
 * The database being replaced is counted as free, since it is about to go.
 * Null when the browser does not say — the restore then simply proceeds.
 */
export async function roomFor(summary: DeviceTransferSummary): Promise<string | null> {
  const estimate = await navigator.storage?.estimate?.();
  if (!estimate?.quota || estimate.usage === undefined) return null;
  const replaced =
    (estimate as StorageEstimate & { usageDetails?: { indexedDB?: number } }).usageDetails
      ?.indexedDB ?? 0;
  const available = estimate.quota - estimate.usage + replaced;
  if (summary.uncompressedBytes <= available) return null;
  const mb = (bytes: number) => `${Math.ceil(bytes / 1024 / 1024).toLocaleString()} MB`;
  return `This tablet has about ${mb(available)} free for the app, and the transfer needs about ${mb(summary.uncompressedBytes)}. Free some space and try again.`;
}

// ----------------------------------------------------------------- helpers

function toLine(value: Line): string {
  // JSON.stringify leaves Arabic as raw UTF-8 rather than \uXXXX escapes,
  // which would triple a file that is mostly Arabic.
  return `${JSON.stringify(value)}\n`;
}

function totalOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function parseHeader(line: Line, schemaVersion: number): HeaderLine {
  if (line.kind !== 'header' || line.format !== DEVICE_TRANSFER_FORMAT) {
    throw new Error(
      'That is not a tablet transfer file. (A single book file goes under Library transfer; a work backup under Work backup.)',
    );
  }
  if (line.version > DEVICE_TRANSFER_VERSION) {
    throw new Error('That file was written by a newer version of the app. Update this tablet and try again.');
  }
  if (line.schemaVersion !== schemaVersion) {
    throw new Error(
      `The two tablets are on different versions of the app (database ${line.schemaVersion} there, ${schemaVersion} here). ` +
        'Update both to the latest version, then send the file again.',
    );
  }
  return line;
}

/**
 * The file's lines, decompressed if it is gzip.
 *
 * Decided by the gzip magic bytes, not the filename: sharing apps rename files
 * and change their extensions, and the content does not lie.
 */
async function* readLines(file: Blob, size = { bytes: 0 }): AsyncGenerator<Line> {
  const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gzipped = magic[0] === 0x1f && magic[1] === 0x8b;

  let stream: ReadableStream = file.stream();
  if (gzipped) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot read compressed transfer files.');
    }
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }

  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch {
        // A gzip stream cut off mid-member fails here rather than ending.
        throw new Error(
          'The file is incomplete: it was probably cut short while being sent. Send it again from the other tablet.',
        );
      }
      if (done) break;
      size.bytes += value?.byteLength ?? 0;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const text = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (text.trim() !== '') yield parseLine(text);
        newline = buffer.indexOf('\n');
      }
    }

    buffer += decoder.decode();
    // Every line the writer emits ends in a newline, so anything left over is
    // a final line that was cut off.
    if (buffer.trim() !== '') {
      throw new Error(
        'The file is incomplete: it was probably cut short while being sent. Send it again from the other tablet.',
      );
    }
  } finally {
    reader.releaseLock();
  }
}

function parseLine(text: string): Line {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null && 'kind' in value) return value as Line;
  } catch {
    // Falls through to the same message.
  }
  throw new Error('That is not a tablet transfer file, or it is damaged.');
}
