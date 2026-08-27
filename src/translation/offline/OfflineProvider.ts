import type { ModelOption } from '../TranslationProvider';
import { TranslationError } from '../TranslationProvider';
import {
  applyPlaceholders,
  placeholdersIntact,
  restorePlaceholders,
  splitSentences,
} from './sentences';

// On-device translation, via a dedicated neural machine translation model run
// through Transformers.js. No native plugin, no Capacitor work, no API key.
//
// ---------------------------------------------------------------------------
// What this cannot do, stated plainly because the UI says so too.
//
// An NMT model is not an instruction-following model. It cannot:
//
//   * follow the translation profile or any system prompt
//   * apply the glossary by being told to (placeholder substitution is the
//     workaround, and it is a substitution, not comprehension)
//   * emit typed segments beyond `prose`
//   * recognise poetry, or summarise it
//   * preserve an isnād or takhrīj reliably
//
// It is for reading along and getting the gist. Cloud translation is for
// passages to be taught from. That framing is the honest one and is what the
// UI uses — not "basic" and "premium".
//
// A dedicated NMT model was chosen over a small general LLM deliberately: it
// beats a 1–3B LLM at pure translation at a fraction of the size, and it avoids
// the instruction-following failures that make small LLMs unsafe here. No
// on-device general LLM is attempted — WebGPU in the Android WebView is
// inconsistent and the capability is not needed once entity handling is
// deterministic.
//
// It NEVER receives scripture. See offline/segmentSelection.ts: verses and
// hadith are resolved and finished before this runs, and only prose spans are
// handed over.
// ---------------------------------------------------------------------------

export const OFFLINE_MODELS: (ModelOption & { repo: string; approxMB: number })[] = [
  {
    id: 'opus-mt-ar-en',
    repo: 'Xenova/opus-mt-ar-en',
    // Measured, not estimated: encoder_model_quantized.onnx is 49.4 MB and
    // decoder_model_merged_quantized.onnx is 56.4 MB, plus a 6.4 MB tokenizer.
    // The previous figure of 75 MB was optimistic by a third, which matters
    // when the download is happening on a phone.
    approxMB: 112,
    label: 'OPUS-MT Arabic→English — small',
    note: 'About 112 MB. Serviceable for getting the gist; the faster of the two.',
  },
  {
    id: 'nllb-200-distilled-600M',
    repo: 'Xenova/nllb-200-distilled-600M',
    approxMB: 480,
    label: 'NLLB-200 distilled — better',
    note: 'About 480 MB. Noticeably better Arabic, slower, and a large download.',
  },
];

export function offlineModelById(id: string) {
  return OFFLINE_MODELS.find((model) => model.id === id) ?? OFFLINE_MODELS[0];
}

// ---------------------------------------------------------------------------
// Which weights are actually loaded
//
// This was opaque, and being opaque cost real time: a session failed with
//
//   qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits
//   Missing required scale: model.shared.weight_merged_0_scale
//
// `MatMulNBits` is the 4-bit operator, so a q4 artifact was being executed
// while the code requested q8. Neither the request nor the fetch was visible
// anywhere, so there was nothing to check except by guessing.
//
// So the loader now records what it asked for, what the library resolved, and
// every URL that was actually fetched — and, because a Cache Storage hit never
// reaches `fetch` at all, the cache can be listed separately. A stale entry
// from an earlier build is invisible to network logging and is exactly the kind
// of thing that produces a q4 file when q8 was asked for.
// ---------------------------------------------------------------------------

/**
 * The dtype this app pins.
 *
 * Verified against what the repos publish rather than assumed. Both
 * `Xenova/opus-mt-ar-en` and `Xenova/nllb-200-distilled-600M` ship these ONNX
 * suffixes and no others:
 *
 *   (none) _fp16 _int8 _uint8 _quantized _q4 _q4f16 _bnb4
 *
 * There is no `_q8` file in either repo. Transformers.js maps the *dtype name*
 * `q8` onto the `_quantized` suffix, so `q8` is correct and `int8`/`uint8` name
 * different files. This is the sort of thing worth pinning explicitly rather
 * than leaving to `auto`, which resolves per-device and would silently differ
 * between the desktop and the tablet.
 */
export const OFFLINE_DTYPE = 'q8' as const;

/**
 * The dtype request, given per session file rather than as a bare string.
 *
 * A string applies to every session, which is the same result — but it leaves
 * *how* each file resolved implicit, and the failure this replaced was
 * precisely a disagreement between the requested dtype and the executed
 * artifact. Naming both sessions means the resolution is stated rather than
 * inferred, and a session this does not name would produce a library warning
 * instead of silently taking a per-device default.
 *
 * Both models are merged seq2seq exports, so these two are the whole set.
 * Measured: q8 fetches encoder_model_quantized.onnx (49.4 MB) and
 * decoder_model_merged_quantized.onnx (56.4 MB).
 */
