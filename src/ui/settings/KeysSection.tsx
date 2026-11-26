import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { secrets } from '../../services/secrets';
import { allProviders, modelLabel, providerFor } from '../../translation/providers/registry';
import type { CloudProviderId } from '../../types';
import { Button, inputClass } from '../kit';
import { Section } from './Section';

// Settings → API keys: one field per cloud provider, and the sunnah.com key.
// `TestState`, `ProviderKeyField` and `SunnahKeyField` are this section's
// own parts. Moved verbatim from SettingsScreen.tsx in restructure Phase 5
// step 5d4 (docs/refactor/plans/phase5-big-ui-files.md).

export function KeysSection() {
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
  const { profiles } = useApp();
  const [value, setValue] = useState(() => secrets.getProviderKey(providerId));
  const [state, setState] = useState<TestState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  // Of the models this app is set to use on this provider, those the key's
  // own model list leaves out (lane B2). Shown under "Key works".
  const [unusable, setUnusable] = useState<string[]>([]);
  // The configured models: every one offered (the fallback chain runs
  // through them) and any a profile is pinned to.
  const configuredModels = [
    ...provider.availableModels.map((model) => model.id),
    ...profiles.filter((profile) => profile.providerId === providerId).map((profile) => profile.model),
  ];

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
    setUnusable([]);
    try {
      const check = await provider.validateKey(value, configuredModels);
      setState(check.valid ? 'valid' : 'invalid');
      setUnusable(check.unusableModels);
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
        placeholder={provider.keyPlaceholder}
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

      {state === 'valid' && unusable.length > 0 && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
          This key’s model list does not include{' '}
          {unusable.map((model) => `${modelLabel(providerId, model)} (${model})`).join(', ')}.
          {provider.displayName} is likely to refuse them: a profile on one fails with that reason, and
          the fallback moves past one that refuses.
        </p>
      )}
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
