import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Block, Book, Page, TocNode } from '../types';
import { normalize } from '../lib/arabic';
import { sha256 } from '../lib/hash';
import { regenerateEntities } from '../quran/entityService';
import { buildRootIndex } from '../dictionary/dictionaryService';

// Moving a crawled book between the user's own devices as a file.
//
// This exists because re-crawling on the target device is not an option: the
// Vite proxy that works around Shamela's missing CORS headers is a development
// server feature and does not exist in a production build.
//
// Book content only. The user's own work — cards, marks, glossary — travels
// separately as a work backup, and can be restored onto a device where the
// books were imported independently, because block IDs are deterministic.

export const TRANSFER_VERSION = 1;
export const TRANSFER_EXTENSION = '.hashiya.gz';

/**
 * What goes in the file.
 *
 * Four fields account for most of a naive dump's bulk, and three are derived
 * data that costs nothing to rebuild on arrival:
 *
 *   Page.rawHtml        by far the largest contributor; not needed unless
 *                       re-parsing, so it is dropped outright
 *   Block.normalized    roughly doubles the text volume; recomputed by the
 *                       same normalization function, deterministically
 *   Block.contentHash   derived from text; recomputed
 *   Entity records      derived; detection re-runs on arrival, offline
 *
 * Keys are short because they repeat once per block across tens of thousands
 * of lines.
 */
interface HeaderLine {
  kind: 'header';
  version: number;
  book: Book;
  toc: TocNode[];
  counts: { pages: number; blocks: number };
}

interface PageLine {
  kind: 'page';
  /** pageIndex */ p: number;
  /** volume */ v: number | null;
  /** printPage */ s: number | null;
}

interface BlockLine {
  kind: 'block';
  id: string;
  /** pageId */ g: string;
  /** order */ o: number;
  /** type */ t: Block['type'];
  /** text */ x: string;
  /** hadithNumber */ h: string | null;
  /** tocNodeId */ n: string | null;
  /** spans */ z: Block['spans'];
  /** anchor */ a: string | null;
}

export interface TransferProgress {
  phase: 'reading' | 'writing' | 'inserting' | 'indexing' | 'done';
  done: number;
  total: number;
  message: string;
}

type OnProgress = (progress: TransferProgress) => void;

/**
 * NDJSON, not one JSON document.
 *
 * A whole-file JSON.parse forces tens of thousands of blocks into memory at
 * once, which on a phone is an out-of-memory risk. One record per line can be
 * streamed in and inserted in batches.
 *
 * JSON.stringify emits raw UTF-8 and does not escape non-ASCII, which matters
 * here: Arabic escaped as \uXXXX costs six bytes per character instead of two,
 * tripling a file that is almost entirely Arabic.
 */
function toLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export async function exportBook(
  storage: StorageAdapter,
  book: Book,
  onProgress: OnProgress = () => {},
): Promise<Blob> {
  onProgress({ phase: 'reading', done: 0, total: 1, message: 'Reading the book…' });

  const [toc, pageMeta, blocks] = await Promise.all([
    storage.listTocNodes(book.id),
    storage.listPageMeta(book.id),
    storage.listBlocks(book.id),
  ]);

  const header: HeaderLine = {
    kind: 'header',
    version: TRANSFER_VERSION,
    book,
    toc,
    counts: { pages: pageMeta.length, blocks: blocks.length },
  };

  const chunks: string[] = [toLine(header)];

  for (const meta of pageMeta) {
    chunks.push(
      toLine({ kind: 'page', p: meta.pageIndex, v: meta.volume, s: meta.printPage } satisfies PageLine),
    );
  }

  for (const [index, block] of blocks.entries()) {
    chunks.push(
      toLine({
        kind: 'block',
        id: block.id,
        g: block.pageId,
        o: block.order,
        t: block.type,
        x: block.text,
        h: block.hadithNumber,
        n: block.tocNodeId,
        z: block.spans,
        a: block.anchor,
      } satisfies BlockLine),
    );
    if (index % 2000 === 0) {
      onProgress({
        phase: 'writing',
        done: index,
        total: blocks.length,
        message: `Serializing block ${index.toLocaleString()} of ${blocks.length.toLocaleString()}…`,
      });
      // Yield so the progress indicator actually paints.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const bytes = new TextEncoder().encode(chunks.join(''));

  onProgress({ phase: 'writing', done: blocks.length, total: blocks.length, message: 'Compressing…' });

  if (typeof CompressionStream === 'undefined') {
    // Uncompressed fallback rather than failing the export outright.
    return new Blob([bytes], { type: 'application/x-ndjson' });
  }

  const compressed = new Blob([bytes as BufferSource])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));

  return new Response(compressed).blob();
}

/** Filename that identifies the book later without opening it. */
export function exportFilename(book: Book): string {
  const safeTitle = book.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 48).trim();
  return `${book.shamelaId} - ${safeTitle}${TRANSFER_EXTENSION}`;
}

export interface ImportOutcome {
  book: Book;
  pages: number;
  blocks: number;
}

