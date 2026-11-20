import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { HADITH_JSON_ATTRIBUTION, HADITH_JSON_COLLECTIONS, HadithJsonFormatError } from '../../retrieval/hadithJson';
import {
  commitHadithJsonImport,
  inspectHadithJsonFile,
  listHadithJsonResources,
  type HadithJsonInspection,
} from '../../retrieval/hadithJsonImport';
import {
  matchBookAgainstCollection,
  type DeviceMatchReport,
} from '../../retrieval/hadithJsonReport';
import { hadithCollectionFor } from '../../quran/detectEntities';
import type { Book, QulResource } from '../../types';
import { Button, Spinner, SettingsSection } from '../kit';

// Settings → Ḥadīth English (hadith-json).
//
// The English of Riyāḍ aṣ-Ṣāliḥīn and Nawawī's Forty from the hadith-json
// dataset, imported from files the user downloads. Nothing is fetched from here
// and nothing is bundled or committed: the text is sunnah.com's, the repository
// is public, and how to distribute it legitimately is a later decision.
//
// Two steps, as the QUL import is: what was detected is shown first, with real
// counts and a real excerpt, and only then is anything written.

export function HadithJsonResources() {
  const { storage } = useApp();
  const [resources, setResources] = useState<QulResource[]>([]);
  const [pending, setPending] = useState<HadithJsonInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The match report: which imported book, running state, result.
  const [books, setBooks] = useState<Book[]>([]);
  const [reportBookId, setReportBookId] = useState('');
  const [reporting, setReporting] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<DeviceMatchReport | null>(null);

  const refresh = useCallback(async () => {
    setResources(await listHadithJsonResources(storage));
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void storage.listBooks().then(setBooks);
  }, [storage, resources]);

  // A book can be measured against an imported collection when its numbering
  // follows it: by the collection stored at import, or by its title for a book
  // imported before the collection was known (re-detecting entities is not
  // needed for a measurement, which reads blocks).
  const measurable = books
    .map((book) => {
      const slug = book.hadithCollection ?? hadithCollectionFor(book.title);
      const resource = resources.find((r) => r.collection === slug);
      return slug && resource ? { book, resource } : null;
    })
    .filter((item): item is { book: Book; resource: QulResource } => item !== null);
  const chosen = measurable.find((item) => item.book.id === reportBookId) ?? measurable[0];

  const runReport = async () => {
    if (!chosen) return;
    setReport(null);
    setReporting({ done: 0, total: 0 });
    try {
      setReport(
        await matchBookAgainstCollection(storage, chosen.book, chosen.resource, (done, total) =>
          setReporting({ done, total }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setReporting(null);
    }
  };

  const inspect = async (file: File) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    setPending(null);
    try {
      setPending(await inspectHadithJsonFile(file));
    } catch (caught) {
      setError(
        caught instanceof HadithJsonFormatError
          ? caught.message
          : `That file could not be read: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const resource = await commitHadithJsonImport(storage, pending);
      setPending(null);
      setStatus(
        `Imported ${resource.name} — ${resource.entryCount.toLocaleString()} ḥadīth. ` +
          'It resolves offline from now on.',
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (resource: QulResource) => {
    if (
      !window.confirm(
        `Remove "${resource.name}" from this device? The file you imported it from is not touched.`,
      )
    ) {
      return;
    }
    await storage.deleteQulResource(resource.id);
    await refresh();
  };

  return (
    <SettingsSection>
      <h2 className="text-base font-semibold">Ḥadīth English (hadith-json)</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        The English of{' '}
        {new Intl.ListFormat('en', { type: 'conjunction' }).format(
          HADITH_JSON_COLLECTIONS.map((c) => c.displayName),
        )}{' '}
        from the{' '}
        <a
          className="text-accent underline"
          href="https://github.com/AhmedBaset/hadith-json"
          target="_blank"
          rel="noreferrer"
        >
          hadith-json
        </a>{' '}
        dataset, imported from files you download — <code>riyad_assalihin.json</code>,{' '}
        <code>nawawi40.json</code>, <code>bukhari.json</code>, <code>muslim.json</code>. It is shown under the book’s own Arabic, attributed “
        {HADITH_JSON_ATTRIBUTION}”. Each ḥadīth is found by its number and then checked
        against the book’s text, so a numbering that has drifted shows nothing rather than
        the wrong ḥadīth. The files stay on this device.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => fileRef.current?.click()}>
          Import hadith-json file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void inspect(file);
            event.target.value = '';
          }}
        />
        {busy && <Spinner label="Working…" />}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <strong>Not imported.</strong> {error}
        </div>
      )}

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}

      {pending && (
        <div className="mt-4 rounded-md border border-accent/40 bg-accent/5 p-3">
          <p className="text-sm font-medium">{pending.collection.displayName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {pending.fileName} · {(pending.byteSize / 1_048_576).toFixed(2)} MB
          </p>
          <ul className="mt-2 list-disc pl-4 text-xs text-muted">
            {pending.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
          <p dir="ltr" className="mt-3 rounded border border-rule bg-white p-2 text-[13px] leading-relaxed">
            {pending.sample}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void commit()} disabled={busy}>
              Import this
            </Button>
            <Button onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {resources.length > 0 && (
        <div className="mt-4 space-y-2">
          {resources.map((resource) => (
            <div
              key={resource.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-rule px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{resource.name}</span>
              <span className="shrink-0 text-[11px] text-muted">
                {resource.entryCount.toLocaleString()} ḥadīth ·{' '}
                {(resource.byteSize / 1_048_576).toFixed(2)} MB
              </span>
              <Button variant="danger" onClick={() => void remove(resource)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {measurable.length > 0 && (
        <div className="mt-5 border-t border-rule pt-4">
          <h3 className="text-sm font-semibold">Match report</h3>
          <p className="mt-0.5 mb-3 text-xs text-muted">
            Checks every numbered ḥadīth of an imported book against the collection, with the
            same rule a tap uses: the printed number, confirmed by text, then the ten numbers
            either side. Nothing is written.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-rule bg-white px-2 py-1.5 text-sm"
              value={chosen?.book.id ?? ''}
              onChange={(event) => {
                setReportBookId(event.target.value);
                setReport(null);
              }}
            >
              {measurable.map(({ book, resource }) => (
                <option key={book.id} value={book.id}>
                  {book.title} ↔ {resource.collection}
                </option>
              ))}
            </select>
            <Button onClick={() => void runReport()} disabled={reporting !== null}>
              Run match report
            </Button>
            {reporting && (
              <Spinner
                label={reporting.total ? `Checking ${reporting.done} of ${reporting.total}…` : 'Reading the book…'}
              />
            )}
          </div>

          {report && (
            <div className="mt-3 rounded-md border border-rule p-3 text-xs">
              <p className="font-medium">
                {report.bookTitle} ↔ {report.collection}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                <li>Numbered ḥadīth: {report.numbered}</li>
                <li>Matched by number: {report.byNumber}</li>
                <li>Matched via a neighbouring number: {report.byNeighbour}</li>
                <li>Unmatched: {report.unmatched.length}</li>
                <li className="text-muted">
                  ({report.unnumbered} ḥadīth blocks have no number and are not counted.)
                </li>
              </ul>
              {report.numbered > 0 && (
                <p className="mt-1.5 text-muted">
                  {(((report.byNumber + report.byNeighbour) * 100) / report.numbered).toFixed(1)}%
                  matched overall.
                </p>
              )}
              {report.unmatched.length > 0 && (
                <ul className="mt-2 max-h-64 divide-y divide-rule overflow-auto rounded border border-rule">
                  {report.unmatched.map((item, index) => (
                    <li key={`${item.number}-${index}`} className="flex gap-3 px-2 py-1">
                      <span className="w-12 shrink-0 text-muted">{item.number}</span>
                      <span dir="rtl" lang="ar" className="arabic min-w-0 flex-1">
                        {item.firstWords}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