export function dtypeSpecFor(dtype: OfflineDtype): Record<string, OfflineDtype> {
  return { encoder_model: dtype, decoder_model_merged: dtype };
}

/** The dtypes both repos actually publish a file for. */
export type OfflineDtype =
  | 'fp32'
  | 'fp16'
  | 'int8'
  | 'uint8'
  | 'q8'
  | 'q4'
  | 'q4f16'
  | 'bnb4';

/** Suffix Transformers.js maps each dtype onto, for the diagnostics view. */
export const DTYPE_FILE_SUFFIX: Record<OfflineDtype, string> = {
  fp32: '(no suffix)',
  fp16: '_fp16',
  int8: '_int8',
  uint8: '_uint8',
  q8: '_quantized',
  q4: '_q4',
  q4f16: '_q4f16',
  bnb4: '_bnb4',
};

export interface OfflineLoadDiagnostics {
  modelId: string;
  repo: string;
  /** What the app asked for. */
  requestedDtype: string;
  /** The ONNX suffix that dtype maps onto. */
  expectedSuffix: string;
  device: string;
  /** Every URL fetched during the load, in order. */
  fetched: string[];
  /** Just the .onnx ones, which is what the error is ever about. */
  onnxFetched: string[];
  startedAt: number;
  durationMs: number | null;
  ok: boolean;
  error: string | null;
}

let lastLoad: OfflineLoadDiagnostics | null = null;

/** What the most recent load attempt asked for and fetched. */
export function lastOfflineLoad(): OfflineLoadDiagnostics | null {
  return lastLoad;
}

const MODEL_CACHE_PREFIXES = ['transformers-cache', 'offline-models'];

/**
 * ONNX artifacts already in Cache Storage.
 *
 * A cached response never reaches `fetch`, so network logging cannot see it.
 * This is what makes a stale artifact from an earlier build visible — and it
 * is the first thing to check when the executed weights disagree with the
 * requested dtype.
 */
export async function cachedModelFiles(): Promise<string[]> {
  const found: string[] = [];
  try {
    for (const name of await caches.keys()) {
      if (!MODEL_CACHE_PREFIXES.some((prefix) => name.includes(prefix))) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (request.url.includes('.onnx')) found.push(request.url);
      }
    }
  } catch {
    // Cache Storage unavailable (private window). Nothing is cached.
  }
  return found.sort();
}

/** Remove every cached ONNX artifact, for both models. */
export async function clearModelCache(): Promise<number> {
  let removed = 0;
  for (const name of await caches.keys()) {
    if (!MODEL_CACHE_PREFIXES.some((prefix) => name.includes(prefix))) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (await cache.delete(request)) removed++;
    }
  }
  unloadOfflineModel();
  return removed;
}

export interface DownloadProgress {
  file: string;
  loaded: number;
  total: number;
  percent: number;
}

type Translator = (
  input: string,
  options?: Record<string, unknown>,
) => Promise<{ translation_text: string }[]>;

let pipelinePromise: Promise<Translator> | null = null;
let loadedModelId: string | null = null;

/**
 * Load (and on first use, download) the model.
 *
 * Transformers.js caches the weights in Cache Storage, so this is a one-time
 * download per model and is available offline afterwards.
 */
