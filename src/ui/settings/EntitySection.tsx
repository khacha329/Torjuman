import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { regenerateEntities, summarize, type EntityBuildResult } from '../../quran/entityService';
import { loadQuranIndex } from '../../quran/quranIndex';
import type { Book } from '../../types';
import { Button, Spinner } from '../common';

// Re-running detection over a book.
//
// Entities are derived entirely from blocks, so this is a supported operation
// rather than a migration: it deletes and rebuilds, and touches nothing else.
// Translation cards, the glossary, and the retrieval caches are all untouched,
// which is what makes it safe to offer as a button.

export function EntitySection() {
  const { storage } = useApp();
  const [books, setBooks] = useState<Book[]>([]);
  const [counts, setCounts] = useState<Record<string, EntityBuildResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [edition, setEdition] = useState<string | null>(null);

  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await storage.listBooks();
    setBooks(all);
    const next: Record<string, EntityBuildResult> = {};
    for (const book of all) {
      next[book.id] = summarize(await storage.listEntities(book.id));
    }
    setCounts(next);
  }, [storage]);

  useEffect(() => {
    void refresh();
    void loadQuranIndex()
      .then((index) => setEdition(`${index.edition} · ${index.ayahCount.toLocaleString()} āyāt`))
      .catch(() => setEdition('could not be loaded'));
  }, [refresh]);

  const regenerate = async (book: Book) => {
    setBusy(book.id);
    try {
      const result = await regenerateEntities(storage, book);
      setCounts((previous) => ({ ...previous, [book.id]: result }));
      await refresh();
      setCounts((previous) => ({ ...previous, [book.id]: result }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Verse and ḥadīth detection</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Quoted verses are matched against the bundled muṣḥaf on this device — no model
        call and no network. Re-run detection after a parser change; it rebuilds the
        markers only and leaves your translation cards untouched.
      </p>

      <p className="mb-4 rounded-md border border-rule bg-parchment px-3 py-2 text-xs text-muted">
        Bundled text: {edition ?? 'loading…'}
      </p>

      {books.length === 0 && <p className="text-sm text-muted">No books imported yet.</p>}

      <div className="space-y-2">
        {books.map((book) => {
          const summary = counts[book.id];
          return (
            <div
              key={book.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-rule px-3 py-2"
            >
              <span className="arabic min-w-0 flex-1 truncate text-right" dir="rtl" lang="ar">
                {book.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted">
                {summary
                  ? `${summary.exact} exact · ${summary.partial} ambiguous · ` +
                    `${summary.crossBlock} across pages · ${summary.unresolved} unmarked`
                  : '—'}
              </span>
              {busy === book.id ? (
                <Spinner label="Detecting…" />
              ) : (
                <Button onClick={() => void regenerate(book)}>Re-detect</Button>
              )}
              {summary && summary.unmatched.length > 0 && (
                <button
                  onClick={() =>
                    setDiagnostics(diagnostics === book.id ? null : book.id)
                  }
                  className="shrink-0 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900"
                >
                  {summary.unmatched.length} unmatched
                </button>
              )}

              {/* The diagnostic worth reading: a bracketed span that looks like
                  a quotation but matched nothing. It catches both detection
                  failures and text corrupted by the Shamela parse, at import
                  time rather than mid-lesson. */}
              {diagnostics === book.id && summary && (
                <ul className="w-full space-y-1 border-t border-rule pt-2">
                  {summary.unmatched.slice(0, 40).map((problem, index) => (
                    <li
                      key={index}
                      dir="rtl"
                      lang="ar"
                      className="arabic rounded bg-parchment px-2 py-1 text-right text-[13px]"
                    >
                      {problem.text}
                    </li>
                  ))}
                  {summary.unmatched.length > 40 && (
                    <li className="text-[11px] text-muted">
                      …and {summary.unmatched.length - 40} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted">
        "Unmatched" lists bracketed spans that look like quotations but matched no
        āyah. On a healthy import that list is empty or close to it; entries in it are
        either short fragments below the four-word threshold or a sign the page was
        parsed badly.
      </p>
    </section>
  );
}
