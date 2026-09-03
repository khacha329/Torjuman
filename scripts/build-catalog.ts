// Builds public/catalog.json from Shamela itself.
//
//   npm run catalog
//
// The amendment says: look these up on Shamela and confirm the IDs before
// adding; do not guess. This is how that rule is kept — the titles, authors,
// categories and page counts below are not typed in, they are read from the
// live book pages with the same parsers the importer uses. If an ID is wrong,
// this fails loudly instead of shipping a catalog entry that 404s on first run.
//
// It needs the dev server running (for the /shamela proxy), because Shamela
// sends no CORS headers — the same constraint the app itself lives with.
//
// The editorial fields — role, why this book, whether it is recommended — are
// judgements and are stated here. Everything factual comes from the source.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const g = globalThis as Record<string, unknown>;
g.DOMParser = dom.window.DOMParser;
g.Node = dom.window.Node;
g.document = dom.window.document;
g.window = dom.window;
g.NodeFilter = dom.window.NodeFilter;
g.HTMLElement = dom.window.HTMLElement;

const { parseBookPage } = await import('../src/shamela/parseBook');
const { parsePage } = await import('../src/shamela/parsePage');

const PROXY = process.env.SHAMELA_PROXY ?? 'http://localhost:5173/shamela';

/** The editorial half: what each book is for, and why it is on the list. */
interface Seed {
  shamelaId: number;
  titleEn: string;
  role: 'reading' | 'dictionary' | 'reference';
  group: string;
  description: string;
  recommended: boolean;
  /**
   * Which printing this ID is, where the work has several. Recorded so the
   * catalog names the edition the ID actually points at rather than the work
   * in the abstract.
   */
  edition?: string;
  /**
   * Contents entries counted on the live page when this ID was verified.
   *
   * A fingerprint, not a fact anyone needs. Editions of the same work differ by
   * two orders of magnitude here — 8,148 against 33 — and the difference
   * decides whether a biographical index can be built at all. Checked below
   * against a re-read, so an edition swap fails the build instead of shipping
   * an ID that imports the wrong printing.
   */
  tocNodes?: number;
}

const SEEDS: Seed[] = [
  {
    shamelaId: 9260,
    titleEn: "Ibn ʿUthaymīn's commentary on Riyāḍ aṣ-Ṣāliḥīn",
    role: 'reading',
    group: 'Texts to study',
    description:
      'The primary text this app was built around. Six volumes of accessible commentary on an-Nawawī’s collection.',
    recommended: true,
  },
  {
    shamelaId: 21812,
    titleEn: "Ibn ʿUthaymīn's commentary on the Forty Ḥadīth",
    role: 'reading',
    group: 'Texts to study',
    description:
      'Short, self-contained, and the same author and register as the sharḥ above — the sensible place to start.',
    recommended: true,
  },
  {
    shamelaId: 147927,
    titleEn: "An-Nawawī's Forty, with Ibn Rajab's additions",
    role: 'reading',
    group: 'Texts to study',
    description:
      'The matn on its own, without commentary. Small, and useful to read beside any of the sharḥs.',
    recommended: true,
  },
  {
    shamelaId: 11244,
    titleEn: "Ibn Daqīq al-ʿĪd on the Forty Ḥadīth",
    role: 'reading',
    group: 'Texts to study',
    description:
      'A classical, considerably terser commentary on the same forty. Good for contrast with Ibn ʿUthaymīn.',
    recommended: false,
  },
  {
    shamelaId: 12145,
    titleEn: 'Al-Miṣbāḥ al-Munīr — al-Fayyūmī',
    role: 'dictionary',
    group: 'Dictionaries',
    description:
      'Concise and oriented to the vocabulary of fiqh and ḥadīth, which is the register of these texts. Looked up by root, entirely offline.',
    recommended: true,
  },
  {
    shamelaId: 1673,
    titleEn: 'Fatḥ al-Bārī — Ibn Ḥajar',
    role: 'reference',
    group: 'Reference for Explain',
    description:
      'The standard commentary on al-Bukhārī. Large; imported to be searched and cited by Explain rather than read through.',
    recommended: false,
  },
  {
    shamelaId: 1711,
    titleEn: "An-Nawawī on Ṣaḥīḥ Muslim",
    role: 'reference',
    group: 'Reference for Explain',
    description:
      'The companion reference to Fatḥ al-Bārī, and by the author of Riyāḍ aṣ-Ṣāliḥīn itself.',
    recommended: false,
  },

  // --------------------------------------------------------------------
  // Biographies (Amendment 16)
  //
  // The `edition` fields below are not decoration. Every one of these works
  // exists on Shamela in several editions with different paginations, and the
  // wrong one imports a real book that is not the intended one — a failure
  // much harder to notice than a 404. Worse, the editions differ in whether
  // their contents list people at all:
  //
  //   أسد الغابة  1110  ط العلمية    8,148 TOC nodes   indexes
  //   أسد الغابة 23700  ط الفكر         33 TOC nodes   USELESS, all collapsed
  //   أسد الغابة  1564  ط الشعب         33 TOC nodes   USELESS, all collapsed
  //
  // Same work, same author, same title in the listing. So `tocNodes` is
  // recorded here as a fingerprint: the build re-reads it from the live page
  // and fails when it no longer matches, which turns a silent edition swap
  // into a build error.
  //
  // تقريب التهذيب (8609) is here now, and it is the exception to everything
  // above: its contents are 249 letter headings — «حرف الألف», «ذكر من اسمه
  // أحمد» — standing in for some 8,800 narrators listed only in the body. The
  // TOC index refuses it, correctly, and it is read by a body-level parser
  // instead (src/biography/taqrib.ts). So its `tocNodes` fingerprint guards the
  // edition, not the index: nothing is built from those 249 nodes.
  // --------------------------------------------------------------------
  {
    shamelaId: 1110,
    titleEn: 'Ibn al-Athīr, Usd al-Ghāba — Companions',
    role: 'reference',
    group: 'Biographies',
    edition: 'ط العلمية',
    tocNodes: 8148,
    description:
      'Companions specifically, and the one to import first: its subjects are the narrators named in Riyāḍ aṣ-Ṣāliḥīn. Note the edition — other printings of this work carry only bāb headings and cannot be indexed.',
    recommended: true,
  },
  {
    shamelaId: 8609,
    titleEn: 'Ibn Ḥajar, Taqrīb at-Tahdhīb — narrators',
    role: 'reference',
    group: 'Biographies',
    edition: 'دار الرشيد',
    tocNodes: 249,
    description:
      "The narrator dictionary behind the structured card: Ibn Ḥajar's own verdict and the ṭabaqa for some 8,800 transmitters, one short entry each. Unlike the others here it is read from its body rather than its contents, so its short table of contents is expected and not a problem.",
    recommended: true,
  },
  {
    shamelaId: 10906,
    titleEn: 'Adh-Dhahabī, Siyar aʿlām an-nubalāʾ',
    role: 'reference',
    group: 'Biographies',
    edition: 'ط الرسالة',
    tocNodes: 6162,
    description:
      'Scholars broadly — the general-purpose choice, and the largest of the three. Muʾassasat ar-Risāla, the standard scholarly edition.',
    recommended: false,
  },
  {
    shamelaId: 9767,
    titleEn: 'Ibn Ḥajar, al-Iṣāba — Companions',
    role: 'reference',
    group: 'Biographies',
    edition: 'دار الكتب العلمية',
    tocNodes: 13854,
    description:
      'The fullest Companion dictionary, and the largest contents of the three at nearly fourteen thousand entries. Overlaps Usd al-Ghāba; import both only if you want to compare them.',
    recommended: false,
  },
];