export async function loadOfflineModel(
  modelId: string,
  onProgress?: (progress: DownloadProgress) => void,
  /** Diagnostic only — the settings screen's "try another dtype" control. */
  dtypeOverride?: OfflineDtype,
): Promise<Translator> {
  if (pipelinePromise && loadedModelId === modelId && !dtypeOverride) return pipelinePromise;

  const model = offlineModelById(modelId);
  loadedModelId = modelId;

  const diagnostics: OfflineLoadDiagnostics = {
    modelId,
    repo: model.repo,
    requestedDtype: dtypeOverride ?? OFFLINE_DTYPE,
    expectedSuffix: DTYPE_FILE_SUFFIX[dtypeOverride ?? OFFLINE_DTYPE] ?? '(unknown)',
    device: 'wasm',
    fetched: [],
    onnxFetched: [],
    startedAt: Date.now(),
    durationMs: null,
    ok: false,
    error: null,
  };
  lastLoad = diagnostics;

  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    // Weights come from the Hub and are cached; nothing else is fetched at
    // runtime, so the app stays offline-capable once this has run once.
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    // Record every URL the load actually requests. Wrapped only for the
    // duration of the load and always restored, so nothing else in the app
    // sees a patched fetch.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      diagnostics.fetched.push(url);
      if (url.includes('.onnx')) diagnostics.onnxFetched.push(url);
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const translator = await pipeline('translation', model.repo, {
        // Pinned, never `auto`: `auto` resolves per-device, so the desktop and
        // the tablet would silently run different weights.
        dtype: dtypeSpecFor(dtypeOverride ?? OFFLINE_DTYPE),
        // Pinned too. The 4-bit artifacts load under onnxruntime-node but fail
        // session creation on the WASM backend inside `MatMulNBits` graph
        // optimisation, so which backend runs is not a detail to leave open.
        device: 'wasm',
        progress_callback: (event: {
          status?: string;
          file?: string;
          loaded?: number;
          total?: number;
          progress?: number;
        }) => {
          if (event.status !== 'progress' || !onProgress) return;
          onProgress({
            file: event.file ?? '',
            loaded: event.loaded ?? 0,
            total: event.total ?? 0,
            percent: Math.round(event.progress ?? 0),
          });
        },
      });

      return translator as unknown as Translator;
    } finally {
      globalThis.fetch = originalFetch;
    }
  })();

  try {
    const translator = await pipelinePromise;
    diagnostics.ok = true;
    diagnostics.durationMs = Date.now() - diagnostics.startedAt;
    return translator;
  } catch (error) {
    pipelinePromise = null;
    loadedModelId = null;
    diagnostics.ok = false;
    diagnostics.durationMs = Date.now() - diagnostics.startedAt;
    diagnostics.error = error instanceof Error ? error.message : String(error);

    // A session-creation failure is not a network failure, and calling it one
    // sends the user to check their wifi. `MatMulNBits` in particular means a
    // 4-bit artifact was executed — which, when the request was q8, means the
    // file came from somewhere other than this request.
    const isSessionError = /session|ERROR_CODE|MatMulNBits|qdq_actions/i.test(
      diagnostics.error,
    );

    throw new TranslationError(
      isSessionError ? 'api' : 'network',
      isSessionError
        ? `The model downloaded but the runtime could not create a session from it. ` +
          `Requested ${diagnostics.requestedDtype} (${diagnostics.expectedSuffix}); ` +
          `${diagnostics.onnxFetched.length} ONNX file(s) were fetched. ` +
          `See Settings → Offline translation → diagnostics. Underlying error: ${diagnostics.error}`
        : `The offline model could not be loaded: ${diagnostics.error}`,
    );
  }
}

export function isOfflineModelLoaded(modelId: string): boolean {
  return pipelinePromise !== null && loadedModelId === modelId;
}

/** Forget the in-memory pipeline. Cached weights are removed separately. */
export function unloadOfflineModel(): void {
  pipelinePromise = null;
  loadedModelId = null;
}

export interface OfflineTranslateOptions {
  modelId: string;
  glossary: { arabic: string; english: string }[];
  onProgress?: (done: number, total: number) => void;
}

/**
 * Translate prose spans. Nothing else is ever passed in.
 *
 * Each span is split into sentences, because an NMT model works sentence by
 * sentence and silently truncates anything past its window.
 */
export async function translateProse(
  spans: string[],
  options: OfflineTranslateOptions,
): Promise<string[]> {
  const translator = await loadOfflineModel(options.modelId);

  const results: string[] = [];
  let done = 0;

  for (const span of spans) {
    const { text, restore } = applyPlaceholders(span, options.glossary);
    const sentences = splitSentences(text);
    const rendered: string[] = [];

    for (const sentence of sentences) {
      try {
        const output = await translator(sentence, { max_new_tokens: 512 });
        rendered.push(output?.[0]?.translation_text ?? '');
      } catch (error) {
        throw new TranslationError(
          'api',
          `The offline model failed on a sentence: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    let joined = rendered.join(' ').replace(/\s+/g, ' ').trim();

    // If the tokenizer mangled the markers, fall back to the untouched text
    // rather than leaving stray tokens in the output.
    if (restore.size > 0 && !placeholdersIntact(joined, restore)) {
      const plain = splitSentences(span);
      const redone: string[] = [];
      for (const sentence of plain) {
        const output = await translator(sentence, { max_new_tokens: 512 });
        redone.push(output?.[0]?.translation_text ?? '');
      }
      joined = redone.join(' ').replace(/\s+/g, ' ').trim();
    } else {
      joined = restorePlaceholders(joined, restore);
    }

    results.push(joined);
    done++;
    options.onProgress?.(done, spans.length);
  }

  return results;
}
