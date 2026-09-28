import { useState } from 'react';
import { AppProvider } from './app/AppContext';
import { secrets } from './app/secrets';
import { navigate, useRoute } from './app/router';
import { LibraryScreen } from './ui/LibraryScreen';
import { CatalogScreen } from './ui/CatalogScreen';
import { ImportScreen } from './ui/ImportScreen';
import { OnboardingScreen } from './ui/OnboardingScreen';
import { ReaderScreen } from './ui/reader/ReaderScreen';
import { ShareScreen } from './ui/share/ShareScreen';
import { SettingsScreen } from './ui/settings/SettingsScreen';
import { UpdateBar } from './ui/UpdateBar';

const ONBOARDED_FLAG = 'shamela-reader.onboarded';
const CATALOG_SEEN_FLAG = 'shamela-reader.catalogOffered';

function flagSet(name: string): boolean {
  try {
    return localStorage.getItem(name) === '1';
  } catch {
    return false;
  }
}

function setFlag(name: string): void {
  try {
    localStorage.setItem(name, '1');
  } catch {
    // Non-fatal: the screen just shows again next launch.
  }
}

function Routes() {
  const route = useRoute();

  // Shown once, before anything else, on a device with no key at all. It is
  // skippable — the reader then carries a quiet persistent prompt instead.
  const [onboarded, setOnboarded] = useState(
    () => flagSet(ONBOARDED_FLAG) || secrets.hasAnyProviderKey(),
  );
  // Offered once, immediately after the key step: a new install has an empty
  // library, and hunting Shamela IDs by hand is the setup burden this removes.
  const [catalogOffered, setCatalogOffered] = useState(() => flagSet(CATALOG_SEEN_FLAG));

  // A shared link skips both setup screens, and this is load-bearing rather
  // than a convenience. Amendment 18's whole promise is "no account, no key, no
  // install" — but both gates below fire on exactly the state a first-time
  // visitor arrives in, so without this they would be asked to choose a
  // translation provider and import books before being allowed to read the
  // chapter they were sent. Neither screen is skipped permanently: the flags
  // are untouched, so a visitor who later opens the app on its own still gets
  // the normal introduction.
  if (route.name === 'share') {
    return <ShareScreen id={route.id} keyText={route.key} />;
  }

  if (!onboarded) {
    return (
      <OnboardingScreen
        onDone={() => {
          setFlag(ONBOARDED_FLAG);
          setOnboarded(true);
        }}
      />
    );
  }

  if (!catalogOffered) {
    return (
      <CatalogScreen
        onDone={() => {
          setFlag(CATALOG_SEEN_FLAG);
          setCatalogOffered(true);
        }}
      />
    );
  }

  switch (route.name) {
    case 'import':
      return <ImportScreen />;
    case 'catalog':
      return <CatalogScreen heading="Add from catalog" onDone={() => navigate({ name: 'library' })} />;
    case 'reader':
      return <ReaderScreen bookId={route.bookId} />;
    case 'settings':
      return <SettingsScreen />;
    case 'library':
      return <LibraryScreen />;
  }
}

export function App() {
  return (
    <AppProvider>
      <Routes />
      {/* Outside Routes on purpose: an update notice must not disappear
          because the reader navigated to Settings. */}
      <UpdateBar />
    </AppProvider>
  );
}
