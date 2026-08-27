import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { secrets } from '../../app/secrets';
import { probeDorar } from '../../retrieval/dorar';
import { HADITH_SOURCES } from '../../retrieval/HadithSource';
import { Button } from '../common';

// Settings → Ḥadīth source.
//
// The two sources are not alternatives for the same job, and the copy here says
// so rather than presenting them as a preference. sunnah.com is the only path
// to a verified English translation. dorar.net has no English at all, and is
// selected for grading and takhrīj — which is a real gap in this app, since a
// study circle wants to know that a ḥadīth is ṣaḥīḥ and on whose authority.
//
// The test button is a connectivity check, not a stand-in for verification —
// the parser is written against a captured response in fixtures/dorar-search.json
// and covered by `npm run verify`. What it is for: dorar answers 403 to a plain
// request and only accepts one that identifies as a browser, so whether it
// works at all depends on how the app is reaching it — dev proxy today, native
// HTTP under Capacitor. This says which, in one tap, with the raw reply.

const SAMPLE = 'إنما الأعمال بالنيات';

export function HadithSourceSection() {
  const { http, settings, updateSettings } = useApp();
  const [probe, setProbe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    setProbe(null);
    try {
      const result = await probeDorar(http, SAMPLE);
      setProbe(
        `HTTP ${result.status} · ${result.hits} record(s) parsed\n\n${result.body}`,
      );
    } catch (caught) {
      setProbe(
        `The request did not complete: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Ḥadīth source</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Which service is consulted when a ḥadīth is tapped. Every response is cached
        permanently by reference, so one looked up on wifi is available on the tablet
        offline afterwards.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {HADITH_SOURCES.map((source) => {
          const selected = settings.hadithSourceId === source.id;
          const hasKey = source.id === 'sunnah' ? Boolean(secrets.getSunnahKey()) : true;

          return (
            <button
              key={source.id}
              onClick={() => void updateSettings({ hadithSourceId: source.id })}
              className={`rounded-lg border p-3 text-left transition ${
                selected
                  ? 'border-accent bg-accent/5 ring-1 ring-accent'
                  : 'border-rule hover:border-accent/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{source.displayName}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    source.providesEnglish
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {source.providesEnglish ? 'has English' : 'Arabic only'}
                </span>
                {source.needsKey && !hasKey && (
                  <span className="ml-auto text-[10px] text-muted">no key yet</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{source.note}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>dorar.net is not a translation source.</strong> Its endpoint returns Arabic
        only — the English toggle belongs to the website, not to the API. A ḥadīth with no
        verified English translation is shown in Arabic with an honest note, and is never
        passed to a translation model, on the cloud path or the on-device one. What dorar
        adds is the grading and the takhrīj.
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => void test()} disabled={busy}>
          {busy ? 'Testing…' : 'Test dorar.net'}
        </Button>
        <span className="text-xs text-muted">
          Sends one search for “{SAMPLE}” and prints the raw reply.
        </span>
      </div>

      {probe && (
        <pre
          dir="ltr"
          className="mt-3 max-h-64 overflow-auto rounded-md border border-rule bg-parchment p-2 text-[10px] whitespace-pre-wrap"
        >
          {probe}
        </pre>
      )}
    </section>
  );
}
