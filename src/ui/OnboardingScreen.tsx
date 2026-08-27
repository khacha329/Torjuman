import { useState } from 'react';
import { secrets } from '../app/secrets';
import { providerFor } from '../translation/registry';
import type { CloudProviderId } from '../translation/TranslationProvider';
import { Button, inputClass } from './common';

// First run.
//
// This screen decides whether someone who installs the app ever uses it, so it
// leads with the path that costs nothing and needs no payment method. The paid
// option is present but quiet.
//
// The framing is deliberately not "basic" and "premium" — the two tiers are
// described by what they are fit for. Overpromising on the free tier would
// produce translations the user trusts more than he should, on material he
// intends to teach from.

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [providerId, setProviderId] = useState<CloudProviderId>('gemini');
  const [key, setKey] = useState('');
  const [state, setState] = useState<'idle' | 'testing' | 'invalid' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const provider = providerFor(providerId);

  const submit = async () => {
    if (!key.trim()) return;
    setState('testing');
    setMessage(null);
    try {
      const ok = await provider.validateKey(key);
      if (!ok) {
        setState('invalid');
        return;
      }
      secrets.setProviderKey(providerId, key);
      onDone();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div dir="ltr" className="ltr-isolate flex h-full items-center justify-center overflow-auto p-6">
      <div className="w-full max-w-lg">
        <h1 className="mb-1 text-xl font-semibold">Shamela Reader</h1>
        <p className="mb-6 text-sm text-muted">
          Read Arabic texts from the Shamela library, and translate the passages you
          select. Translation runs on your own API key — the app never ships with one.
        </p>

        <div className="rounded-lg border border-rule bg-white p-5">
          {providerId === 'gemini' ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <h2 className="font-medium">Start with Gemini</h2>
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">
                  free
                </span>
              </div>
              <p className="mb-4 text-sm text-muted">
                A Gemini API key is free, requires <strong>no payment method</strong>, and
                takes about two minutes to create. Good for reading along and checking
                passages you would otherwise skip.
              </p>
              <a
                href={provider.keyHelpUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-4 inline-block rounded-md border border-accent bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                Get a free key from Google AI Studio →
              </a>
            </>
          ) : (
            <>
              <div className="mb-1 flex items-center gap-2">
                <h2 className="font-medium">Use Claude</h2>
                <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                  paid
                </span>
              </div>
              <p className="mb-4 text-sm text-muted">
                Anthropic requires prepaid credits and a payment method. For passages you
                intend to teach from.
              </p>
              <a
                href={provider.keyHelpUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-4 inline-block rounded-md border border-accent bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                Create a key in the Anthropic console →
              </a>
            </>
          )}

          <label className="mb-1 block text-sm font-medium">I have a key</label>
          <input
            className={inputClass}
            dir="ltr"
            type="password"
            autoComplete="off"
            placeholder={providerId === 'gemini' ? 'AIza…' : 'sk-ant-…'}
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              setState('idle');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={!key.trim() || state === 'testing'}
            >
              {state === 'testing' ? 'Checking…' : 'Check and continue'}
            </Button>
            <Button onClick={onDone} variant="ghost">
              Skip for now
            </Button>
          </div>

          {state === 'invalid' && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              That key was rejected. Check you copied the whole thing — this is a key
              problem, not a usage limit.
            </p>
          )}
          {state === 'error' && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Could not reach {provider.displayName}: {message}
            </p>
          )}

          {/* The third path: no account at all. Presented honestly — lower
              quality, and a download — not as an equal of the cloud options. */}
          <div className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-3">
            <p className="mb-1 text-sm font-medium">Or translate on this device</p>
            <p className="mb-2 text-xs text-slate-600">
              No account and no key. Download a translation model once (about 75 MB) and it
              works with no network at all. Lower quality than either option above — good
              for reading along and getting the gist, not for a passage you will teach
              from. Qurʾānic verses still show their proper translation, which is bundled.
            </p>
            <Button onClick={onDone}>Skip for now and set it up in Settings</Button>
          </div>

          <p className="mt-4 border-t border-rule pt-3 text-xs text-muted">
            {providerId === 'gemini' ? (
              <button
                className="underline hover:text-ink"
                onClick={() => {
                  setProviderId('anthropic');
                  setKey('');
                  setState('idle');
                }}
              >
                Use Claude instead (paid, higher quality)
              </button>
            ) : (
              <button
                className="underline hover:text-ink"
                onClick={() => {
                  setProviderId('gemini');
                  setKey('');
                  setState('idle');
                }}
              >
                ← Back to the free Gemini option
              </button>
            )}
          </p>
        </div>

        <p className="mt-4 text-xs text-muted">
          Your key is stored on this device only, and is never included in a backup file.
          You can add the other provider later in Settings and switch between them per
          passage.
        </p>
      </div>
    </div>
  );
}
