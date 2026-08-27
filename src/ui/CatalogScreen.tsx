import { useEffect, useMemo, useState } from 'react';
import { useOnline } from '../app/useOnline';
import {
  estimateMinutes,
  groupEntries,
  loadCatalog,
  totalPages,
  type CatalogResult,
} from '../catalog/catalogService';
import { useCatalogImport, type EntryState } from '../catalog/useCatalogImport';
import { PROXY_AVAILABLE } from '../platform/http/WebHttpClient';
import type { CatalogEntry } from '../types';
import { Button, Spinner } from './common';

// The suggested library.
//
// Shown once after the key step, and reachable afterwards from Settings. What
// it offers is a list of Shamela IDs with a line each on why the book is worth
// having — the app never contains the books themselves, which is what keeps a
// distributed build clear of redistributing modern copyrighted commentary.
//
// It is useful even where importing cannot run: on a deployed PWA the IDs and
// the recommendations are most of the value, and the import step happens on a
// desktop instead. That is why the screen still appears there, with the button
// disabled and the reason given, rather than being hidden or — worse — offering
// a button that cannot succeed.

export function CatalogScreen({
  onDone,
  heading = 'Suggested library',
}: {
  onDone: () => void;
  heading?: string;
}) {
  const online = useOnline();
  const [result, setResult] = useState<CatalogResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const batch = useCatalogImport();

  useEffect(() => {
    let cancelled = false;
    loadCatalog({ online })
      .then((loaded) => {
        if (cancelled) return;
        setResult(loaded);
        // Recommended entries are pre-selected; everything is optional.
        setSelected(
          new Set(
            loaded.catalog.entries
              .filter((entry) => entry.recommended)
              .map((entry) => entry.shamelaId),
          ),
        );
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
    // Loaded once per mount: re-fetching because the network flickered would
    // reset the user's selection mid-decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = result?.catalog.entries ?? [];
  const chosen = useMemo(
    () => entries.filter((entry) => selected.has(entry.shamelaId)),
    [entries, selected],
  );

  const pages = totalPages(chosen);
  const started = batch.rows.length > 0;

  const toggle = (shamelaId: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(shamelaId)) next.delete(shamelaId);
      else next.add(shamelaId);
      return next;
    });
  };

  return (
    <div dir="ltr" className="ltr-isolate h-full overflow-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold">{heading}</h1>
        <p className="mb-5 text-sm text-muted">
          The app ships a list of recommended works, not the works themselves — so nothing
          copyrighted is bundled into it and this list can be improved without a new
          release. Pick what you want; everything here is optional and you can come back to
          it from Settings.
        </p>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {!PROXY_AVAILABLE && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Importing does not work in this build.</strong> shamela.ws sends no CORS
            headers, so a browser can only reach it through the development proxy, and a
            deployed app has none. The list below is still the useful half: import these on
            a desktop with <code className="rounded bg-amber-100 px-1">npm run dev</code>,
            export each book from Settings → Library transfer, and load the files here.
          </div>
        )}

        {!result && !error && <Spinner label="Reading the catalog…" />}

        {result && !started && (
          <>
            {groupEntries(entries).map(([group, groupEntriesList]) => (
              <section key={group} className="mb-5">
                <h2 className="mb-2 text-sm font-semibold">{group}</h2>
                <div className="space-y-2">
                  {groupEntriesList.map((entry) => (
                    <EntryRow
                      key={entry.shamelaId}
                      entry={entry}
                      checked={selected.has(entry.shamelaId)}
                      onToggle={() => toggle(entry.shamelaId)}
                    />
                  ))}
                </div>
              </section>
            ))}

            <div className="sticky bottom-0 -mx-2 border-t border-rule bg-parchment/95 px-2 py-3 backdrop-blur">
              <p className="mb-2 text-xs text-muted">
                {chosen.length === 0 ? (
                  'Nothing selected.'
                ) : (
                  <>
                    {chosen.length} book{chosen.length === 1 ? '' : 's'} ·{' '}
                    {pages.toLocaleString()} pages · roughly {estimateMinutes(pages)} minutes
                    of downloading. They import one at a time, smallest first, so you can
                    start reading before the last one finishes.
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={chosen.length === 0 || !PROXY_AVAILABLE || !online}
                  onClick={() => void batch.start(chosen)}
                  title={
                    !PROXY_AVAILABLE
                      ? 'Not available in this build — see the note above'
                      : !online
                        ? 'Importing needs a network connection'
                        : undefined
                  }
                >
                  Import {chosen.length > 0 ? `${chosen.length} ` : ''}selected
                </Button>
                <Button variant="ghost" onClick={onDone}>
                  Skip for now
                </Button>
                <span className="text-xs text-muted">
                  Catalog v{result.catalog.version} ·{' '}
                  {result.source === 'remote' ? 'refreshed just now' : 'bundled copy'}
                </span>
              </div>
            </div>
          </>
        )}

        {started && (
          <>
            <div className="space-y-2">
              {batch.rows.map((row) => (
                <ProgressRow key={row.entry.shamelaId} row={row} />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {batch.running ? (
                <>
                  <Spinner label={`Importing… ${batch.doneCount} of ${batch.rows.length} done`} />
                  <Button onClick={batch.cancel}>Stop after this book</Button>
                </>
              ) : (
                <>
                  {batch.failedCount > 0 && (
                    <Button onClick={() => void batch.retryFailed()}>
                      Retry {batch.failedCount} failed
                    </Button>
                  )}
                  <Button variant="primary" onClick={onDone}>
                    {batch.doneCount > 0 ? 'Go to the library' : 'Done'}
                  </Button>
                </>
              )}
            </div>

            {!batch.running && batch.failedCount > 0 && (
              <p className="mt-2 text-xs text-muted">
                The books that imported are already in your library — a failure here does
                not undo them.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  checked,
  onToggle,
}: {
  entry: CatalogEntry;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
        checked ? 'border-accent bg-accent/5' : 'border-rule hover:border-accent/40'
      }`}
    >
      <input type="checkbox" className="mt-1 shrink-0" checked={checked} onChange={onToggle} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span dir="rtl" lang="ar" className="arabic text-[15px] font-medium">
            {entry.title}
          </span>
          {entry.recommended && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">
              recommended
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs font-medium">{entry.titleEn}</span>
        <span className="mt-0.5 block text-xs text-muted">{entry.description}</span>
        <span className="mt-1 block text-[11px] text-muted">
          <span dir="rtl" lang="ar" className="arabic">
            {entry.author}
          </span>
          {' · '}
          {entry.approxPages.toLocaleString()} pages · about{' '}
          {estimateMinutes(entry.approxPages)} min
        </span>
      </span>
    </label>
  );
}

function ProgressRow({ row }: { row: EntryState }) {
  const percent =
    row.status === 'done'
      ? 100
      : Math.min(99, Math.round((row.pagesDone / Math.max(1, row.entry.approxPages)) * 100));

  const label: Record<EntryState['status'], string> = {
    queued: 'waiting',
    importing: `${row.pagesDone.toLocaleString()} / ${row.entry.approxPages.toLocaleString()} pages`,
    done: 'imported',
    failed: 'failed',
    skipped: 'skipped',
  };

  return (
    <div className="rounded-md border border-rule p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span dir="rtl" lang="ar" className="arabic min-w-0 flex-1 text-[14px]">
          {row.entry.title}
        </span>
        <span
          className={`shrink-0 text-[11px] ${
            row.status === 'failed'
              ? 'text-red-700'
              : row.status === 'done'
                ? 'text-emerald-700'
                : 'text-muted'
          }`}
        >
          {label[row.status]}
        </span>
      </div>

      {(row.status === 'importing' || row.status === 'done') && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rule">
          <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}

      {row.error && <p className="mt-1.5 text-[11px] text-red-700">{row.error}</p>}
    </div>
  );
}
