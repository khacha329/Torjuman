import { useCallback, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { createBookFromPreview, fetchBookPreview } from '../ingest/importer';
import type { CatalogEntry } from '../types';
import { importOrder } from './catalogService';

// Importing a selection from the catalog, one book after another.
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

export type EntryStatus = 'queued' | 'importing' | 'done' | 'failed' | 'skipped';

export interface EntryState {
  entry: CatalogEntry;
  status: EntryStatus;
  /** Pages fetched so far, for this row's own progress bar. */
  pagesDone: number;
  error: string | null;
  bookId: string | null;
}

export function useCatalogImport() {
  const { http, storage, crawler } = useApp();
  const [rows, setRows] = useState<EntryState[]>([]);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  const patch = useCallback((shamelaId: number, changes: Partial<EntryState>) => {
    setRows((previous) =>
      previous.map((row) =>
        row.entry.shamelaId === shamelaId ? { ...row, ...changes } : row,
      ),
    );
  }, []);

  /** Import one entry. Resolves either way; never throws into the batch. */
  const importOne = useCallback(
    async (entry: CatalogEntry) => {
      patch(entry.shamelaId, { status: 'importing', error: null });

      let unsubscribe: (() => void) | undefined;
      try {
        const preview = await fetchBookPreview(http, entry.shamelaId);
        if (preview.totalPages === 0) {
          throw new Error('Shamela returned no page count for this book.');
        }

        // The catalog decides the role rather than the importer's guess: a
        // dictionary imported as a reading book lands in the library grid with
        // no root index built, which is a tedious thing to undo by hand.
        const book = await createBookFromPreview(storage, {
          ...preview,
          role: entry.role,
        });
        patch(entry.shamelaId, { bookId: book.id });

        unsubscribe = crawler.subscribe((progress) => {
          if (progress.bookId === book.id) {
            patch(entry.shamelaId, { pagesDone: progress.fetchedPages });
          }
        });

        await crawler.start(book.id);
        patch(entry.shamelaId, { status: 'done' });
      } catch (error) {
        patch(entry.shamelaId, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        unsubscribe?.();
      }
    },
    [crawler, http, patch, storage],
  );

  const runBatch = useCallback(
    async (queue: CatalogEntry[]) => {
      setRunning(true);
      for (const entry of queue) {
        if (cancelled.current) {
          patch(entry.shamelaId, { status: 'skipped' });
          continue;
        }
        await importOne(entry);
      }
      setRunning(false);
    },
    [importOne, patch],
  );

  const start = useCallback(
    async (selected: CatalogEntry[]) => {
      if (selected.length === 0) return;
      cancelled.current = false;

      // Smallest first, whatever order they were selected in, so there is
      // something readable while the largest is still crawling.
      const ordered = importOrder(selected);
      setRows(
        ordered.map((entry) => ({
          entry,
          status: 'queued' as const,
          pagesDone: 0,
          error: null,
          bookId: null,
        })),
      );

      await runBatch(ordered);
    },
    [runBatch],
  );

  /** Re-run only what failed, leaving what succeeded alone. */
  const retryFailed = useCallback(async () => {
    const failed = rows
      .filter((row) => row.status === 'failed' || row.status === 'skipped')
      .map((row) => row.entry);
    if (failed.length === 0) return;

    cancelled.current = false;
    await runBatch(importOrder(failed));
  }, [rows, runBatch]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    crawler.pause();
  }, [crawler]);

  const failedCount = rows.filter((row) => row.status === 'failed').length;
  const doneCount = rows.filter((row) => row.status === 'done').length;

  return { rows, running, doneCount, failedCount, start, retryFailed, cancel };
}
