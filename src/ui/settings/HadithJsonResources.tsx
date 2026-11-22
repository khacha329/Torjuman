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
  MISS_REASON_LABELS,
  type DeviceMatchReport,
  type MissReason,
  type UnmatchedHadith,
} from '../../retrieval/hadithJsonReport';
import { hadithIndexStatus, type IndexProgress, type IndexStatus } from '../../retrieval/hadithTextIndex';
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

/** One line of facts behind a miss's reason, short enough for the tablet. */
function describeMiss(item: UnmatchedHadith): string {
  const parts = [
    MISS_REASON_LABELS[item.reason],
    `own number ${item.own.hits}/${item.own.tried} shingles, longest run ${item.ownRunWords} words`,
    `${item.wordsBefore} words, ${item.wordsAfter} after stripping`,
  ];
  if (item.bestElsewhere) {
    const { number, offset, hits, tried } = item.bestElsewhere;
    parts.push(`agrees with ${number} (${offset > 0 ? '+' : ''}${offset}, ${hits}/${tried})`);
  }
  return parts.join(' · ');
}

/** The whole list as plain text, to paste into a conversation or a note. */
function reportText(report: DeviceMatchReport): string {
  return [
    `${report.bookTitle} ↔ ${report.collection}: ${report.numbered} numbered, ` +
      `${report.byNumber} by number, ${report.byNeighbour} via neighbour, ${report.unmatched.length} unmatched`,
    ...report.unmatched.map((item) => `${item.number}\t${describeMiss(item)}\t${item.firstWords}`),
  ].join('\n');
}

/** The collection's text index in one line. */
function describeIndex(status: IndexStatus): string {
  if (!status.built) {
    return status.reason === 'stale'
      ? 'Text index: from an older version — rebuilt on first use.'
      : 'Text index: not built yet — built on first use.';
  }
  const time = status.builtMs === null ? '' : `, built in ${(status.builtMs / 1000).toFixed(1)} s`;
  return `Text index: ${status.positions.toLocaleString()} positions${time}.`;
}

export function HadithJsonResources() {
  const { storage } = useApp();
  const [resources, setResources] = useState<QulResource[]>([]);
  const [pending, setPending] = useState<HadithJsonInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The text index: its build during an import, and each collection's state.
  // The "built in N s" line is how the owner reads the tablet's build time,
  // which nothing on the PC can measure.
  const [indexing, setIndexing] = useState<IndexProgress | null>(null);
  const [indexStatus, setIndexStatus] = useState<Record<string, IndexStatus>>({});

  // The match report: which imported book, running state, result.
  const [books, setBooks] = useState<Book[]>([]);
  const [reportBookId, setReportBookId] = useState('');
  const [reporting, setReporting] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<DeviceMatchReport | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // The clipboard API needs a secure context and can be refused; say so rather
  // than pretend, and the list is still on screen to read.
  const copyReport = async (current: DeviceMatchReport) => {
    try {
      await navigator.clipboard.writeText(reportText(current));
      setCopied('Copied.');
    } catch {
      setCopied('This browser refused the clipboard; read the list above instead.');
    }
  };

  const refresh = useCallback(async () => {
    const listed = await listHadithJsonResources(storage);
    setResources(listed);
    const statuses: Record<string, IndexStatus> = {};
    for (const resource of listed) statuses[resource.id] = await hadithIndexStatus(storage, resource);
    setIndexStatus(statuses);
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
    setCopied(null);
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
      const resource = await commitHadithJsonImport(storage, pending, setIndexing);
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
      setIndexing(null);
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
        dataset, imported from files you download —{' '}
        {HADITH_JSON_COLLECTIONS.map((c, i) => (
          <span key={c.slug}>
            {i > 0 ? ', ' : ''}
            <code>{c.fileName}</code>
          </span>
        ))}
        . It is shown under the book’s own Arabic, attributed “
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
        {busy && (
          <Spinner
            label={
              indexing
                ? `Building the text index: ${indexing.done.toLocaleString()} of ${indexing.total.toLocaleString()}…`
                : 'Working…'
            }
          />
        )}
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
              {indexStatus[resource.id] && (
                <span className="basis-full text-[11px] text-muted">
                  {describeIndex(indexStatus[resource.id])}
                </span>
              )}
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
                <>
                  {/* The tally is what decides the next step; the list is for
                      checking a reason against the book. */}
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                    {(Object.keys(MISS_REASON_LABELS) as MissReason[])
                      .map((reason) => [reason, report.unmatched.filter((u) => u.reason === reason).length] as const)
                      .filter(([, count]) => count > 0)
                      .map(([reason, count]) => (
                        <span key={reason}>
                          {MISS_REASON_LABELS[reason]}: {count}
                        </span>
                      ))}
                  </p>
                  <ul className="mt-2 max-h-72 divide-y divide-rule overflow-auto rounded border border-rule">
                    {report.unmatched.map((item, index) => (
                      <li key={`${item.number}-${index}`} className="px-2 py-1.5">
                        <div className="flex gap-3">
                          <span className="w-12 shrink-0 text-muted">{item.number}</span>
                          <span dir="rtl" lang="ar" className="arabic min-w-0 flex-1">
                            {item.firstWords}
                          </span>
                        </div>
                        <p className="mt-0.5 ps-15 text-[10px] text-muted">{describeMiss(item)}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button onClick={() => void copyReport(report)}>Copy the list</Button>
                    {copied && <span className="text-muted">{copied}</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
