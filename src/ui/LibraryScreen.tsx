import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { navigate } from '../app/router';
import type { Book } from '../types';
import { Button, LinkButton, TopBar } from './common';
import { useCrawlProgress } from './useCrawlProgress';
import { useCatalogImport } from '../catalog/useCatalogImport';

export function LibraryScreen() {
  const { storage, crawler } = useApp();
  const [books, setBooks] = useState<Book[] | null>(null);
  const progress = useCrawlProgress();
  // A catalog import runs at app level now, so it keeps going while you read.
  // This is where it stays visible once you have left the catalog screen —
  // otherwise it would be a crawl hitting Shamela with nothing on screen
  // saying so.
  const batch = useCatalogImport();

  const refresh = useCallback(async () => {
    // Dictionaries and reference works are consulted, not read through, so
    // they stay out of the grid. They live in Settings → Reference works.
    const all = await storage.listBooks();
    setBooks(all.filter((book) => book.role === 'reading' || book.role === undefined));
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh, progress?.fetchedPages]);

  const remove = async (book: Book) => {
    const confirmed = window.confirm(
      `Delete "${book.title}"?\n\nThis removes the imported text, and any translation cards anchored to it, from this device. It cannot be undone.`,
    );
    if (!confirmed) return;
    await storage.deleteBook(book.id);
    await refresh();
  };

  const resume = async (book: Book) => {
    navigate({ name: 'import' });
    void crawler.start(book.id);
  };

  return (
    <div dir="ltr" className="ltr-isolate flex h-full flex-col">
      <TopBar title="Library" subtitle="Shamela reader & translation study tool">
        <LinkButton to={{ name: 'settings' }} variant="ghost">
          Settings
        </LinkButton>
        <LinkButton to={{ name: 'import' }} variant="primary">
          Add book
        </LinkButton>
      </TopBar>

      <div className="flex-1 overflow-auto p-6">
        {batch.running && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs">
            <span className="font-medium">
              Importing from the catalog — {batch.doneCount} of {batch.rows.length} done
            </span>
            {batch.rows.find((row) => row.status === 'importing') && (
              <span dir="rtl" lang="ar" className="arabic text-[13px]">
                {batch.rows.find((row) => row.status === 'importing')!.entry.title}
              </span>
            )}
            <span className="text-muted">
              {batch.stopping ? 'Stopping after the current page.' : 'Carries on while you read.'}
            </span>
            <span className="ms-auto flex gap-2">
              <LinkButton to={{ name: 'catalog' }}>Show progress</LinkButton>
              <Button onClick={batch.stopNow} disabled={batch.stopping}>
                Stop now
              </Button>
            </span>
          </div>
        )}

        {books === null && <p className="text-sm text-muted">Loading…</p>}

        {books?.length === 0 && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <p className="mb-1 text-sm font-medium">No books yet</p>
            <p className="mb-5 text-sm text-muted">
              Start from the <strong>catalog</strong> — a short list of recommended works
              with their Shamela IDs already looked up — or add one directly by pasting its
              Shamela URL or ID.
            </p>
            <div className="mb-3">
              <LinkButton to={{ name: 'catalog' }} variant="primary">
                Browse the catalog
              </LinkButton>
            </div>
            <LinkButton to={{ name: 'import' }}>Add a book by ID</LinkButton>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books?.map((book) => {
            const isCrawling = progress?.bookId === book.id && progress.status === 'running';
            const percent =
              book.totalPages > 0
                ? Math.round((book.fetchedPages / book.totalPages) * 100)
                : 0;

            return (
              <div
                key={book.id}
                className="flex flex-col rounded-lg border border-rule bg-white p-4 shadow-sm"
              >
                <button
                  onClick={() => navigate({ name: 'reader', bookId: book.id })}
                  className="mb-2 text-right"
                >
                  <h2 className="arabic text-xl leading-snug font-semibold" dir="rtl">
                    {book.title}
                  </h2>
                  <p className="arabic text-sm text-muted" dir="rtl">
                    {book.author}
                  </p>
                </button>

                <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                  <div className="col-span-2 flex justify-between">
                    <dt>Volumes</dt>
                    <dd>{book.volumeCount}</dd>
                  </div>
                  <div className="col-span-2 flex justify-between">
                    <dt>Pages</dt>
                    <dd>
                      {book.fetchedPages.toLocaleString()} / {book.totalPages.toLocaleString()}
                    </dd>
                  </div>
                  <div className="col-span-2 flex justify-between">
                    <dt>Profile</dt>
                    <dd>
                      {book.structureProfile === 'hadith-commentary'
                        ? 'Hadith commentary'
                        : 'Generic'}
                    </dd>
                  </div>
                </dl>

                {book.importStatus !== 'complete' && (
                  <div className="mb-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {isCrawling ? 'Importing…' : `Import incomplete — ${percent}%`}
                    </p>
                  </div>
                )}

                <div className="mt-auto flex gap-2">
                  <Button onClick={() => navigate({ name: 'reader', bookId: book.id })}>
                    Read
                  </Button>
                  {book.importStatus !== 'complete' && !isCrawling && (
                    <Button onClick={() => void resume(book)}>Resume import</Button>
                  )}
                  <div className="ml-auto">
                    <Button variant="danger" onClick={() => void remove(book)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
