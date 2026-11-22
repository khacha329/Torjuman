// A page that runs the real on-device translation code (OfflineProvider) on
// text handed to it, so a browser script can time it. The model code is the
// app's own; only the page around it is different.

import { parsePage } from '../../src/shamela/parsePage';
import { bookIdFor } from '../../src/shamela/urls';
import {
  cachedModelFiles,
  clearModelCache,
  lastOfflineLoad,
  loadOfflineModel,
  translateProse,
  unloadOfflineModel,
  type OfflineLoadOptions,
} from '../../src/translation/offline/OfflineProvider';
import { splitSentences } from '../../src/translation/offline/sentences';


export interface Sample {
  blockId: string;
  page: number;
  index: number;
  arabic: string;
}

/** Plain prose blocks of a sensible length from fixture pages: no verse or ḥadīth span, not a heading. */
function pickSamples(pages: Record<string, string>, want: number): Sample[] {
  const out: Sample[] = [];
  for (const html of Object.values(pages)) {
    const page = parsePage(html, 9260);
    if (!page) continue;
    // Up to two per page, so five come from a handful of fixtures.
    let taken = 0;
    page.blocks.forEach((block, at) => {
      if (out.length >= want || taken >= 2) return;
      if (block.wholeBlockIsHeading || block.spans.length > 0) return;
      if (block.text.length < 100 || block.text.length > 800) return;
      out.push({
        blockId: `${bookIdFor(9260)}:p${page.pageIndex}:${at}`,
        page: page.pageIndex,
        index: at,
        arabic: block.text,
      });
      taken++;
    });
    if (out.length >= want) break;
  }
  return out;
}

async function measure(config: OfflineLoadOptions & { modelId: string }, texts: string[]) {
  const { modelId, ...options } = config;
  await unloadOfflineModel();
  const loadStart = performance.now();
  await loadOfflineModel(modelId, undefined, options);
  const loadMs = performance.now() - loadStart;
  const load = lastOfflineLoad();

  // The first call pays for session warm-up; time it apart from the rest.
  const warmStart = performance.now();
  await translateProse(['السلام عليكم'], { modelId, glossary: [] });
  const warmMs = performance.now() - warmStart;

  const results: { translation: string; sentences: number; ms: number }[] = [];
  for (const text of texts) {
    const start = performance.now();
    const [translation] = await translateProse([text], { modelId, glossary: [] });
    results.push({
      translation,
      sentences: splitSentences(text).length,
      ms: performance.now() - start,
    });
  }
  return { options: config, loadMs, warmMs, load, results };
}

/**
 * The two races the pipeline bookkeeping exists for: two loads of one model at
 * once must share one load, and unloading while a translation runs (Settings →
 * Delete, Clear cached weights, a probe) must not break that translation.
 */
async function raceChecks(modelId: string, text: string) {
  await unloadOfflineModel();
  const [a, b] = await Promise.all([loadOfflineModel(modelId), loadOfflineModel(modelId)]);
  const sameLoad = a === b;

  const running = translateProse([text], { modelId, glossary: [] });
  // Long enough for the first sentence to be under way.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await unloadOfflineModel();
  let midRun: string;
  try {
    midRun = (await running)[0];
  } catch (error) {
    midRun = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
  }

  const after = (await translateProse(['السلام عليكم'], { modelId, glossary: [] }))[0];
  return { sameLoad, midRun, after };
}

(window as unknown as Record<string, unknown>).harness = {
  pickSamples,
  measure,
  raceChecks,
  cachedModelFiles,
  clearModelCache,
};
