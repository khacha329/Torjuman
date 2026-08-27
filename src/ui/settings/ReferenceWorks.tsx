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
  const [busy, setBusy] = useState<string | null>(null);

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
    setBusy(book.id);
    try {
      const total = await buildRootIndex(storage, book);
      setCounts((previous) => ({ ...previous, [book.id]: total }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (book: Book) => {
    if (!window.confirm(`Remove "${book.title}" and its root index from this device?`)) {
      return;
    }
    await storage.deleteBook(book.id);
    await refresh();
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Reference works</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Dictionaries for looking words up, and commentaries for Explain to cite. Both are
        entirely local — no model call and no network — so they work with the tablet
        offline.
      </p>

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
                (busy === book.id ? (
                  <Spinner label="Indexing…" />
                ) : (
                  <Button onClick={() => void rebuild(book)}>Rebuild index</Button>
                ))}
              <Button variant="danger" onClick={() => void remove(book)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
