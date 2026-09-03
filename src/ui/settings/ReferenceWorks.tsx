import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { buildRootIndex, MISBAH_SHAMELA_ID } from '../../dictionary/dictionaryService';
import type { Book } from '../../types';
import { Button, Spinner } from '../common';

// Consulted works live here rather than in the reading library. Two kinds, and
// the difference matters at lookup time: a dictionary is keyed by root and
// answers "what does this word mean", while a reference work — Fatḥ al-Bārī,
// an-Nawawī's sharḥ — is searched by passage and is what Explain cites.

export function ReferenceWorks() {
  const { storage } = useApp();
  const [books, setBooks] = useState<Book[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Which row is working and what it is doing. Removing Fatḥ al-Bārī clears ten
  // stores and can take a few seconds even now that it batches — without a
  // label the button just sits there and the work reads as a dead press.
  const [busy, setBusy] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await storage.listBooks();
    const consulted = all.filter(
      (book) => book.role === 'dictionary' || book.role === 'reference',
    );
    setBooks(consulted);

    const next: Record<string, number> = {};
    for (const book of consulted) {
      if (book.role !== 'dictionary') continue;
      next[book.id] = (await storage.listDictionaryEntries(book.id)).length;
    }
    setCounts(next);
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rebuild = async (book: Book) => {
    setBusy({ id: book.id, label: 'Indexing…' });
    setError(null);
    try {
      const total = await buildRootIndex(storage, book);
      setCounts((previous) => ({ ...previous, [book.id]: total }));
    } catch (cause) {
      setError(`Could not rebuild the index: ${(cause as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (book: Book) => {
    if (!window.confirm(`Remove "${book.title}" and its root index from this device?`)) {
      return;
    }
    setBusy({ id: book.id, label: 'Removing…' });
    setError(null);
    try {
      await storage.deleteBook(book.id);
      await refresh();
    } catch (cause) {
      // A removal that fails silently is indistinguishable from one that is
      // merely slow, and the book stays on the list either way. Say which.
      setError(`Could not remove "${book.title}": ${(cause as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Reference works</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Dictionaries for looking words up, and commentaries for Explain to cite. Both are
        entirely local — no model call and no network — so they work with the tablet
        offline.
      </p>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {books.length === 0 ? (
        <div className="rounded-md border border-dashed border-rule p-4 text-sm">
          <p className="mb-1 font-medium">No dictionary imported</p>
          <p className="mb-3 text-muted">
            al-Miṣbāḥ al-Munīr fī Gharīb ash-Sharḥ al-Kabīr is concise and oriented to the
            vocabulary of fiqh and ḥadīth, which is the register of these texts. Import it
            with Shamela ID{' '}
            <code className="rounded bg-rule/50 px-1">{MISBAH_SHAMELA_ID}</code> and choose
            "Reference work" on the confirmation screen.
          </p>
          <Button onClick={() => navigate({ name: 'import' })}>Import a dictionary</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {books.map((book) => (
            <div
              key={book.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-rule px-3 py-2"
            >
              <span className="shrink-0 rounded-full bg-rule/50 px-2 py-0.5 text-[10px]">
                {book.role === 'dictionary' ? 'Dictionary' : 'Reference'}
              </span>
              <span className="arabic min-w-0 flex-1 truncate text-right" dir="rtl" lang="ar">
                {book.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted">
                {book.role === 'dictionary' &&
                  `${(counts[book.id] ?? 0).toLocaleString()} roots · `}
                {book.fetchedPages.toLocaleString()}/{book.totalPages.toLocaleString()} pages
              </span>
              {/* Only a dictionary has a root index to rebuild; a reference
                  work is searched through the ordinary block index. */}
              {book.role === 'dictionary' &&
                (busy?.id === book.id && busy.label === 'Indexing…' ? (
                  <Spinner label="Indexing…" />
                ) : (
                  <Button disabled={busy !== null} onClick={() => void rebuild(book)}>
                    Rebuild index
                  </Button>
                ))}
              {busy?.id === book.id && busy.label === 'Removing…' ? (
                <Spinner label="Removing…" />
              ) : (
                <Button
                  variant="danger"
                  disabled={busy !== null}
                  onClick={() => void remove(book)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
