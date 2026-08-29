import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Crawler } from '../ingest/crawler';
import { createBookFromPreview, fetchBookPreview } from '../ingest/importer';
import type { CatalogEntry } from '../types';
import { importOrder } from './catalogService';
import { beginActivity } from '../app/activity';

// Importing a selection from the catalog, one book after another.
//
// ---------------------------------------------------------------------------
// Why this is a service and not a hook
//
// It used to be a hook inside CatalogScreen, and that put the batch's state in
// a different lifetime from the work it was tracking. The Crawler is built once
// for the whole app; the batch loop is a plain async function that keeps
// running whatever React does. So leaving the catalog screen did not stop an
// import — it orphaned one: the crawl carried on hitting Shamela while its only
// UI unmounted, and coming back produced a fresh, empty batch with no way to
// see or stop what was still running.
//
// The screen dealt with that by removing the way out, which is why an import
// used to pin you to that page. Owning the state here instead means you can
// leave, the progress follows you, and the Library can show it.
//
// ---------------------------------------------------------------------------
// Sequential, and a failure does not end the batch
//
// These are long crawls — the six-volume sharḥ is 3,784 pages — and they run
// against someone else's server. Running them concurrently would multiply the
// request rate by the number of books selected, which is the opposite of the
// courtesy delay the crawler already keeps between pages. So: one at a time.
//
// And a book that fails is recorded and stepped over rather than aborting the
// rest. Losing four successful imports because the fifth 404s is the worst
// possible outcome of a batch that takes half an hour, so each entry carries
// its own status, its own error, and its own retry.
// ---------------------------------------------------------------------------

export type EntryStatus =
  | 'queued'
  | 'importing'
  | 'done'
  /**
   * Stopped part-way, with everything fetched so far kept.
   *
   * Distinct from 'done' on purpose. `crawler.start()` returns normally when it
   * is paused, so marking the row done on return reported a book stopped at
   * page 200 of 3,784 as finished — and, because the crawler only runs entity
   * detection on a complete book, that book had no verse or ḥadīth marks
   * either. Resume it from the Library.
   */
  | 'partial'
  | 'failed'
  | 'skipped';

export interface EntryState {
  entry: CatalogEntry;
  status: EntryStatus;
  /** Pages fetched so far, for this row's own progress bar. */
  pagesDone: number;
  error: string | null;
  bookId: string | null;
}

export interface BatchState {
  rows: EntryState[];
  running: boolean;
  /** Set once a stop has been asked for and the batch has not yet wound up. */
  stopping: boolean;
}

type Listener = (state: BatchState) => void;

const EMPTY: BatchState = { rows: [], running: false, stopping: false };

export class CatalogImportBatch {
  private listeners = new Set<Listener>();
  private state: BatchState = EMPTY;
  /** Skip everything still queued. */
  private cancelled = false;

  private readonly http: HttpClient;
  private readonly storage: StorageAdapter;
  private readonly crawler: Crawler;

