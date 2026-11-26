import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import {
  hrefFor,
  isSettingsTab,
  replaceRoute,
  SETTINGS_TABS,
  type SettingsTab,
} from '../../app/router';
import { DeviceTransfer } from './DeviceTransfer';
import { LibraryTransfer } from './LibraryTransfer';
import { OfflineTranslation } from './OfflineTranslation';
import { OfflineCapabilities } from './OfflineCapabilities';
import { Collapsible, LinkButton, TopBar } from '../kit';
import { EntitySection } from './EntitySection';
import { GlossaryTable } from './GlossaryTable';
import { HadithJsonResources } from './HadithJsonResources';
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

// Settings, in five tabs. Twenty-two sections in one column had become a long
// scroll on the tablet, so they are grouped by what the owner comes to do —
// translate, read, manage the library, move data, report a problem — and each
// tab is a hash route (#/settings/data), so a pointer elsewhere in the app can
// open the tab it names.
//
// Every tab stays mounted, the ones not shown hidden, so the screen does what
// the single column did: every section mounts when Settings opens, as before,
// and an export, download or transfer left running on one tab is still there,
// progress and all, after a look at another. Unmounting the hidden tabs would
// have dropped that state with no warning.
//
// The sections themselves are unchanged: this file only places them, and the
// fold on each is the shell's (ui/kit/SettingsSection.tsx).

const TAB_LABELS: Record<SettingsTab, string> = {
  translation: 'Translation',
  reading: 'Reading',
  library: 'Library',
  data: 'Data',
  about: 'About',
};

// The tab Settings was last left on, so the Library's plain "Settings" button
// comes back to it. In localStorage with the app's prefix, like the onboarding
// flags in App.tsx: it is a fact about how this tablet was last used, not part
// of the user's work, so it stays out of AppSettings and the work backup. Like
// those flags it travels in a whole-tablet transfer (library/deviceTransfer.ts
// copies every entry with the prefix), which is harmless.
const LAST_TAB_KEY = 'shamela-reader.settings-tab';

function lastTab(): SettingsTab | null {
  try {
    const stored = localStorage.getItem(LAST_TAB_KEY);
    return stored !== null && isSettingsTab(stored) ? stored : null;
  } catch {
    return null;
  }
}

function rememberTab(tab: SettingsTab): void {
  try {
    localStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    // Non-fatal: Settings opens on its first tab next time.
  }
}

// What each tab holds, in order. Built once, at module level: the elements
// never change, so a tab tap re-renders the bar and the panels' `hidden`
// and none of the 22 sections inside them.
const PANELS: Record<SettingsTab, ReactNode> = {
  // The Translation section first: the profile editor's own comment says
  // provider and model are edited "in the Translation section above".
  translation: (
    <>
      <Collapsible>
        <TranslationSection />
      </Collapsible>
      <Collapsible>
        <ProfileEditor />
      </Collapsible>
      <Collapsible>
        <KeysSection />
      </Collapsible>
      {/* Folded by default: it grows by a row per term, and is looked up
          far more often than read through, which is what its search is
          for. Its heading carries the term count, so folded it still says
          what it holds. */}
      <Collapsible defaultOpen={false}>
        <GlossaryTable />
      </Collapsible>
      <Collapsible>
        <OfflineTranslation />
      </Collapsible>
    </>
  ),
  reading: (
    <>
      <Collapsible>
        <ReadingSection />
      </Collapsible>
      <Collapsible>
        <DisplaySection />
      </Collapsible>
      <Collapsible>
        <QuranSection />
      </Collapsible>
      <Collapsible>
        <HadithSourceSection />
      </Collapsible>
      <Collapsible>
        <EntitySection />
      </Collapsible>
    </>
  ),
  library: (
    <>
      <Collapsible>
        <CatalogSection />
      </Collapsible>
      <Collapsible>
        <ReferenceWorks />
      </Collapsible>
      <Collapsible>
        <QulResources />
      </Collapsible>
      <Collapsible>
        <HadithJsonResources />
      </Collapsible>
      <Collapsible>
        <NarratorSources />
      </Collapsible>
    </>
  ),
  // The order the single column had for these three, which their own text
  // relies on: the work backup points to "Move to another tablet above" and
  // "Library transfer below", and Library transfer to "the work backup
  // above".
  data: (
    <>
      <Collapsible>
        <DeviceTransfer />
      </Collapsible>
      <Collapsible>
        <BackupSection />
      </Collapsible>
      <Collapsible>
        <LibraryTransfer />
      </Collapsible>
      <Collapsible>
        <PublishedShares />
      </Collapsible>
    </>
  ),
  about: (
    <>
      <Collapsible>
        <OfflineCapabilities />
      </Collapsible>
      {/* Next to each other on purpose: a bug report is the version plus
          what retrieval actually did, and they get copied together. */}
      <Collapsible>
        <BuildSection />
      </Collapsible>
      <Collapsible>
        <RetrievalSection />
      </Collapsible>
    </>
  ),
};

export function SettingsScreen({ tab: routeTab }: { tab?: SettingsTab }) {
  const tab = routeTab ?? lastTab() ?? SETTINGS_TABS[0];
  const contentRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // A bare #/settings is given its tab in the address, replacing the entry
  // rather than adding one, so a reload stays on the tab and the back gesture
  // still leaves Settings in one step. A named tab is remembered.
  useEffect(() => {
    if (routeTab) rememberTab(routeTab);
    else replaceRoute({ name: 'settings', tab });
  }, [routeTab, tab]);

  // Each tab opens at its top, not at whatever depth the last one was
  // scrolled to; and on a screen too narrow for the whole bar, the chosen
  // tab is scrolled into it.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  const choose = (event: MouseEvent<HTMLAnchorElement>, next: SettingsTab) => {
    // A modified click (a new tab, a new window) keeps the link's own
    // behaviour; a plain tap moves within this screen without a history entry.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    replaceRoute({ name: 'settings', tab: next });
  };

  return (
    <div dir="ltr" className="ltr-isolate flex h-full flex-col">
      <TopBar title="Settings">
        <LinkButton to={{ name: 'library' }} variant="ghost">
          Back to library
        </LinkButton>
      </TopBar>

      {/* Outside the scrolling area, so the tabs stay in reach however far
          down a tab is read. It scrolls sideways on a screen too narrow for
          all five, rather than wrapping onto a second row. */}
      <nav aria-label="Settings" className="shrink-0 border-b border-rule bg-white/80 px-6">
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto">
          {SETTINGS_TABS.map((id) => (
            <a
              key={id}
              ref={id === tab ? activeRef : undefined}
              href={hrefFor({ name: 'settings', tab: id })}
              aria-current={id === tab ? 'page' : undefined}
              onClick={(event) => choose(event, id)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition ${
                id === tab
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {TAB_LABELS[id]}
            </a>
          ))}
        </div>
      </nav>

      <div ref={contentRef} className="flex-1 overflow-auto p-6">
        {SETTINGS_TABS.map((id) => (
          <div
            key={id}
            data-settings-tab={id}
            hidden={id !== tab}
            className="mx-auto flex max-w-3xl flex-col gap-6"
          >
            {PANELS[id]}
          </div>
        ))}
      </div>
    </div>
  );
}
