import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import {
  cachedModelFiles,
  lastOfflineLoad,
  OFFLINE_DTYPE,
} from '../../translation/offline/OfflineProvider';
import { Button } from '../common';
import { formatRetrievalLog } from '../../app/retrievalLog';

// Which build is this, and what state is it in.
//
// The point is the copy button. A bug report that says "it does X" is only
// actionable against a known build with known resources — otherwise the first
// three exchanges are spent establishing what the tester is actually running.
// Everything here is already on the device; this only makes it quotable.
//
// Deliberately excluded: API keys, book text, and anything a reader wrote. The
// report names what is installed, never what is in it.

function formatBuildTime(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function BuildSection() {
  const { storage, seedOutcome } = useApp();
  const [copied, setCopied] = useState(false);
  const [modelFiles, setModelFiles] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void cachedModelFiles()
      .then((files) => {
        if (!cancelled) setModelFiles(files);
      })
      .catch(() => {
        if (!cancelled) setModelFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = useCallback(async () => {
    const [books, resources] = await Promise.all([
      storage.listBooks(),
      storage.listQulResources(),
    ]);
    const load = lastOfflineLoad();

    const lines = [
      `Ḥāshiya diagnostics`,
      `version      ${__APP_VERSION__}`,
      `built        ${__BUILD_TIME__}`,
      `copied       ${new Date().toISOString()}`,
      `url          ${location.origin}${location.pathname}`,
      `agent        ${navigator.userAgent}`,
      `online       ${navigator.onLine}`,
      `standalone   ${window.matchMedia('(display-mode: standalone)').matches}`,
      ``,
      `books (${books.length})`,
      ...(books.length === 0
        ? ['  none']
        : books.map(
            (book) =>
              `  ${book.id}  ${book.role ?? 'reading'}  ` +
              `${book.fetchedPages}/${book.totalPages} pages  ${book.importStatus}`,
          )),
      ``,
      `qul resources (${resources.length})`,
      ...(resources.length === 0
        ? ['  none']
        : resources.map(
            (resource) =>
              `  ${resource.kind}  ${resource.entryCount} entries  ` +
              `${resource.seed ? `seeded v${resource.seed.version}` : 'imported by hand'}`,
          )),
      ...(seedOutcome
        ? [
            `  seeding: ${seedOutcome.installed.length} installed, ` +
              `${seedOutcome.upToDate.length} up to date, ` +
              `${seedOutcome.absent.length} not shipped by licence, ` +
              `${seedOutcome.missing.length} MISSING FROM BUILD, ` +
              `${Object.keys(seedOutcome.failed).length} failed`,
            // Named individually, and in capitals, because this line is the
            // difference between "the licence says no" and "the deployment
            // dropped a file that was committed" — and the second one is a bug
            // that otherwise presents as an empty tab.
            ...(seedOutcome.missing.length > 0
              ? [`  MISSING: ${seedOutcome.missing.join(', ')} — committed but not served`]
              : []),
          ]
        : []),
      ``,
      `retrieval this session`,
      ...formatRetrievalLog(),
      ``,
      `offline model`,
      `  requested dtype  ${OFFLINE_DTYPE}`,
      `  last load        ${
        load
          ? `${load.modelId} · ${load.device} · requested ${load.requestedDtype} ` +
            `→ ${load.expectedSuffix} · ${load.ok ? 'ok' : `FAILED: ${load.error}`}`
          : 'never loaded'
      }`,
      // The .onnx URLs actually fetched. This is the line that settled the q4
      // question once before: what the config asks for and what the runtime
      // pulls are separate facts, and only the second one explains a failure.
      ...(load?.onnxFetched.length
        ? [`  onnx fetched`, ...load.onnxFetched.map((url) => `    ${url}`)]
        : []),
      `  cached files (${modelFiles?.length ?? 0})`,
      ...((modelFiles ?? []).length === 0
        ? ['    none']
        : (modelFiles ?? []).map((file) => `    ${file}`)),
    ];

    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused, and on a tablet that is common enough
      // that failing silently would be the wrong answer. Fall back to a
      // selectable prompt the reader can copy out by hand.
      window.prompt('Copy this into the bug report:', text);
    }
  }, [modelFiles, seedOutcome, storage]);

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">This build</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Quote the version when reporting anything. Deploys are cut from tags, so
        the version below names an exact build rather than "whatever was live".
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Version</dt>
        <dd className="font-mono">{__APP_VERSION__}</dd>
        <dt className="text-muted">Built</dt>
        <dd>{formatBuildTime(__BUILD_TIME__)}</dd>
      </dl>

      {/* Loud on purpose. A committed resource that did not reach the build is
          invisible everywhere else in the app — the tab it feeds simply does
          not render, which is also what a deliberately unshipped resource looks
          like. This is the only place the two are told apart. */}
      {seedOutcome && seedOutcome.missing.length > 0 && (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
          <strong>{seedOutcome.missing.length} bundled resource(s) missing from this
          build:</strong>{' '}
          {seedOutcome.missing.join(', ')}. These are committed to the repository and
          should have been served. This is a build fault, not a licence one — check
          that <code>.gitignore</code> is not excluding them and that they were
          committed.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void copy()}>Copy diagnostics</Button>
        {copied && <span className="text-xs text-muted">Copied to the clipboard.</span>}
      </div>

      <p className="mt-3 text-[11px] text-muted">
        Includes the version, what is imported and what the on-device model has
        cached. It contains no API keys and no book text.
      </p>
    </section>
  );
}
