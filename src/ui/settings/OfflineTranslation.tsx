import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useOnline } from '../../app/useOnline';
import {
  cachedModelFiles,
  clearModelCache,
  DTYPE_FILE_SUFFIX,
  lastOfflineLoad,
  loadOfflineModel,
  OFFLINE_DTYPE,
  OFFLINE_MODELS,
  unloadOfflineModel,
  type DownloadProgress,
  type OfflineDtype,
  type OfflineGraphOptimization,
  type OfflineLoadDiagnostics,
} from '../../translation/offline/OfflineProvider';
import { GEMINI_DEFAULT_MODEL } from '../../translation/models';
import { Button, Field, inputClass, ProgressBar, SettingsSection } from '../kit';

// Downloading, choosing and removing the on-device translation model.
//
// The framing is deliberate: not "basic" and "premium" but what each is fit
// for. On-device is for reading along and getting the gist; cloud is for
// passages that will be taught from.

// `offline-models` is the service worker's old second copy; see OfflineProvider.
const MODEL_CACHE_PREFIXES = ['transformers-cache', 'offline-models'];

export function OfflineTranslation() {
  const { activeProfile, saveProfile } = useApp();
  const online = useOnline();

  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [usageMB, setUsageMB] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<OfflineLoadDiagnostics | null>(null);
  const [cachedFiles, setCachedFiles] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [probeModel, setProbeModel] = useState(OFFLINE_MODELS[0]);
  const [probeDtype, setProbeDtype] = useState<OfflineDtype>('q8');
  const [probeGraph, setProbeGraph] = useState<OfflineGraphOptimization | undefined>(undefined);

  const refresh = useCallback(async () => {
    // Transformers.js keeps weights in Cache Storage, so what is present there
    // is what is available offline.
    const present = new Set<string>();
    try {
      const names = await caches.keys();
      for (const name of names) {
        if (!MODEL_CACHE_PREFIXES.some((prefix) => name.includes(prefix))) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          for (const model of OFFLINE_MODELS) {
            if (request.url.includes(model.repo)) present.add(model.id);
          }
        }
      }
    } catch {
      // Cache Storage unavailable (private window). Nothing is installed.
    }
    setInstalled(present);

    try {
      const estimate = await navigator.storage?.estimate?.();
      setUsageMB(estimate?.usage ? estimate.usage / 1024 / 1024 : null);
    } catch {
      setUsageMB(null);
    }

    setCachedFiles(await cachedModelFiles());
    setDiagnostics(lastOfflineLoad());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const metered =
    typeof navigator !== 'undefined' &&
    (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      ?.saveData === true;

  const download = async (modelId: string, approxMB: number) => {
    if (
      !window.confirm(
        `Download about ${approxMB} MB?${
          metered ? '\n\nYou appear to be on a metered connection.' : ''
        }\n\nIt is stored on this device and works offline afterwards.`,
      )
    ) {
      return;
    }

    setBusy(modelId);
    setStatus(null);
    try {
      await loadOfflineModel(modelId, setProgress);
      await refresh();
      setStatus('Downloaded. Translation now works with no network and no key.');
    } catch (error) {
      setStatus(`Download failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const remove = async (modelId: string) => {
    const model = OFFLINE_MODELS.find((entry) => entry.id === modelId);
    if (!model) return;
    if (!window.confirm(`Delete ${model.label}? About ${model.approxMB} MB will be freed.`)) {
      return;
    }

    setBusy(modelId);
    try {
      const names = await caches.keys();
      for (const name of names) {
        if (!MODEL_CACHE_PREFIXES.some((prefix) => name.includes(prefix))) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (request.url.includes(model.repo)) await cache.delete(request);
        }
      }
      unloadOfflineModel();
      await refresh();
      setStatus(`Removed. About ${model.approxMB} MB reclaimed.`);
    } finally {
      setBusy(null);
    }
  };

  const usingOffline = activeProfile.providerId === 'offline';

  return (
    <SettingsSection>
      <h2 className="text-base font-semibold">Offline translation</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        A translation model that runs on this device. No account, no key, no cost, and it
        works with no network at all. It is for reading along and getting the gist; cloud
        translation is for passages you will teach from.
      </p>

      <div className="mb-4 rounded-md border border-rule bg-parchment p-3 text-xs text-muted">
        <p className="mb-1 font-medium text-ink">What it cannot do</p>
        It cannot follow your translation profile, recognise poetry, or preserve an isnād
        reliably, and it labels everything as prose. Qurʾānic verses and ḥadīth are never
        passed to it — they are resolved from the bundled muṣḥaf and your local data
        first, so a verse always shows its real translation and a ḥadīth without a verified
        source shows Arabic with a note rather than a machine rendering.
      </div>

      <div className="space-y-2">
        {OFFLINE_MODELS.map((model) => {
          const isInstalled = installed.has(model.id);
          return (
            <div
              key={model.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-rule px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{model.label}</p>
                <p className="text-xs text-muted">{model.note}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted">
                {isInstalled ? 'installed' : `~${model.approxMB} MB`}
              </span>
              {isInstalled ? (
                <Button variant="danger" onClick={() => void remove(model.id)} disabled={busy !== null}>
                  Delete
                </Button>
              ) : (
                <Button
                  onClick={() => void download(model.id, model.approxMB)}
                  disabled={busy !== null || !online}
                  title={online ? undefined : 'Downloading the model needs a network connection'}
                >
                  {busy === model.id ? 'Downloading…' : 'Download'}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {progress && (
        <div className="mt-3 rounded-md border border-rule bg-parchment p-3">
          <p className="mb-2 text-xs text-muted">
            {progress.file} — {progress.percent}%
          </p>
          <ProgressBar percent={progress.percent} />
        </div>
      )}

      {installed.size > 0 && (
        <div className="mt-4">
          <Field
            label="Use on-device translation for the active profile"
            hint="You can switch back to a cloud provider at any time, and upgrade any card with “Retranslate”."
          >
            <select
              className={inputClass}
              value={usingOffline ? activeProfile.model : ''}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '') {
                  void saveProfile({ ...activeProfile, providerId: 'gemini', model: GEMINI_DEFAULT_MODEL });
                } else {
                  void saveProfile({ ...activeProfile, providerId: 'offline', model: value });
                }
              }}
            >
              <option value="">No — use a cloud provider</option>
              {OFFLINE_MODELS.filter((model) => installed.has(model.id)).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}
      {usageMB !== null && (
        <p className="mt-2 text-xs text-muted">
          This app is currently using about {usageMB.toFixed(0)} MB on this device.
        </p>
      )}

      {/* Which weights are actually running.
          A session-creation failure names an ONNX operator and nothing else —
          `MatMulNBits` means a 4-bit artifact was executed — so the only way to
          act on it is to see what was requested against what was fetched. */}
      <div className="mt-4 border-t border-rule pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="text-[11px] text-muted underline"
            onClick={() => {
              setShowDiagnostics((previous) => !previous);
              void refresh();
            }}
          >
            {showDiagnostics ? 'Hide' : 'Show'} model diagnostics
          </button>
          <span className="text-[11px] text-muted">
            Active dtype: <strong className="text-ink">{OFFLINE_DTYPE}</strong> → files ending{' '}
            <code className="rounded bg-rule/50 px-1">{DTYPE_FILE_SUFFIX[OFFLINE_DTYPE]}</code>
          </span>
        </div>

        {showDiagnostics && (
          <div className="mt-3 space-y-3 text-[11px] text-muted">
            <div>
              <p className="font-medium text-ink">Last load attempt</p>
              {diagnostics ? (
                <ul className="mt-1 space-y-0.5">
                  <li>
                    {diagnostics.repo} · requested <strong>{diagnostics.requestedDtype}</strong>{' '}
                    ({diagnostics.expectedSuffix}) on {diagnostics.device}
                  </li>
                  <li>
                    {diagnostics.ok ? 'Loaded' : 'Failed'}
                    {diagnostics.durationMs !== null && ` in ${diagnostics.durationMs} ms`}
                  </li>
                  {diagnostics.error && (
                    <li className="text-red-700">{diagnostics.error}</li>
                  )}
                  <li>graph optimisation: {diagnostics.graphOptimization}</li>
                  <li className="mt-1 font-medium text-ink">
                    Files loaded ({diagnostics.files.length})
                  </li>
                  {diagnostics.files.length === 0 ? (
                    <li>No file was reported.</li>
                  ) : (
                    diagnostics.files.map((entry) => (
                      <li key={entry.file} className="break-all">
                        <strong>{entry.source}</strong> · {entry.file}
                        {entry.bytes > 0 && ` · ${(entry.bytes / 1048576).toFixed(1)} MB`}
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <p className="mt-1">Nothing loaded yet this session.</p>
              )}
            </div>

            <div>
              <p className="font-medium text-ink">
                ONNX artifacts in Cache Storage ({cachedFiles.length})
              </p>
              {cachedFiles.length === 0 ? (
                <p className="mt-1">None cached.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {cachedFiles.map((url) => {
                    const name = url.split('/').pop() ?? url;
                    const suffix = DTYPE_FILE_SUFFIX[OFFLINE_DTYPE];
                    const matches =
                      suffix === '(no suffix)'
                        ? /^(encoder|decoder)[a-z_]*\.onnx$/.test(name)
                        : name.includes(suffix.replace('(no suffix)', ''));
                    return (
                      <li key={url} className={matches ? '' : 'text-amber-700'}>
                        {name}
                        {!matches && ' — does not match the active dtype'}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Trying another dtype without editing code. fp32 is the useful
                one: too large to ship, but if it loads and translates then the
                runtime is fine and the problem is the artifact. */}
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block font-medium text-ink">Model</span>
                <select
                  className={`${inputClass} w-44`}
                  value={probeModel.id}
                  onChange={(event) =>
                    setProbeModel(
                      OFFLINE_MODELS.find((model) => model.id === event.target.value) ??
                        OFFLINE_MODELS[0],
                    )
                  }
                >
                  {OFFLINE_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-ink">Try a dtype</span>
                <select
                  className={`${inputClass} w-44`}
                  value={probeDtype}
                  onChange={(event) => setProbeDtype(event.target.value as OfflineDtype)}
                >
                  {(Object.keys(DTYPE_FILE_SUFFIX) as OfflineDtype[]).map((dtype) => (
                    <option key={dtype} value={dtype}>
                      {dtype} → {DTYPE_FILE_SUFFIX[dtype]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-ink">Graph optimisation</span>
                <select
                  className={`${inputClass} w-32`}
                  value={probeGraph ?? ''}
                  onChange={(event) =>
                    setProbeGraph((event.target.value || undefined) as OfflineGraphOptimization | undefined)
                  }
                >
                  <option value="">default</option>
                  <option value="disabled">disabled</option>
                  <option value="basic">basic</option>
                  <option value="extended">extended</option>
                  <option value="all">all</option>
                </select>
              </label>
              <Button
                disabled={busy !== null}
                onClick={() => {
                  void (async () => {
                    setBusy('probe');
                    setStatus(null);
                    try {
                      const translator = await loadOfflineModel(
                        probeModel.id,
                        setProgress,
                        { dtype: probeDtype, graphOptimizationLevel: probeGraph },
                      );
                      // A sentence with a word the small model has got wrong
                      // (الظهر, the noon prayer, read as "back"), so the probe
                      // says something about quality, not only that it ran.
                      const output = await translator('صلينا الظهر في المسجد ثم قرأنا الحديث.', {
                        ...probeModel.languages,
                      });
                      setStatus(
                        `${probeDtype}: ${probeModel.id} loaded and translated → "${output?.[0]?.translation_text ?? '(empty)'}"`,
                      );
                    } catch (error) {
                      setStatus(
                        `${probeDtype}: ${probeModel.id}: ${error instanceof Error ? error.message : String(error)}`,
                      );
                    } finally {
                      setBusy(null);
                      setProgress(null);
                      unloadOfflineModel();
                      await refresh();
                    }
                  })();
                }}
              >
                Load and translate
              </Button>

              <Button
                variant="danger"
                disabled={busy !== null}
                onClick={() => {
                  void (async () => {
                    const removed = await clearModelCache();
                    setStatus(
                      `Cleared ${removed} cached file(s). The next download re-fetches from the Hub.`,
                    );
                    await refresh();
                  })();
                }}
                title="A stale artifact from an earlier build is served from cache and never reaches the network, so it is invisible to the fetch log above"
              >
                Clear cached weights
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
