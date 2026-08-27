import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import { parsePage } from '../shamela/parsePage';
import { pageUrl } from '../shamela/urls';
import { regenerateEntities } from '../quran/entityService';
import { buildRootIndex } from '../dictionary/dictionaryService';
import { delay, storePage, TocIndex } from './importer';

// Resumable page crawler.
//
// Resumability is not kept in a cursor that could drift out of step with what
// actually landed: the set of stored pages *is* the progress record. On every
// start the crawler diffs the stored page indices against the book's page count
// and fetches only the gaps, so closing the tab, sleeping the tablet, or losing
// the network mid-crawl all resume correctly and never re-fetch a stored page.

const MIN_DELAY_MS = 300;
const MAX_DELAY_MS = 500;
const MAX_ATTEMPTS = 3;

export interface CrawlProgress {
  bookId: string;
  status: 'idle' | 'running' | 'paused' | 'complete' | 'failed';
  currentPage: number;
  fetchedPages: number;
  totalPages: number;
  failedPages: number[];
  lastError: string | null;
}

type Listener = (progress: CrawlProgress) => void;

export class Crawler {
  private listeners = new Set<Listener>();
  private paused = false;
  private running = false;
  private progress: CrawlProgress | null = null;

  private readonly http: HttpClient;
  private readonly storage: StorageAdapter;

  constructor(http: HttpClient, storage: StorageAdapter) {
    this.http = http;
    this.storage = storage;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.progress) listener(this.progress);
    return () => this.listeners.delete(listener);
  }

  get current(): CrawlProgress | null {
    return this.progress;
  }

  get isRunning(): boolean {
    return this.running;
  }

  pause(): void {
    this.paused = true;
  }

  private emit(patch: Partial<CrawlProgress>): void {
    if (!this.progress) return;
    this.progress = { ...this.progress, ...patch };
    for (const listener of this.listeners) listener(this.progress);
  }

  /**
   * Fetch every page not already stored. Safe to call again at any time — it
   * picks up wherever the stored pages leave off.
   */
  async start(bookId: string, options: { onlyPages?: number[] } = {}): Promise<void> {
    if (this.running) return;

    const book = await this.storage.getBook(bookId);
    if (!book) throw new Error(`Unknown book ${bookId}`);

    const tocIndex = new TocIndex(await this.storage.listTocNodes(bookId));
    const stored = new Set(await this.storage.listFetchedPageIndices(bookId));

    const targets =
      options.onlyPages ??
      Array.from({ length: book.totalPages }, (_, i) => i + 1).filter((p) => !stored.has(p));

    const state = await this.storage.getCrawlState(bookId);
    const failed = new Set(options.onlyPages ? [] : (state?.failedPages ?? []));

    this.running = true;
    this.paused = false;
    this.progress = {
      bookId,
      status: 'running',
      currentPage: targets[0] ?? book.totalPages,
      fetchedPages: stored.size,
      totalPages: book.totalPages,
      failedPages: [...failed],
      lastError: null,
    };
    for (const listener of this.listeners) listener(this.progress);

    try {
      for (const pageIndex of targets) {
        if (this.paused) {
          this.emit({ status: 'paused' });
          await this.saveState(bookId, 'paused', pageIndex, [...failed]);
          return;
        }

        this.emit({ currentPage: pageIndex });

        const ok = await this.fetchOne(book.shamelaId, bookId, pageIndex, tocIndex);
        if (ok) {
          failed.delete(pageIndex);
          stored.add(pageIndex);
          this.emit({ fetchedPages: stored.size, failedPages: [...failed] });
        } else {
          failed.add(pageIndex);
          this.emit({ failedPages: [...failed] });
        }

        // Persist progress every page so a reload never loses more than one.
        await this.saveState(bookId, 'running', pageIndex + 1, [...failed]);
        await this.storage.putBook({ ...book, fetchedPages: stored.size });

        // This is a free scholarly library. Do not hammer it.
        await delay(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
      }

      const complete = failed.size === 0 && stored.size >= book.totalPages;

      if (complete) {
        this.emit({ status: 'running', lastError: null });
        const finished = { ...book, fetchedPages: stored.size };

        if (book.role === 'dictionary') {
          // A dictionary is looked up, not read: it gets a root index instead
          // of verse and hadith entities.
          await buildRootIndex(this.storage, finished);
        } else {
          // Entity detection runs once over the finished book rather than
          // inside each page's parse. Shamela breaks pages mid-sentence, so a
          // quoted verse can straddle a page boundary — and joining the halves
          // is only possible once the following page exists. Per-page
          // detection would silently miss every one of those.
          await regenerateEntities(this.storage, finished);
        }
      }

      this.emit({ status: complete ? 'complete' : 'failed' });
      await this.saveState(bookId, complete ? 'complete' : 'idle', book.totalPages, [...failed]);
      await this.storage.putBook({
        ...book,
        fetchedPages: stored.size,
        importStatus: complete ? 'complete' : 'in-progress',
      });
    } finally {
      this.running = false;
    }
  }

  /** Re-attempt only the pages that exhausted their retries. */
  async retryFailed(bookId: string): Promise<void> {
    const state = await this.storage.getCrawlState(bookId);
    if (!state || state.failedPages.length === 0) return;
    await this.start(bookId, { onlyPages: [...state.failedPages] });
  }

  private async fetchOne(
    shamelaId: number,
    bookId: string,
    pageIndex: number,
    tocIndex: TocIndex,
  ): Promise<boolean> {
    const book = await this.storage.getBook(bookId);
    if (!book) return false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.http.get(pageUrl(shamelaId, pageIndex));

        // A 404 means the page genuinely does not exist; retrying cannot help.
        if (response.status === 404) {
          this.emit({ lastError: `Page ${pageIndex} does not exist (404).` });
          return false;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const parsed = parsePage(response.body, shamelaId);
        if (!parsed) throw new Error('page markup did not contain a text container');

        await storePage(this.storage, book, parsed, tocIndex);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_ATTEMPTS) {
          this.emit({ lastError: `Page ${pageIndex}: ${message}` });
          return false;
        }
        // Exponential backoff: 1s, 2s, 4s.
        await delay(1000 * 2 ** (attempt - 1));
      }
    }
    return false;
  }

  private async saveState(
    bookId: string,
    status: 'idle' | 'running' | 'paused' | 'complete',
    nextPage: number,
    failedPages: number[],
  ): Promise<void> {
    await this.storage.putCrawlState({
      bookId,
      status,
      nextPage,
      failedPages,
      updatedAt: Date.now(),
    });
  }
}
