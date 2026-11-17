import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { listEnglishTranslations, type TranslationResource } from '../../retrieval/quran';
import { Field, inputClass } from '../kit';
import { Section } from './Section';

// Settings → Qurʾān translation: the English translation used for verses
// inside a translated passage. Moved verbatim from SettingsScreen.tsx in
// restructure Phase 5 step 5d7 (docs/refactor/plans/phase5-big-ui-files.md).

export function QuranSection() {
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