  constructor(http: HttpClient, storage: StorageAdapter, crawler: Crawler) {
    this.http = http;
    this.storage = storage;
    this.crawler = crawler;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get current(): BatchState {
    return this.state;
  }

  private set(patch: Partial<BatchState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private patchRow(shamelaId: number, changes: Partial<EntryState>): void {
    this.set({
      rows: this.state.rows.map((row) =>
        row.entry.shamelaId === shamelaId ? { ...row, ...changes } : row,
      ),
    });
  }

  /**
   * Stop the current book where it stands and skip the rest.
   *
   * The crawler checks its pause flag at the top of each page, so this takes
   * effect within a page — not at the end of the book. Everything already
   * fetched is kept and the book resumes from the Library.
   */
  stopNow(): void {
    if (!this.state.running) return;
    this.cancelled = true;
    this.set({ stopping: true });
    this.crawler.pause();
  }

  /**
   * Let the book in progress finish, then stop before the next one.
   *
   * Deliberately does NOT pause the crawler — that is the whole difference from
   * stopNow, and the distinction the old single button got wrong: it was
   * labelled "Stop after this book" and paused immediately.
   */
  finishCurrentThenStop(): void {
    if (!this.state.running) return;
    this.cancelled = true;
    this.set({ stopping: true });
  }

  /** Clear a finished batch so the catalog offers its selection list again. */
  reset(): void {
    if (this.state.running) return;
    this.state = EMPTY;
    for (const listener of this.listeners) listener(this.state);
  }

  async start(selected: CatalogEntry[]): Promise<void> {
    if (this.state.running || selected.length === 0) return;
    this.cancelled = false;

    // Smallest first, whatever order they were selected in, so there is
    // something readable while the largest is still crawling.
    const ordered = importOrder(selected);
    this.state = {
      rows: ordered.map((entry) => ({
        entry,
        status: 'queued' as const,
        pagesDone: 0,
        error: null,
        bookId: null,
      })),
      running: false,
      stopping: false,
    };
    await this.runBatch(ordered);
  }

  /** Re-run whatever did not finish, leaving completed books alone. */
  async retryFailed(): Promise<void> {
    if (this.state.running) return;
    const again = this.state.rows
      .filter(
        (row) =>
          row.status === 'failed' || row.status === 'skipped' || row.status === 'partial',
      )
      .map((row) => row.entry);
    if (again.length === 0) return;

    this.cancelled = false;
    this.set({ stopping: false });
    await this.runBatch(importOrder(again));
  }

  get unfinishedCount(): number {
    return this.state.rows.filter(
      (row) => row.status === 'failed' || row.status === 'skipped' || row.status === 'partial',
    ).length;
  }

  get doneCount(): number {
    return this.state.rows.filter((row) => row.status === 'done').length;
  }

  private async runBatch(queue: CatalogEntry[]): Promise<void> {
    this.set({ running: true });
    // Holds back the service-worker update prompt: reloading part-way through
    // a crawl throws away the page in flight and restarts the batch UI.
    const endActivity = beginActivity();
    try {
      for (const entry of queue) {
        if (this.cancelled) {
          this.patchRow(entry.shamelaId, { status: 'skipped' });
          continue;
        }
        await this.importOne(entry);
      }
    } finally {
      endActivity();
      this.set({ running: false, stopping: false });
    }
  }

  /** Import one entry. Resolves either way; never throws into the batch. */
  private async importOne(entry: CatalogEntry): Promise<void> {
    this.patchRow(entry.shamelaId, { status: 'importing', error: null });

    let unsubscribe: (() => void) | undefined;
    try {
      const preview = await fetchBookPreview(this.http, entry.shamelaId);
      if (preview.totalPages === 0) {
        throw new Error('Shamela returned no page count for this book.');
      }

      // The catalog decides the role rather than the importer's guess: a
      // dictionary imported as a reading book lands in the library grid with
      // no root index built, which is a tedious thing to undo by hand.
      const book = await createBookFromPreview(this.storage, {
        ...preview,
        role: entry.role,
      });
      this.patchRow(entry.shamelaId, { bookId: book.id });

      unsubscribe = this.crawler.subscribe((progress) => {
        if (progress.bookId === book.id) {
          this.patchRow(entry.shamelaId, { pagesDone: progress.fetchedPages });
        }
      });

      await this.crawler.start(book.id);

      // `start` resolves the same way whether the crawl finished or was paused,
      // so the outcome has to be read off the crawler rather than assumed from
      // a clean return. Reporting a paused book as done was the bug this
      // replaces.
      const finished = this.crawler.current;
      const status: EntryStatus =
        finished && finished.bookId === book.id && finished.status !== 'complete'
          ? 'partial'
          : 'done';

      this.patchRow(entry.shamelaId, {
        status,
        error:
          status === 'partial'
            ? 'Stopped before the end. Everything fetched so far is kept — resume it from the Library.'
            : null,
      });
    } catch (error) {
      this.patchRow(entry.shamelaId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      unsubscribe?.();
    }
  }
}
