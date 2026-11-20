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

const MODEL = 'opus-mt-ar-en';

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

async function measure(options: OfflineLoadOptions, texts: string[]) {
  unloadOfflineModel();
  const loadStart = performance.now();
  const translator = await loadOfflineModel(MODEL, undefined, options);
  const loadMs = performance.now() - loadStart;
  const load = lastOfflineLoad();

  // The first call pays for session warm-up; time it apart from the rest.
  const warmStart = performance.now();
  await translator('السلام عليكم');
  const warmMs = performance.now() - warmStart;

  const results: { translation: string; sentences: number; ms: number }[] = [];
  for (const text of texts) {
    const start = performance.now();
    const [translation] = await translateProse([text], { modelId: MODEL, glossary: [] });
    results.push({
      translation,
      sentences: splitSentences(text).length,
      ms: performance.now() - start,
    });
  }
  return { options, loadMs, warmMs, load, results };
}

(window as unknown as Record<string, unknown>).harness = {
  pickSamples,
  measure,
  cachedModelFiles,
  clearModelCache,
};
