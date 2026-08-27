import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { commitQulImport, inspectQulFile, type QulInspection } from '../../qul/importResource';
import { QulFormatError } from '../../qul/read';
import { liveSqlJsRuntimes } from '../../qul/sqlite';
import type { QulResource } from '../../types';
import { Button, Spinner } from '../common';

// Settings → QUL resources.
//
// One import flow for both formats. The user downloads a resource from QUL in a
// browser and hands the file over here; nothing constructs a download URL,
// because QUL does not publish a stable one and a guessed URL breaks silently
// the day they reorganise — which is exactly the kind of failure that looks
// like a bug in this app.
//
// Import is two steps on purpose. What was detected is shown first, with real
// counts and a real excerpt from the file, and only then is anything written.

const KIND_LABELS: Record<QulResource['kind'], string> = {
  tafsir: 'Tafsīr',
  'ayah-matching': 'Ayah matching',
  topics: 'Topics',
  'surah-info': 'Surah info',
};

export function QulResources() {
  const { storage } = useApp();
  const [resources, setResources] = useState<QulResource[]>([]);
  const [pending, setPending] = useState<QulInspection | null>(null);
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setResources(await storage.listQulResources());
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const inspect = async (file: File) => {
    setReading(true);
    setError(null);
    setStatus(null);
    setPending(null);
    try {
      setPending(await inspectQulFile(file));
    } catch (caught) {
      setError(
        caught instanceof QulFormatError
          ? caught.message
          : `That file could not be read: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    } finally {
      setReading(false);
    }
  };

  const commit = async () => {
    if (!pending) return;
    setReading(true);
    try {
      const resource = await commitQulImport(storage, pending);
      setPending(null);
      setStatus(
        `Imported ${resource.name} — ${resource.entryCount.toLocaleString()} entries. ` +
          'It resolves offline from now on.',
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setReading(false);
    }
  };

  const remove = async (resource: QulResource) => {
    if (
      !window.confirm(
        `Remove "${resource.name}" and its ${resource.entryCount.toLocaleString()} entries from this device?`,
      )
    ) {
      return;
    }
    await storage.deleteQulResource(resource.id);
    await refresh();
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">QUL resources</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Tafsīr, similar āyāt, topics and sūrah background, imported from files you download
        from the{' '}
        <a
          className="text-accent underline"
          href="https://qul.tarteel.ai/resources"
          target="_blank"
          rel="noreferrer"
        >
          Qurʾān Universal Library
        </a>
        . Every one of them is keyed by sūrah or āyah, so tapping a verse resolves them with
        no search, no model and no network.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => fileRef.current?.click()}>
          Import QUL resource
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.db,.sqlite,.sql,application/json,application/octet-stream"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void inspect(file);
            event.target.value = '';
          }}
        />
        {reading && <Spinner label="Reading the file…" />}
        <span className="text-xs text-muted">JSON or SQLite — the format is detected.</span>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <strong>Not imported.</strong> {error}
        </div>
      )}

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}

      {pending && (
        <div className="mt-4 rounded-md border border-accent/40 bg-accent/5 p-3">
          <p className="text-sm font-medium">{pending.label}</p>
          <p className="mt-0.5 text-xs text-muted">
            {pending.fileName} · {(pending.byteSize / 1_048_576).toFixed(2)} MB ·{' '}
            {pending.format === 'sqlite' ? 'read from SQLite' : 'JSON'}
          </p>

          <ul className="mt-2 list-disc pl-4 text-xs text-muted">
            {pending.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>

          {pending.sample && (
            <p
              dir="auto"
              className="arabic mt-3 rounded border border-rule bg-white p-2 text-[13px] leading-relaxed"
            >
              {pending.sample}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void commit()} disabled={reading}>
              Import this
            </Button>
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <span className="text-[11px] text-muted">
              Check the excerpt above reads correctly before importing.
            </span>
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
              <span className="shrink-0 rounded-full bg-rule/50 px-2 py-0.5 text-[10px]">
                {KIND_LABELS[resource.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{resource.name}</span>
              <span className="shrink-0 text-[11px] text-muted">
                {resource.entryCount.toLocaleString()} entries ·{' '}
                {(resource.byteSize / 1_048_576).toFixed(2)} MB
              </span>
              <Button variant="danger" onClick={() => void remove(resource)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-muted">
        SQLite files are read once, here, and then discarded — the rows are normalized into
        this app's own database so every lookup goes through one path. No SQL engine stays
        loaded afterwards
        {liveSqlJsRuntimes() === 0 ? ' (none is loaded right now).' : '.'}
      </p>
    </section>
  );
}
