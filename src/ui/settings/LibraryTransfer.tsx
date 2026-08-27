import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import {
  exportBook,
  exportFilename,
  importBookFile,
  TRANSFER_EXTENSION,
  type TransferProgress,
} from '../../library/transfer';
import type { Book } from '../../types';
import { Button } from '../common';

// Moving crawled books between the user's own devices.
//
// Re-crawling on the target device is not an option in a production build: the
// proxy that works around Shamela's missing CORS headers is a dev-server
// feature. So a book crawled once on the desktop travels as a file.

export function LibraryTransfer() {
  const { storage, reload } = useApp();
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setBooks(await storage.listBooks());
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doExport = async (book: Book) => {
    setStatus(null);
    try {
      const blob = await exportBook(storage, book, setProgress);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename(book);
      link.click();
      URL.revokeObjectURL(url);
      setStatus(
        `Exported "${book.title}" — ${(blob.size / 1024 / 1024).toFixed(1)} MB compressed.`,
      );
    } catch (error) {
      setStatus(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProgress(null);
    }
  };

  const doImport = async (file: File) => {
    setStatus(null);
    try {
      const outcome = await importBookFile(storage, file, {
        onProgress: setProgress,
        // Partial overlap between two versions of a book is worse than either,
        // so there is no merge — replace or stop.
        onConflict: async (existing) =>
          window.confirm(
            `"${existing.title}" is already on this device.\n\n` +
              'Replace it with the contents of this file? Its translation cards and marks ' +
              'are kept — they anchor to block IDs, which are the same either way.',
          ),
      });
      await refresh();
      await reload();
      setStatus(
        `Imported "${outcome.book.title}" — ${outcome.pages.toLocaleString()} pages, ` +
          `${outcome.blocks.toLocaleString()} paragraphs.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message === 'CANCELLED' ? 'Import cancelled — nothing was changed.' : `Import failed: ${message}`);
      await refresh();
    } finally {
      setProgress(null);
    }
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Library transfer</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Move a crawled book to another device as a file, instead of crawling it again.
        Only the text travels — your cards and marks move with the work backup above.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => fileRef.current?.click()} disabled={progress !== null}>
          Import a book file
        </Button>
        <span className="text-xs text-muted">{TRANSFER_EXTENSION}</span>
        <input
          ref={fileRef}
          type="file"
          accept=".gz,.hashiya,application/gzip,application/x-ndjson"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void doImport(file);
            event.target.value = '';
          }}
        />
      </div>

      {progress && (
        <div className="mb-4 rounded-md border border-rule bg-parchment p-3">
          <p className="mb-2 text-xs text-muted">{progress.message}</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {books.length === 0 ? (
        <p className="text-sm text-muted">No books to export yet.</p>
      ) : (
        <div className="space-y-2">
          {books.map((book) => (
            <div
              key={book.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-rule px-3 py-2"
            >
              <span className="arabic min-w-0 flex-1 truncate text-right" dir="rtl" lang="ar">
                {book.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted">
                {book.shamelaId} · {book.fetchedPages.toLocaleString()} pages
                {book.role === 'dictionary' ? ' · reference' : ''}
              </span>
              <Button onClick={() => void doExport(book)} disabled={progress !== null}>
                Export
              </Button>
            </div>
          ))}
        </div>
      )}

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}

      <p className="mt-3 text-xs text-muted">
        The file carries the text, the table of contents and the ج/ص mapping. The stored
        page HTML, the search index and verse detection are all left out and rebuilt on
        arrival — they are derived, and together they are most of the bulk.
      </p>
    </section>
  );
}