interface CatalogEntry extends Omit<Seed, 'group'> {
  title: string;
  author: string;
  category: string;
  approxPages: number;
  group: string;
}

async function get(path: string): Promise<string> {
  const response = await fetch(`${PROXY}${path}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
  return response.text();
}

/** Courtesy delay, the same one the crawler uses. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const entries: CatalogEntry[] = [];
let failures = 0;

for (const seed of SEEDS) {
  try {
    const meta = parseBookPage(await get(`/book/${seed.shamelaId}`), seed.shamelaId);
    if (!meta) throw new Error('the book page did not parse');

    // Edition fingerprint. Shamela can and does re-point an ID, and two
    // printings of the same work carry the same title and author — so the
    // contents count is the only cheap thing that actually distinguishes them.
    if (seed.tocNodes !== undefined) {
      const countNodes = (nodes: { children?: unknown[] }[]): number =>
        nodes.reduce(
          (total, node) =>
            total + 1 + (node.children ? countNodes(node.children as never) : 0),
          0,
        );
      const actual = countNodes(meta.toc as never);
      const drift = Math.abs(actual - seed.tocNodes) / seed.tocNodes;
      if (drift > 0.05) {
        throw new Error(
          `contents changed: expected ~${seed.tocNodes} entries, found ${actual}. ` +
            `This ID may now point at a different edition — check it before shipping, ` +
            `because an edition with collapsed bāb headings cannot be name-indexed.`,
        );
      }
    }

    // The page count is only on a content page's pager, never on the landing
    // page — the same finding the importer is built around.
    await delay(400);
    const first = parsePage(await get(`/book/${seed.shamelaId}/1`), seed.shamelaId);
    const approxPages = first?.totalPages ?? 0;
    if (approxPages === 0) throw new Error('no page count found on the pager');

    entries.push({
      shamelaId: seed.shamelaId,
      title: meta.title,
      titleEn: seed.titleEn,
      author: meta.author,
      role: seed.role,
      category: meta.category,
      group: seed.group,
      approxPages,
      description: seed.description,
      recommended: seed.recommended,
      ...(seed.edition ? { edition: seed.edition } : {}),
      ...(seed.tocNodes !== undefined ? { tocNodes: seed.tocNodes } : {}),
    });

    console.log(
      `  ok    ${String(seed.shamelaId).padEnd(7)} ${meta.title} — ${meta.author} (${approxPages.toLocaleString()} pages)`,
    );
  } catch (error) {
    failures++;
    console.log(
      `  FAIL  ${String(seed.shamelaId).padEnd(7)} ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await delay(400);
}

if (failures > 0) {
  console.log(`\n${failures} entr(ies) failed. Nothing written.`);
  process.exit(1);
}

const catalog = {
  version: 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  entries,
};

const target = join(process.cwd(), 'public', 'catalog.json');
writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`\nWrote ${entries.length} entries to public/catalog.json`);
