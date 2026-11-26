import { useApp } from '../../app/AppContext';
import { secrets } from '../../services/secrets';
import { ANTHROPIC_CROSS_FALLBACK_MODEL } from '../../translation/models';
import {
  allProviders,
  defaultModelFor,
  modelLabel,
  modelsFor,
} from '../../translation/providers/registry';
import type { CloudProviderId } from '../../types';
import { Field, inputClass } from '../kit';
import { Section } from './Section';

// Settings → translation: the active profile's provider and model. Moved
// verbatim from SettingsScreen.tsx in restructure Phase 5 step 5d3
// (docs/refactor/plans/phase5-big-ui-files.md).

/**
 * Which service the active profile runs on.
 *
 * The profile pins both provider and model, so this writes to the profile
 * rather than to a global setting. It deliberately does not bump the profile
 * version: providerId and model are already part of the cache key, so changing
 * them produces a new card naturally instead of marking every existing card —
 * including ones made on the other provider — as stale.
 */
export function TranslationSection() {
  const { activeProfile, saveProfile, settings, updateSettings } = useApp();

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

      {/* Lane B2. Within a provider the fallback always runs; this is only
          whether it may cross to the other one, which for Gemini means a
          paid Claude request. */}
      <label className="mt-4 flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={settings.crossProviderFallback}
          onChange={(event) =>
            void updateSettings({ crossProviderFallback: event.target.checked })
          }
        />
        <span className="text-sm">
          When every model of a provider is busy, ask the other provider
          <span className="mt-0.5 block text-xs text-muted">
            A busy model is retried, then the other models of the same provider are asked in
            turn. With this on, a Gemini translation then goes to Claude{' '}
            {modelLabel('anthropic', ANTHROPIC_CROSS_FALLBACK_MODEL)} (paid) if a Claude key is
            set, and a Claude one to Gemini if a Gemini key is set. The card says
            which model answered and why. The on-device model is never asked.
          </span>
        </span>
      </label>
    </Section>
  );
}
