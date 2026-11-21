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

export interface OfflineModel extends ModelOption {
  repo: string;
  approxMB: number;
  /**
   * Passed with every call. A one-pair model (OPUS-MT ar→en) needs nothing; a
   * many-language model (NLLB) must be told both sides, and Transformers.js
   * throws `Target language code "undefined" is not valid` without them.
   */
  languages?: { src_lang: string; tgt_lang: string };
}

export const OFFLINE_MODELS: OfflineModel[] = [
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
    // Measured in Chromium (q8): encoder_model_quantized.onnx is 400 MB and
    // decoder_model_merged_quantized.onnx 453 MB, plus a 17 MB tokenizer. The
    // earlier 480 MB was a guess.
    approxMB: 870,
    // FLORES-200 codes: Modern Standard Arabic in Arabic script, English.
    languages: { src_lang: 'arb_Arab', tgt_lang: 'eng_Latn' },
    label: 'NLLB-200 distilled — larger',
    // Measured on five paragraphs of book 9260 on a desktop: more fluent than
    // OPUS-MT and closer to the register (Allah, the Straight Path), but it
    // drops clauses and invents some, and it took ~10 s a sentence against
    // OPUS-MT's ~1.5 s. "Better" was not something to promise.
    note: 'About 870 MB. More fluent but can drop or invent phrases; several times slower.',
  },
];

export function offlineModelById(id: string) {
  return OFFLINE_MODELS.find((model) => model.id === id) ?? OFFLINE_MODELS[0];
}