/**
 * Read a transfer file back in.
 *
 * `onConflict` is asked before an existing book of the same Shamela ID is
 * touched. Partial overlap between two versions of a book is worse than either,
 * so there is no merge: replace, or stop.
 */
export async function importBookFile(
  storage: StorageAdapter,
  file: File,
  options: {
    onProgress?: OnProgress;
    onConflict?: (existing: Book) => Promise<boolean>;
  } = {},
): Promise<ImportOutcome> {
  const onProgress = options.onProgress ?? (() => {});

  let stream: ReadableStream = file.stream();
  const looksCompressed = file.name.endsWith('.gz');
  if (looksCompressed) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot read compressed transfer files.');
    }
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }

  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();

  let header: HeaderLine | null = null;
  let buffer = '';
  let bookId = '';
  let created = false;

  const pageBatch: Page[] = [];
  const blockBatch: Block[] = [];
  let pageCount = 0;
  let blockCount = 0;

  const flushPages = async () => {
    for (const page of pageBatch) await storage.putPage(page);
    pageBatch.length = 0;
  };
  const flushBlocks = async () => {
    if (blockBatch.length === 0) return;
    await storage.putBlocks(blockBatch);
    blockBatch.length = 0;
  };

  try {
    onProgress({ phase: 'reading', done: 0, total: 1, message: 'Reading the file…' });

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        const record = JSON.parse(line) as HeaderLine | PageLine | BlockLine;

        if (record.kind === 'header') {
          header = record;
          if (header.version > TRANSFER_VERSION) {
            throw new Error(
              `This file was written by a newer version of the app (format ${header.version}).`,
            );
          }

          const existing = await storage.getBook(header.book.id);
          if (existing) {
            const replace = options.onConflict ? await options.onConflict(existing) : false;
            if (!replace) throw new Error('CANCELLED');
            await storage.deleteBook(existing.id);
          }

          bookId = header.book.id;
          await storage.putBook({ ...header.book, importStatus: 'in-progress' });
          await storage.putTocNodes(header.toc);
          created = true;
          continue;
        }

        if (!header) throw new Error('The file does not start with a header line.');

        if (record.kind === 'page') {
          pageBatch.push({
            id: `${bookId}:p${record.p}`,
            bookId,
            pageIndex: record.p,
            volume: record.v,
            printPage: record.s,
            // Deliberately absent from the file: it is the largest thing in the
            // database and is only needed to re-parse, which a transferred book
            // never does.
            rawHtml: '',
            fetchedAt: Date.now(),
          });
          pageCount++;
          if (pageBatch.length >= 500) await flushPages();
          continue;
        }

        // Recomputed on arrival rather than carried: deterministic, and between
        // them they roughly double the file size.
        blockBatch.push({
          id: record.id,
          bookId,
          pageId: record.g,
          order: record.o,
          type: record.t,
          text: record.x,
          normalized: normalize(record.x),
          contentHash: sha256(record.x),
          hadithNumber: record.h,
          tocNodeId: record.n,
          spans: record.z ?? [],
          anchor: record.a,
        });
        blockCount++;

        if (blockBatch.length >= 500) {
          await flushBlocks();
          onProgress({
            phase: 'inserting',
            done: blockCount,
            total: header.counts.blocks,
            message: `Storing block ${blockCount.toLocaleString()} of ${header.counts.blocks.toLocaleString()}…`,
          });
        }
      }
    }

    await flushPages();
    await flushBlocks();

    if (!header) throw new Error('The file contained no header.');

    // A truncated transfer is otherwise indistinguishable from a short book.
    if (blockCount !== header.counts.blocks || pageCount !== header.counts.pages) {
      throw new Error(
        `The file is incomplete: expected ${header.counts.blocks.toLocaleString()} blocks and ` +
          `${header.counts.pages.toLocaleString()} pages, found ${blockCount.toLocaleString()} and ` +
          `${pageCount.toLocaleString()}. The transfer was probably cut short.`,
      );
    }

    const book: Book = {
      ...header.book,
      fetchedPages: pageCount,
      importStatus: 'complete',
    };
    await storage.putBook(book);
    await storage.putCrawlState({
      bookId,
      status: 'complete',
      nextPage: book.totalPages,
      failedPages: [],
      updatedAt: Date.now(),
    });

    onProgress({
      phase: 'indexing',
      done: blockCount,
      total: blockCount,
      message: 'Detecting verses and hadith…',
    });

    // Derived data, rebuilt locally against the bundled muṣḥaf — no network.
    if (book.role === 'dictionary') await buildRootIndex(storage, book);
    else await regenerateEntities(storage, book);

    onProgress({ phase: 'done', done: blockCount, total: blockCount, message: 'Done.' });

    return { book, pages: pageCount, blocks: blockCount };
  } catch (error) {
    // A half-imported book looks valid and reads as though pages were missing,
    // which is worse than no book at all.
    if (created && bookId) await storage.deleteBook(bookId);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
