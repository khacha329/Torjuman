import { useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { WorkBundle } from '../../platform/storage/StorageAdapter';
import { DeviceTransfer } from './DeviceTransfer';
import { LibraryTransfer } from './LibraryTransfer';
import { saveFile } from '../../lib/saveFile';
import { OfflineTranslation } from './OfflineTranslation';
import { OfflineCapabilities } from './OfflineCapabilities';
import { Button, LinkButton, TopBar } from '../kit';
import { EntitySection } from './EntitySection';
import { GlossaryTable } from './GlossaryTable';
import { HadithSourceSection } from './HadithSourceSection';
import { ProfileEditor } from './ProfileEditor';
import { QulResources } from './QulResources';
import { ReferenceWorks } from './ReferenceWorks';
import { BuildSection } from './BuildSection';
import { RetrievalSection } from './RetrievalSection';
import { NarratorSources } from './NarratorSources';
import { PublishedShares } from './PublishedShares';
import { Section } from './Section';
import { CatalogSection } from './CatalogSection';
import { TranslationSection } from './TranslationSection';
import { KeysSection } from './KeysSection';
import { ReadingSection } from './ReadingSection';
import { DisplaySection } from './DisplaySection';
import { QuranSection } from './QuranSection';

export function SettingsScreen() {
  return (
    <div dir="ltr" className="ltr-isolate flex h-full flex-col">
      <TopBar title="Settings">
        <LinkButton to={{ name: 'library' }} variant="ghost">
          Back to library
        </LinkButton>
      </TopBar>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <OfflineCapabilities />
          <CatalogSection />
          <TranslationSection />
          <OfflineTranslation />
          <KeysSection />
          <ReadingSection />
          <DisplaySection />
          <QuranSection />
          <HadithSourceSection />
          <EntitySection />
          <ReferenceWorks />
          <QulResources />
          <NarratorSources />
          <ProfileEditor />
          <GlossaryTable />
          <PublishedShares />
          <DeviceTransfer />
          <BackupSection />
          <LibraryTransfer />
          {/* Next to the build panel on purpose: a bug report is the version
              plus what retrieval actually did, and they get copied together. */}
          <RetrievalSection />
          <BuildSection />
        </div>
      </div>
    </div>
  );
}

/**
 * Two exports, deliberately separate.
 *
 * One monolithic file is impractical: book 9260's stored HTML alone runs to
 * tens of megabytes. So the user's own work — small, precious, irreplaceable —
 * travels on its own, and book content travels per book. Because block IDs are
 * deterministic, a work backup restores cleanly onto a device where the books
 * were imported separately, which is the normal path to a new device.
 */
function BackupSection() {
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
