import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { newId } from '../../lib/id';
import { DEFAULT_PROFILE_ID } from '../../translation/profiles';
import { providerFor } from '../../translation/registry';
import { modelsFor } from '../../translation/models';
import type { TranslationProfile } from '../../types';
import { Button, Field, inputClass } from '../common';

export function ProfileEditor() {
  const { profiles, activeProfile, saveProfile, deleteProfile, settings, updateSettings } =
    useApp();

  const [draft, setDraft] = useState<TranslationProfile>(activeProfile);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(activeProfile);
  }, [activeProfile]);

  // Provider and model are edited in the Translation section above and are
  // already part of the cache key, so they are not part of "dirty" here and do
  // not bump the version.
  const dirty =
    draft.name !== activeProfile.name ||
    draft.systemPrompt !== activeProfile.systemPrompt ||
    draft.useTransliteration !== activeProfile.useTransliteration ||
    draft.allowExternalLookup !== activeProfile.allowExternalLookup;

  const save = async () => {
    // Any edit bumps the version, which is what makes existing cards show as
    // stale rather than silently disagreeing with the new conventions.
    await saveProfile({ ...draft, version: activeProfile.version + 1 });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const duplicate = async () => {
    const copy: TranslationProfile = {
      ...draft,
      id: newId('profile'),
      name: `${draft.name} (copy)`,
      version: 1,
    };
    await saveProfile(copy);
    await updateSettings({ activeProfileId: copy.id });
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Translation profiles</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        The conventions the model follows. Editing a profile bumps its version, which
        marks existing cards as stale so you can refresh them deliberately rather than
        re-spending on every card at once.
      </p>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Field label="Active profile">
          <select
            className={inputClass}
            value={settings.activeProfileId}
            onChange={(event) => void updateSettings({ activeProfileId: event.target.value })}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} (v{profile.version})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Profile name">
          <input
            className={inputClass}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
      </div>

      <Field
        label="System prompt"
        hint="This is the wording the model receives verbatim, plus the glossary appended below it."
      >
        <textarea
          className={`${inputClass} h-72 font-mono text-xs leading-relaxed`}
          value={draft.systemPrompt}
          onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })}
        />
      </Field>

      <div className="mt-4 space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.useTransliteration}
            onChange={(event) =>
              setDraft({ ...draft, useTransliteration: event.target.checked })
            }
          />
          <span>
            Include Latin-script transliteration
            <span className="block text-xs text-muted">
              Adds a transliteration alongside each Arabic term kept in Arabic script.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.allowExternalLookup}
            onChange={(event) =>
              setDraft({ ...draft, allowExternalLookup: event.target.checked })
            }
          />
          <span>
            Allow external lookup on every request
            <span className="block text-xs text-muted">
              Off by default. It adds latency, cost, and unverified-source risk — the
              per-card "Dig deeper" button turns it on for a single request instead.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty}>
          Save (→ v{activeProfile.version + 1})
        </Button>
        <Button onClick={() => void duplicate()}>Duplicate</Button>
        <Button onClick={() => setDraft(activeProfile)} disabled={!dirty}>
          Revert
        </Button>
        {profiles.length > 1 && draft.id !== DEFAULT_PROFILE_ID && (
          <div className="ml-auto">
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(`Delete the profile "${draft.name}"?`)) {
                  void deleteProfile(draft.id);
                }
              }}
            >
              Delete profile
            </Button>
          </div>
        )}
        {saved && <span className="text-xs text-muted">Saved.</span>}
      </div>

      <p className="mt-4 text-xs text-muted">
        This profile runs on{' '}
        <strong>{providerFor(activeProfile.providerId).displayName}</strong> —{' '}
        {modelsFor(activeProfile.providerId).find((m) => m.id === activeProfile.model)
          ?.label ?? activeProfile.model}
        . Change that in the Translation section at the top of this page.
      </p>
    </section>
  );
}
