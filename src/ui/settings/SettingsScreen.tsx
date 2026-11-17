import { DeviceTransfer } from './DeviceTransfer';
import { LibraryTransfer } from './LibraryTransfer';
import { OfflineTranslation } from './OfflineTranslation';
import { OfflineCapabilities } from './OfflineCapabilities';
import { LinkButton, TopBar } from '../kit';
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
import { CatalogSection } from './CatalogSection';
import { TranslationSection } from './TranslationSection';
import { KeysSection } from './KeysSection';
import { ReadingSection } from './ReadingSection';
import { DisplaySection } from './DisplaySection';
import { QuranSection } from './QuranSection';
import { BackupSection } from './BackupSection';

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
