import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext';
import { secrets } from '../../app/secrets';
import { listEnglishTranslations, type TranslationResource } from '../../retrieval/quran';
import { allProviders, providerFor } from '../../translation/registry';
import { defaultModelFor, modelsFor } from '../../translation/models';
import type { CloudProviderId } from '../../translation/TranslationProvider';
import type { WorkBundle } from '../../platform/storage/StorageAdapter';
import { LibraryTransfer } from './LibraryTransfer';
import { OfflineTranslation } from './OfflineTranslation';
import { OfflineCapabilities } from './OfflineCapabilities';
import { Button, Field, inputClass, LinkButton, TopBar } from '../common';
import { EntitySection } from './EntitySection';
import { GlossaryTable } from './GlossaryTable';
import { HadithSourceSection } from './HadithSourceSection';
import { ProfileEditor } from './ProfileEditor';
import { QulResources } from './QulResources';
import { ReferenceWorks } from './ReferenceWorks';

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
          <QuranSection />
          <HadithSourceSection />
          <EntitySection />
          <ReferenceWorks />
          <QulResources />
          <ProfileEditor />
          <GlossaryTable />
          <BackupSection />
          <LibraryTransfer />
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 mb-4 text-sm text-muted">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}

/**
 * The suggested library, reachable again after first run.
 *
 * The catalog is a list of Shamela IDs and a line each on why the book is
 * worth having — the app never contains the books, which is what keeps a
 * distributed build clear of redistributing modern copyrighted commentary.
 */
function CatalogSection() {
  return (
    <Section
      title="Add from catalog"
      description="Recommended works with their Shamela IDs, grouped by what they are for. The list is bundled and refreshes from the project repository when you are online."
    >
      <LinkButton to={{ name: 'catalog' }} variant="primary">
        Open the catalog
      </LinkButton>
    </Section>
  );
}

/**
 * Which service the active profile runs on.
 *
 * The profile pins both provider and model, so this writes to the profile
 * rather than to a global setting. It deliberately does not bump the profile
 * version: providerId and model are already part of the cache key, so changing
 * them produces a new card naturally instead of marking every existing card —
 * including ones made on the other provider — as stale.
 */
