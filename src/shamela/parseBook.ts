import type { StructureProfile } from '../types';
import { parseArabicNumber } from '../lib/arabic';

// Parser for a Shamela book landing page (https://shamela.ws/book/9260).
//
// Written against real fetched HTML. The shape it relies on:
//
//   <section class="page-header page-header-sm">
//     <h1 class="size-20"><a href="…/book/9260">كتاب شرح رياض الصالحين لابن عثيمين</a></h1>
//     <div>[<a href="…/author/57">ابن عثيمين</a>]</div>
//     <ol class="breadcrumb">… <li><a href="…/category/7">شروح الحديث</a></li></ol>
//   </section>
//   …
//   <div style="line-height: 1.8;">
//     الكتاب: شرح رياض الصالحين<br />المؤلف: محمد بن صالح … العثيمين (ت ١٤٢١هـ)<br />
//     الناشر: دار الوطن للنشر، الرياض<br />الطبعة: ١٤٢٦ هـ<br />عدد الأجزاء: ٦<br />
//     [ترقيم الكتاب موافق للمطبوع]
//   </div>
//   <div class="betaka-index"><ul><li>-<a href="…/book/9260/1">المقدمة</a></li>…</ul></div>
//
// The card is a <br>-separated "key: value" list, not a table, so it is split
// on <br> and matched by key.

/** Shamela's category for hadith commentary, which turns on the tier-2 rules. */
export const HADITH_COMMENTARY_CATEGORY = 'شروح الحديث';

export interface ParsedTocNode {
  /** Stable within one parse; the ingest layer turns this into a TocNode id. */
  key: string;
  parentKey: string | null;
  title: string;
  pageIndex: number;
  order: number;
  depth: number;
}

