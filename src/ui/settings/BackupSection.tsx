import { useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { WorkBundle } from '../../platform/storage/StorageAdapter';
import { saveFile } from '../../lib/saveFile';
import { Button } from '../kit';
import { Section } from './Section';

// Settings → work backup: export and restore the user's work as one file.
// Moved verbatim from SettingsScreen.tsx in restructure Phase 5 step 5d8
// (docs/refactor/plans/phase5-big-ui-files.md).

/**
 * Two exports, deliberately separate.
 *
 * One monolithic file is impractical: book 9260's stored HTML alone runs to
 * tens of megabytes. So the user's own work — small, precious, irreplaceable —
 * travels on its own, and book content travels per book. Because block IDs are
 * deterministic, a work backup restores cleanly onto a device where the books
 * were imported separately, which is the normal path to a new device.
 */
export function BackupSection() {
  const { storage, reload } = useApp();
  const [status, setStatus] = useState<string | null>(null);
  const workFileRef = useRef<HTMLInputElement>(null);

  const exportWork = async () => {
    setStatus('Preparing…');
    const bundle = await storage.exportWork();

    await saveFile(
      new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
      `hashiya-work-${new Date().toISOString().slice(0, 10)}.json`,
    );

    setStatus(
      `Exported ${bundle.cards.length} translation card(s), ${bundle.explanationCards.length} explanation(s), ` +
        `${bundle.marks.length} mark(s), ${bundle.glossary.length} glossary entries.`,
    );
  };

  const importWork = async (file: File) => {
    setStatus('Restoring…');
    try {
      const bundle = JSON.parse(await file.text()) as WorkBundle;
      if (!Array.isArray(bundle.cards) || !Array.isArray(bundle.marks)) {
        setStatus('That file is not a work backup.');
        return;
      }
      const report = await storage.importWork(bundle);
      await reload();

      const missing = report.missingBooks
        .map((book) => `${book.title} (${book.shamelaId})`)
        .join(', ');

      setStatus(
        `Restored ${report.restoredCards} card(s) and ${report.restoredMarks} mark(s).` +
          (missing
            ? ` Referenced books not on this device: ${missing}. Import them and the work will bind to them automatically.`
            : ''),
      );
    } catch (caught) {
      setStatus(`Restore failed: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  };

  return (
    <Section
      title="Work backup"
      description="Your translation cards, explanations, marks, notes, glossary and profiles. Small and irreplaceable — export it regularly."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void exportWork()}>
          Export my work
        </Button>
        <Button onClick={() => workFileRef.current?.click()}>Restore from a work backup</Button>
        <input
          ref={workFileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importWork(file);
            event.target.value = '';
          }}
        />
      </div>

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}

      <p className="mt-3 text-xs text-muted">
        Book content is <strong>not</strong> in this file — it moves separately, per book,
        under Library transfer below. Because block IDs are derived from the book rather
        than allocated, work restored here binds correctly to books imported independently
        on this device. API keys are never in this file. To move everything, keys
        included if you choose, use Move to another tablet above.
      </p>
    </Section>
  );
}
