import { useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { newId } from '../../lib/id';
import { normalize } from '../../lib/arabic';
import { BidiText } from '../../components/BidiText';
import { glossaryTokenEstimate } from '../../translation/prompt';
import type { GlossaryEntry } from '../../types';
import { Button, inputClass } from '../common';

/** One row of an imported file. Both key spellings are accepted. */
interface ImportedRow {
  arabic?: string;
  ar?: string;
  english?: string;
  en?: string;
  note?: string | null;
}

export function GlossaryTable() {
  const { glossary, storage, refreshGlossary } = useApp();
  const [arabic, setArabic] = useState('');
  const [english, setEnglish] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const rows = glossary.map((entry) => ({
      arabic: entry.arabic,
      english: entry.english,
      note: entry.note,
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `glossary-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Bulk import. Existing terms are matched on the normalized Arabic — the
   * same fold search uses — so ة/ه and ى/ي variants update the entry that is
   * already there instead of quietly creating a second one for the same term.
   */
  const importJson = async (file: File) => {
    setStatus('Reading…');
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const rows: ImportedRow[] = Array.isArray(parsed)
        ? (parsed as ImportedRow[])
        : ((parsed as { glossary?: ImportedRow[] }).glossary ?? []);

      if (!Array.isArray(rows) || rows.length === 0) {
        setStatus('No glossary entries found in that file.');
        return;
      }

      const existing = new Map<string, GlossaryEntry>();
      for (const entry of glossary) existing.set(normalize(entry.arabic), entry);

      let added = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        const term = (row.arabic ?? row.ar ?? '').trim();
        const gloss = (row.english ?? row.en ?? '').trim();
        if (term === '' || gloss === '') {
          skipped++;
          continue;
        }

        const key = normalize(term);
        const previous = existing.get(key);
        const entry: GlossaryEntry = {
          // Reusing the id keeps this an update rather than a duplicate.
          id: previous?.id ?? newId('gloss'),
          arabic: term,
          english: gloss,
          note: row.note && String(row.note).trim() !== '' ? String(row.note).trim() : null,
          addedAt: previous?.addedAt ?? Date.now(),
        };
        await storage.putGlossaryEntry(entry);
        existing.set(key, entry);
        if (previous) updated++;
        else added++;
      }

      await refreshGlossary();
      setStatus(
        `Imported: ${added} added, ${updated} updated${skipped ? `, ${skipped} skipped (missing Arabic or English)` : ''}.`,
      );
    } catch (caught) {
      setStatus(`Import failed: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  };

  const add = async () => {
    if (arabic.trim() === '' || english.trim() === '') return;
    await storage.putGlossaryEntry({
      id: newId('gloss'),
      arabic: arabic.trim(),
      english: english.trim(),
      note: note.trim() === '' ? null : note.trim(),
      addedAt: Date.now(),
    });
    setArabic('');
    setEnglish('');
    setNote('');
    await refreshGlossary();
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            Glossary{' '}
            <span className="text-sm font-normal text-muted">
              ({glossary.length} {glossary.length === 1 ? 'term' : 'terms'})
            </span>
          </h2>
          <p className="mt-0.5 mb-4 max-w-xl text-sm text-muted">
            Fixed renderings the model must follow. These are appended to the system
            prompt, so a term is rendered the same way in every translation call — which is
            what keeps terminology consistent across a multi-year study circle.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <Button onClick={exportJson} disabled={glossary.length === 0}>
            Export JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importJson(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      {status && (
        <p className="mb-3 rounded-md border border-rule bg-parchment px-3 py-2 text-xs text-muted">
          {status}
        </p>
      )}

      <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Changing the glossary marks every existing translation card as stale, because the
        cache key includes a hash of these terms. Nothing is re-translated automatically —
        each card gets a retranslate button — so it costs nothing until you ask for it.
        Worth settling the terms you care about before translating in bulk.
      </p>

      {/* The glossary is sent whole on every call, so its weight should be
          visible rather than invisible. It is cached after the first call of a
          session, which is why the advice is to prune rather than to filter. */}
      <p className="mb-4 rounded-md border border-rule bg-parchment px-3 py-2 text-xs text-muted">
        These terms add roughly{' '}
        <strong className="text-ink">
          {glossaryTokenEstimate(glossary).toLocaleString()} tokens
        </strong>{' '}
        to the cached part of every request. That prefix is billed in full on the first
        call of a session and on the first call after any edit, then served from cache at a
        fraction of the price. Prune terms that never appear in the text — but do not
        filter the list per passage, since a prefix that changes is a prefix that is
        re-billed every time.
      </p>

      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium">Arabic</th>
              <th className="py-2 pr-3 font-medium">English</th>
              <th className="py-2 pr-3 font-medium">Note</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {glossary.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">
                  Empty. Add terms here, or tap a flagged term on a translation card.
                </td>
              </tr>
            )}
            {glossary.map((entry) => (
              <tr key={entry.id} className="border-b border-rule/50">
                {/* Every glossary row is Arabic beside English by definition,
                    so both columns need isolating. */}
                <td className="arabic py-2 pr-3 text-lg" dir="rtl" lang="ar">
                  {entry.arabic}
                </td>
                <td dir="ltr" className="ltr-isolate py-2 pr-3">
                  <BidiText>{entry.english}</BidiText>
                </td>
                <td dir="ltr" className="ltr-isolate py-2 pr-3 text-xs text-muted">
                  <BidiText>{entry.note}</BidiText>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={async () => {
                      await storage.deleteGlossaryEntry(entry.id);
                      await refreshGlossary();
                    }}
                    className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input
          className={`${inputClass} arabic text-lg`}
          dir="rtl"
          placeholder="عبادة"
          value={arabic}
          onChange={(event) => setArabic(event.target.value)}
        />
        <input
          className={inputClass}
          placeholder="worship"
          value={english}
          onChange={(event) => setEnglish(event.target.value)}
        />
        <input
          className={inputClass}
          placeholder="note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void add()}
        />
        <Button variant="primary" onClick={() => void add()}>
          Add
        </Button>
      </div>
    </section>
  );
}