export interface ParsedBookMetadata {
  title: string;
  author: string;
  publisher: string;
  edition: string;
  volumeCount: number;
  category: string;
  structureProfile: StructureProfile;
  toc: ParsedTocNode[];
  /**
   * TOC branches the server left collapsed. Book 9260 ships its whole tree
   * inline, but other books may not — the ingest layer expands these via
   * /ajax/titlechilds before showing the confirmation screen.
   */
  collapsedBranches: { titleId: string; parentKey: string }[];
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function parseBookPage(html: string, shamelaId: number): ParsedBookMetadata | null {
  const doc = parseHtml(html);

  const card = readInfoCard(doc);
  const heading = doc.querySelector('section.page-header h1 a')?.textContent?.trim() ?? '';

  // Prefer the card's own "الكتاب:" line — the heading is decorated ("كتاب …
  // لابن عثيمين") whereas the card carries the bare title.
  const title = card.get('الكتاب') ?? stripBookPrefix(heading);
  if (!title) return null;

  const category =
    doc.querySelector('ol.breadcrumb li:last-child a')?.textContent?.trim() ?? '';

  const authorFromLink = doc
    .querySelector('section.page-header a[href*="/author/"]')
    ?.textContent?.trim();

  const volumeCount = parseArabicNumber(card.get('عدد الأجزاء') ?? '') ?? 1;

  const { toc, collapsedBranches } = parseToc(doc, shamelaId);
  if (toc.length === 0) return null;

  return {
    title,
    author: card.get('المؤلف') ?? authorFromLink ?? '',
    publisher: card.get('الناشر') ?? '',
    edition: card.get('الطبعة') ?? '',
    volumeCount,
    category,
    structureProfile:
      category === HADITH_COMMENTARY_CATEGORY ? 'hadith-commentary' : 'generic',
    toc,
    collapsedBranches,
  };
}

function stripBookPrefix(heading: string): string {
  return heading.replace(/^\s*كتاب\s+/u, '').trim();
}

/**
 * The metadata card is a single <div> of "key: value" lines separated by <br>.
 * Split on the breaks, then match each line by its key.
 */
function readInfoCard(doc: Document): Map<string, string> {
  const fields = new Map<string, string>();

  // Every ancestor of the card also "contains" المؤلف, and querySelectorAll
  // returns them outermost-first — so take the *smallest* match, which is the
  // card itself. Splitting an ancestor's markup on <br> would swallow the
  // "الكتاب:" line into a fragment full of unrelated nav markup.
  const container = Array.from(doc.querySelectorAll('div'))
    .filter((el) => /(^|>)\s*المؤلف\s*[:：]/u.test(el.innerHTML))
    .sort((a, b) => a.innerHTML.length - b.innerHTML.length)[0];
  if (!container) return fields;

  const decoder = doc.createElement('div');
  for (const fragment of container.innerHTML.split(/<br\s*\/?>/i)) {
    decoder.innerHTML = fragment;
    const line = (decoder.textContent ?? '').trim();
    const match = /^([^:：]{2,20})\s*[:：]\s*(.+)$/u.exec(line);
    if (match) fields.set(match[1].trim(), match[2].trim());
  }
  return fields;
}

interface TocParseResult {
  toc: ParsedTocNode[];
  collapsedBranches: { titleId: string; parentKey: string }[];
}

function parseToc(doc: Document, shamelaId: number): TocParseResult {
  const root =
    doc.querySelector('div.betaka-index > ul') ?? doc.querySelector('div.s-nav > ul');

  const toc: ParsedTocNode[] = [];
  const collapsedBranches: { titleId: string; parentKey: string }[] = [];
  if (!root) return { toc, collapsedBranches };

  let order = 0;
  const pattern = new RegExp(`/book/${shamelaId}/(\\d+)`);

  const walk = (list: Element, parentKey: string | null, depth: number): void => {
    for (const item of Array.from(list.children)) {
      if (item.tagName !== 'LI') continue;

      // The title link is the <li>'s own <a>, excluding the "[+]" expander.
      const link = Array.from(item.children).find(
        (child) => child.tagName === 'A' && !child.classList.contains('exp_bu'),
      );
      if (!link) continue;

      const match = pattern.exec(link.getAttribute('href') ?? '');
      if (!match) continue;

      const key = `t${order}`;
      toc.push({
        key,
        parentKey,
        title: (link.textContent ?? '').trim(),
        pageIndex: Number(match[1]),
        order,
        depth,
      });
      order++;

      const childList = Array.from(item.children).find((child) => child.tagName === 'UL');
      if (childList) {
        walk(childList, key, depth + 1);
        continue;
      }

      const expander = Array.from(item.children).find(
        (child) => child.tagName === 'A' && child.classList.contains('exp_bu'),
      );
      const titleId = expander?.getAttribute('data-id');
      if (titleId) collapsedBranches.push({ titleId, parentKey: key });
    }
  };

  walk(root, null, 0);
  return { toc, collapsedBranches };
}

/**
 * Parse the <ul> returned by /ajax/titlechilds/{book}/{title} and append it
 * under an already-parsed parent node.
 */
export function parseTocBranch(
  html: string,
  shamelaId: number,
  parentKey: string,
  parentDepth: number,
  startOrder: number,
): ParsedTocNode[] {
  const doc = parseHtml(`<div id="branch">${html}</div>`);
  const list = doc.querySelector('#branch > ul');
  if (!list) return [];

  const pattern = new RegExp(`/book/${shamelaId}/(\\d+)`);
  const nodes: ParsedTocNode[] = [];
  let order = startOrder;

  for (const item of Array.from(list.children)) {
    if (item.tagName !== 'LI') continue;
    const link = Array.from(item.children).find(
      (child) => child.tagName === 'A' && !child.classList.contains('exp_bu'),
    );
    if (!link) continue;
    const match = pattern.exec(link.getAttribute('href') ?? '');
    if (!match) continue;

    nodes.push({
      key: `${parentKey}_b${order}`,
      parentKey,
      title: (link.textContent ?? '').trim(),
      pageIndex: Number(match[1]),
      order: order++,
      depth: parentDepth + 1,
    });
  }
  return nodes;
}
