import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { WebHttpClient } from '../platform/http/WebHttpClient';
import { IdbStorageAdapter } from '../platform/storage/IdbStorageAdapter';
import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import { Crawler } from '../ingest/crawler';
import type { AppSettings, GlossaryEntry, TranslationProfile } from '../types';
import { createDefaultProfile, DEFAULT_PROFILE_ID } from '../translation/profiles';
import { DEFAULT_PROVIDER_ID } from '../translation/registry';
import { DEFAULT_TRANSLATION_ID, DEFAULT_TRANSLATION_NAME } from '../retrieval/quran';
import { seedQulResources, type SeedOutcome, type SeedProgress } from '../qul/seed';

// Composition root. The concrete WebHttpClient and IdbStorageAdapter are chosen
// here and nowhere else — swapping in the Capacitor implementations later is a
// two-line change in this file.

const DEFAULT_SETTINGS: AppSettings = {
  providerId: DEFAULT_PROVIDER_ID,
  activeProfileId: DEFAULT_PROFILE_ID,
  fontFamily: 'Amiri',
  fontSize: 26,
  lineHeight: 2.1,
  panelWidth: 460,
  panelCollapsed: false,
  // Visible is the working view: it tracks the reader continuously, so the
  // panel always reflects what is in front of the user and nothing else.
  panelScope: 'visible',
  quranTranslationId: DEFAULT_TRANSLATION_ID,
  quranTranslationName: DEFAULT_TRANSLATION_NAME,
  // sunnah.com by default: it is the only source that carries a verified
  // English translation, and precedence follows from that rather than from
  // preference.
  hadithSourceId: 'sunnah',
  // The retrieved tabs are the primary interface. Compiling is opt-in.
  compileEnabled: false,
};

interface AppServices {
  http: HttpClient;
  storage: StorageAdapter;
  crawler: Crawler;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  profiles: TranslationProfile[];
  activeProfile: TranslationProfile;
  saveProfile: (profile: TranslationProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  glossary: GlossaryEntry[];
  refreshGlossary: () => Promise<void>;
  reload: () => Promise<void>;
  /** Non-null only while the bundled QUL resources are installing. */
  seeding: SeedProgress | null;
  /** What the last seeding run did, for Settings and diagnostics. */
  seedOutcome: SeedOutcome | null;
}

const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <AppProvider>');
  return context;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [profiles, setProfiles] = useState<TranslationProfile[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [seeding, setSeeding] = useState<SeedProgress | null>(null);
  const [seedOutcome, setSeedOutcome] = useState<SeedOutcome | null>(null);

  const services = useMemo(() => {
    const http = new WebHttpClient();
    const storage = new IdbStorageAdapter();
    return { http, storage, crawler: new Crawler(http, storage) };
  }, []);

  const loadAll = useCallback(async () => {
    const stored = await services.storage.getSettings();
    setSettings({ ...DEFAULT_SETTINGS, ...stored });

    let allProfiles = await services.storage.listProfiles();
    if (allProfiles.length === 0) {
      const seeded = createDefaultProfile();
      await services.storage.putProfile(seeded);
      allProfiles = [seeded];
    } else {
      // Profiles written before providers existed have a model but no
      // providerId. Infer it from the model rather than dropping them onto the
      // default provider, which would leave a Claude model pinned to Gemini.
      const migrated = await Promise.all(
        allProfiles.map(async (profile) => {
          if (profile.providerId) return profile;
          const inferred: TranslationProfile = {
            ...profile,
            providerId: profile.model?.startsWith('claude') ? 'anthropic' : 'gemini',
          };
          await services.storage.putProfile(inferred);
          return inferred;
        }),
      );
      allProfiles = migrated;
    }
    setProfiles(allProfiles);
    setGlossary(await services.storage.listGlossary());
  }, [services]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await services.storage.init();
        if (cancelled) return;

        // Ask Android not to evict the database under storage pressure. A book
        // is ~50k blocks and an hour of crawling; losing it to a background
        // eviction would be silent and unrecoverable without re-importing.
        try {
          await navigator.storage?.persist?.();
        } catch {
          // Not supported, or refused. Nothing to do but carry on.
        }
        await loadAll();
        if (!cancelled) setReady(true);

        // Bundled QUL resources, after the app is usable and never before it.
        // This copies ~3.5 MB into IndexedDB on a first boot, and the reader
        // must not wait on it: a verse sheet opened mid-seed simply shows the
        // tabs that are ready. Failures are recorded, not thrown — an install
        // with no network is a normal state, and it retries next launch.
        void (async () => {
          try {
            // Read straight from storage rather than from the `settings` state:
            // this runs in the same tick that loadAll set it, so the state
            // variable is still the previous render's value and a resource the
            // user removed would come straight back.
            const stored = await services.storage.getSettings();
            const outcome = await seedQulResources(
              services.storage,
              import.meta.env.BASE_URL,
              stored?.qulSeedRemoved ?? [],
              (progress) => {
                if (!cancelled) setSeeding(progress);
              },
            );
            if (!cancelled) setSeedOutcome(outcome);
          } catch (caught) {
            // Seeding must never be able to take the app down with it.
            if (!cancelled) {
              setSeedOutcome({
                installed: [],
                upToDate: [],
                absent: [],
                failed: { '*': caught instanceof Error ? caught.message : String(caught) },
              });
            }
          } finally {
            if (!cancelled) setSeeding(null);
          }
        })();
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services, loadAll]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      setSettings((previous) => {
        const next = { ...previous, ...patch };
        void services.storage.putSettings(next);
        return next;
      });
    },
    [services],
  );

  const saveProfile = useCallback(
    async (profile: TranslationProfile) => {
      await services.storage.putProfile(profile);
      setProfiles(await services.storage.listProfiles());
    },
    [services],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      await services.storage.deleteProfile(id);
      const remaining = await services.storage.listProfiles();
      setProfiles(remaining);
      if (settings.activeProfileId === id && remaining[0]) {
        await updateSettings({ activeProfileId: remaining[0].id });
      }
    },
    [services, settings.activeProfileId, updateSettings],
  );

  const refreshGlossary = useCallback(async () => {
    setGlossary(await services.storage.listGlossary());
  }, [services]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === settings.activeProfileId) ?? profiles[0],
    [profiles, settings.activeProfileId],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-900">
          <p className="mb-2 font-semibold">The local database could not be opened.</p>
          <p className="mb-3 font-mono text-xs">{error}</p>
          <p>
            This usually means the browser is blocking site data. Private windows and
            strict privacy settings disable IndexedDB.
          </p>
        </div>
      </div>
    );
  }

  if (!ready || !activeProfile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Opening library…
      </div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        ...services,
        settings,
        updateSettings,
        profiles,
        activeProfile,
        saveProfile,
        deleteProfile,
        glossary,
        refreshGlossary,
        reload: loadAll,
        seeding,
        seedOutcome,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