function TranslationSection() {
  const { activeProfile, saveProfile } = useApp();

  const chooseProvider = async (providerId: CloudProviderId) => {
    const models = modelsFor(providerId);
    const keepModel = models.some((model) => model.id === activeProfile.model);
    await saveProfile({
      ...activeProfile,
      providerId,
      model: keepModel ? activeProfile.model : defaultModelFor(providerId),
    });
  };

  return (
    <Section
      title="Translation"
      description={`Which service the "${activeProfile.name}" profile runs on. Profiles pin both, so you can keep one for quick reading and another for lesson preparation.`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {allProviders().map((provider) => {
          const selected = activeProfile.providerId === provider.id;
          const hasKey = secrets.hasProviderKey(provider.id);

          return (
            <button
              key={provider.id}
              onClick={() => void chooseProvider(provider.id)}
              className={`rounded-lg border p-3 text-left transition ${
                selected
                  ? 'border-accent bg-accent/5 ring-1 ring-accent'
                  : 'border-rule hover:border-accent/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{provider.displayName}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    provider.isFree
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-accent/15 text-accent'
                  }`}
                >
                  {provider.isFree ? 'free' : 'paid'}
                </span>
                {!hasKey && <span className="ml-auto text-[10px] text-muted">no key yet</span>}
              </div>
              <p className="mt-1 text-xs text-muted">{provider.fitFor}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <Field label="Model">
          <select
            className={inputClass}
            value={activeProfile.model}
            onChange={(event) =>
              void saveProfile({ ...activeProfile, model: event.target.value })
            }
          >
            {modelsFor(activeProfile.providerId).map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="mt-1 text-xs text-muted">
          {modelsFor(activeProfile.providerId).find((m) => m.id === activeProfile.model)?.note}
        </p>
      </div>
    </Section>
  );
}

function KeysSection() {
  return (
    <Section
      title="API keys"
      description="Both providers are bring-your-own-key. Keys are stored per provider, so you can hold both and switch freely."
    >
      <div className="space-y-5">
        {allProviders().map((provider) => (
          <ProviderKeyField key={provider.id} providerId={provider.id} />
        ))}
        <SunnahKeyField />

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Where these are kept.</strong> Keys are stored in this browser's
          localStorage on this device. That is readable by anything with access to this
          browser profile, and it is deliberately excluded from the backup file so a backup
          you copy around never carries a billable key. No key is ever built into the app.
          When it is packaged for Android these move into encrypted preferences.
        </div>
      </div>
    </Section>
  );
}

type TestState = 'idle' | 'testing' | 'valid' | 'invalid' | 'error';

function ProviderKeyField({ providerId }: { providerId: CloudProviderId }) {
  const provider = providerFor(providerId);
  const [value, setValue] = useState(() => secrets.getProviderKey(providerId));
  const [state, setState] = useState<TestState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    secrets.setProviderKey(providerId, value);
    setState('idle');
    setMessage('Saved.');
    setTimeout(() => setMessage(null), 1800);
  };

  // Users mis-paste keys constantly, and a silent failure at translation time
  // is a bad first experience. This checks before it matters.
  const test = async () => {
    secrets.setProviderKey(providerId, value);
    setState('testing');
    setMessage(null);
    try {
      const ok = await provider.validateKey(value);
      setState(ok ? 'valid' : 'invalid');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="rounded-md border border-rule p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{provider.displayName}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
            provider.isFree ? 'bg-emerald-100 text-emerald-900' : 'bg-accent/15 text-accent'
          }`}
        >
          {provider.isFree ? 'free' : 'paid'}
        </span>
        <a
          href={provider.keyHelpUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-accent underline"
        >
          Get a key →
        </a>
      </div>

      <input
        className={inputClass}
        dir="ltr"
        type="password"
        autoComplete="off"
        placeholder={providerId === 'anthropic' ? 'sk-ant-…' : 'AIza…'}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setState('idle');
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Button onClick={save}>Save</Button>
        <Button onClick={() => void test()} disabled={!value.trim() || state === 'testing'}>
          {state === 'testing' ? 'Testing…' : 'Test key'}
        </Button>
        {state === 'valid' && (
          <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">
            ✓ Key works
          </span>
        )}
        {state === 'invalid' && (
          <span className="rounded bg-red-50 px-2 py-1 text-red-800">
            ✕ Rejected — check you copied the whole key
          </span>
        )}
        {state === 'error' && (
          <span className="rounded bg-amber-50 px-2 py-1 text-amber-900">
            Could not reach {provider.displayName}: {message}
          </span>
        )}
        {message && state === 'idle' && <span className="text-muted">{message}</span>}
      </div>
    </div>
  );
}

function SunnahKeyField() {
  const [value, setValue] = useState(() => secrets.getSunnahKey());
  const [saved, setSaved] = useState(false);

  return (
    <div className="rounded-md border border-rule p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">sunnah.com</span>
        <span className="text-[10px] text-muted">optional</span>
      </div>
      <input
        className={inputClass}
        dir="ltr"
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <p className="mt-1 text-xs text-muted">
        Without it, hadith segments show the Arabic and an explicit note that no verified
        English translation was retrieved.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button
          onClick={() => {
            secrets.setSunnahKey(value);
            setSaved(true);
            setTimeout(() => setSaved(false), 1800);
          }}
        >
          Save
        </Button>
        {saved && <span className="text-xs text-muted">Saved.</span>}
      </div>
    </div>
  );
}

function ReadingSection() {
  const { settings, updateSettings } = useApp();

  return (
    <Section title="Reading">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Font">
          <select
            className={inputClass}
            value={settings.fontFamily}
            onChange={(event) => void updateSettings({ fontFamily: event.target.value })}
          >
            <option value="Amiri">Amiri</option>
            <option value="Scheherazade New">Scheherazade New</option>
          </select>
        </Field>

        <Field label={`Text size — ${settings.fontSize}px`}>
          <input
            type="range"
            min={18}
            max={44}
            value={settings.fontSize}
            onChange={(event) => void updateSettings({ fontSize: Number(event.target.value) })}
            className="w-full"
          />
        </Field>

        <Field
          label={`Line height — ${settings.lineHeight.toFixed(1)}`}
          hint="Harakāt need vertical room; below 2.0 the marks start to collide."
        >
          <input
            type="range"
            min={1.8}
            max={3}
            step={0.1}
            value={settings.lineHeight}
            onChange={(event) => void updateSettings({ lineHeight: Number(event.target.value) })}
            className="w-full"
          />
        </Field>
      </div>

      <p
        dir="rtl"
        lang="ar"
        className="arabic mt-5 rounded-md border border-rule bg-parchment p-4"
        style={{
          fontFamily: `'${settings.fontFamily}', serif`,
          fontSize: settings.fontSize,
          ['--reader-line-height' as string]: String(settings.lineHeight),
        }}
      >
        وَإِذْ تَأَذَّنَ رَبُّكُمْ لَئِنْ شَكَرْتُمْ لَأَزِيدَنَّكُمْ وَلَئِنْ كَفَرْتُمْ إِنَّ عَذَابِي لَشَدِيدٌ
      </p>
    </Section>
  );
}

function QuranSection() {
  const { http, settings, updateSettings } = useApp();
  const [options, setOptions] = useState<TranslationResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEnglishTranslations(http)
      .then(setOptions)
      .catch(() => setError('Could not reach the quran.com API to list translations.'));
  }, [http]);

  const khattabAvailable = options?.some((option) =>
    /khattab|clear qur/i.test(`${option.name} ${option.authorName}`),
  );

  return (
    <Section
      title="Qurʾān translation"
      description="Used for verses inside a translated passage. The model never translates a verse itself."
    >
      <Field label="English translation">
        <select
          className={inputClass}
          value={settings.quranTranslationId}
          onChange={(event) => {
            const id = Number(event.target.value);
            const chosen = options?.find((option) => option.id === id);
            void updateSettings({
              quranTranslationId: id,
              quranTranslationName: chosen?.name ?? String(id),
            });
          }}
        >
          {options === null && <option>Loading…</option>}
          {options?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} — {option.authorName}
            </option>
          ))}
        </select>
      </Field>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {/* The compiled view. Off by default and stated as an addition, because
          the retrieved tabs are the interface and this one generates. */}
      <label className="mt-5 flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={settings.compileEnabled}
          onChange={(event) => void updateSettings({ compileEnabled: event.target.checked })}
        />
        <span className="text-sm">
          Offer a <strong>Compiled</strong> tab on verse sheets
          <span className="mt-0.5 block text-xs text-muted">
            Writes one account of an āyah from the tafsīr, similar āyāt and topics already on
            screen — and from nothing else. It is badged as generated, it never replaces the
            source tabs, and it needs a network and a cloud provider. The tabs themselves
            need neither.
          </span>
        </span>
      </label>

      {options && !khattabAvailable && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Dr. Mustafa Khattab's "The Clear Qurʾān" is not offered above.</strong> It
          has been withdrawn from the public quran.com API — it is absent from the{' '}
          {options.length} English translations the API now lists, and requests for its old
          ID return an empty result. It is not on the open mirrors either, because it is
          exclusively licensed. The default here is Saheeh International. This list is read
          live from the API, so if Khattab returns it will appear without any change to the
          app.
        </div>
      )}
    </Section>
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

    download(
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
        on this device. API keys are never included in any export.
      </p>
    </Section>
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