// ---------------------------------------------------------------------------
// Which weights are actually loaded
//
// A session once failed with
//
//   qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits
//   Missing required scale: model.shared.weight_merged_0_scale
//
// and it was first read as "a q4 file was executed while q8 was requested",
// then "fixed" after a check under onnxruntime-node. Neither was right: the
// diagnostics showed the q8 files were the ones loaded, and onnxruntime-node is
// not the browser's runtime. Measured in Chromium (onnxruntime-web, WASM), q8
// fails at the default graph optimisation level and loads and translates at
// 'basic' and 'disabled'; see OFFLINE_GRAPH_OPTIMIZATION and the README.
//
// So the loader records what it asked for and, from the library's own `env.fetch`
// hook and progress events, every file it loaded and whether that came from the
// network or the cache.
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
 * ONNX Runtime graph optimisation for the sessions. `undefined` would leave the
 * runtime's default, `all`, under which q8 fails session creation in
 * onnxruntime-web (the `qdq_actions` error). 'basic' is the least change that
 * loads and translates in Chromium; measurements in the README ("Which ONNX
 * weights actually run").
 */
export const OFFLINE_GRAPH_OPTIMIZATION: OfflineGraphOptimization | undefined = 'basic';

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
 * Measured in the browser: q8 loads encoder_model_quantized.onnx (49.4 MB) and
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

/** Where one model file came from during a load. */
export interface OfflineLoadedFile {
  /** Path inside the repo, as Transformers.js names it (`onnx/encoder_model_quantized.onnx`). */
  file: string;
  /** `network` if the library asked for the file's URL through `env.fetch`; `cache` if not. */
  source: 'network' | 'cache';
  /** Bytes, from the library's own progress events; 0 if it reported none. */
  bytes: number;
}

/** What a diagnostic load may vary. Anything left out takes the app's pinned value. */
export interface OfflineLoadOptions {
  dtype?: OfflineDtype;
  /** ONNX Runtime's graph optimisation level; see OFFLINE_GRAPH_OPTIMIZATION. */
  graphOptimizationLevel?: OfflineGraphOptimization;
}

export type OfflineGraphOptimization = 'disabled' | 'basic' | 'extended' | 'all';

export interface OfflineLoadDiagnostics {
  modelId: string;
  repo: string;
  /** What the app asked for. */
  requestedDtype: string;
  /** The ONNX suffix that dtype maps onto. */
  expectedSuffix: string;
  /** The graph optimisation level the session was created with. */
  graphOptimization: string;
  device: string;
  /** Every file the library loaded, in the order it began, with where it came from. */
  files: OfflineLoadedFile[];
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

/**
 * The one Cache Storage cache the weights live in: Transformers.js's own
 * (`env.cacheKey`, `transformers-cache`). The service worker used to keep a
 * second copy under `offline-models` (a runtimeCaching rule in vite.config.ts,
 * now removed), which doubled the storage and answered requests before the
 * library saw them. `LEGACY_MODEL_CACHE` is that old cache, still looked at so
 * it can be reported and removed from a tablet that has one.
 */
const MODEL_CACHE = 'transformers-cache';
const LEGACY_MODEL_CACHE = 'offline-models';

/**
 * ONNX artifacts already in Cache Storage, from both caches so that a leftover
 * second copy shows up as a second line rather than hiding.
 */
export async function cachedModelFiles(): Promise<string[]> {
  const found: string[] = [];
  try {
    for (const name of await caches.keys()) {
      if (name !== MODEL_CACHE && name !== LEGACY_MODEL_CACHE) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (request.url.includes('.onnx')) found.push(`${name}: ${request.url}`);
      }
    }
  } catch {
    // Cache Storage unavailable (private window). Nothing is cached.
  }
  return found.sort();
}

/**
 * Drop the service worker's old second copy of the weights. Called only after a
 * load has succeeded, when the weights are certainly in `transformers-cache`,
 * so it can never remove the only copy that works.
 */
export async function removeLegacyModelCache(): Promise<boolean> {
  try {
    return await caches.delete(LEGACY_MODEL_CACHE);
  } catch {
    return false;
  }
}

/** Remove every cached model artifact, for both models. */
export async function clearModelCache(): Promise<number> {
  let removed = 0;
  for (const name of await caches.keys()) {
    if (name !== MODEL_CACHE && name !== LEGACY_MODEL_CACHE) continue;
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
  probe?: OfflineLoadOptions,
): Promise<Translator> {
  const isProbe = probe !== undefined;
  if (pipelinePromise && loadedModelId === modelId && !isProbe) return pipelinePromise;

  const model = offlineModelById(modelId);
  loadedModelId = modelId;

  const dtype = probe?.dtype ?? OFFLINE_DTYPE;
  const graphOptimization = probe?.graphOptimizationLevel ?? OFFLINE_GRAPH_OPTIMIZATION;

  const diagnostics: OfflineLoadDiagnostics = {
    modelId,
    repo: model.repo,
    requestedDtype: dtype,
    expectedSuffix: DTYPE_FILE_SUFFIX[dtype] ?? '(unknown)',
    graphOptimization: graphOptimization ?? "(runtime default, 'all')",
    device: 'wasm',
    files: [],
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

    // Where each file came from. A Cache Storage hit never reaches a fetch, so
    // the library's own `env.fetch` — the hook it routes every network request
    // through — sees exactly the files that went to the network. (Patching
    // `globalThis.fetch` did not: Transformers.js bound its own reference to the
    // original `fetch` when it was imported, so the patch saw nothing and the
    // diagnostics claimed "every artifact came from Cache Storage" even on a
    // first download.) Its progress events then name every file it loaded and
    // how big each was; a file with an event and no request came from the cache.
    const requested = new Set<string>();
    const defaultFetch = env.fetch;
    env.fetch = (input, init) => {
      requested.add(typeof input === 'string' ? input : input.href);
      return defaultFetch(input, init);
    };

    const sizes = new Map<string, number>();
    const order: string[] = [];
    const record = () => {
      diagnostics.files = order.map((file) => ({
        file,
        source: [...requested].some((url) => url.endsWith(`/${file}`)) ? 'network' : 'cache',
        bytes: sizes.get(file) ?? 0,
      }));
    };

    try {
      const translator = await pipeline('translation', model.repo, {
        // Pinned, never `auto`: `auto` resolves per-device, so the desktop and
        // the tablet would silently run different weights.
        dtype: dtypeSpecFor(dtype),
        // Pinned too, so which backend runs is not left open.
        device: 'wasm',
        ...(graphOptimization
          ? { session_options: { graphOptimizationLevel: graphOptimization } }
          : {}),
        progress_callback: (event: {
          status?: string;
          file?: string;
          loaded?: number;
          total?: number;
          progress?: number;
        }) => {
          const file = event.file;
          if (file && event.status === 'initiate' && !order.includes(file)) order.push(file);
          if (file && event.total) sizes.set(file, event.total);
          if (event.status !== 'progress' || !onProgress) return;
          onProgress({
            file: file ?? '',
            loaded: event.loaded ?? 0,
            total: event.total ?? 0,
            percent: Math.round(event.progress ?? 0),
          });
        },
      });
      record();
      return translator as unknown as Translator;
    } catch (error) {
      record();
      throw error;
    } finally {
      env.fetch = defaultFetch;
    }
  })();

  try {
    const translator = await pipelinePromise;
    diagnostics.ok = true;
    diagnostics.durationMs = Date.now() - diagnostics.startedAt;
    await removeLegacyModelCache();
    return translator;
  } catch (error) {
    pipelinePromise = null;
    loadedModelId = null;
    diagnostics.ok = false;
    diagnostics.durationMs = Date.now() - diagnostics.startedAt;
    diagnostics.error = error instanceof Error ? error.message : String(error);

    // A session-creation failure is not a network failure, and calling it one
    // sends the user to check their wifi.
    const isSessionError = /session|ERROR_CODE|MatMulNBits|qdq_actions/i.test(
      diagnostics.error,
    );
    const fromNetwork = diagnostics.files.filter((file) => file.source === 'network').length;

    throw new TranslationError(
      isSessionError ? 'api' : 'network',
      isSessionError
        ? `The model files loaded but the runtime could not create a session from them. ` +
          `Requested ${diagnostics.requestedDtype} (${diagnostics.expectedSuffix}), ` +
          `graph optimisation ${diagnostics.graphOptimization}; ` +
          `${diagnostics.files.length} file(s) loaded, ${fromNetwork} from the network. ` +
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
  const loaded = await loadOfflineModel(options.modelId);
  const languages = offlineModelById(options.modelId).languages ?? {};
  const translator: Translator = (input, extra) => loaded(input, { ...languages, ...extra });

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
