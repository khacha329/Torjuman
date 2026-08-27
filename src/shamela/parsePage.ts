import type { InlineSpan, InlineSpanKind } from '../types';
import { looksLikeCitation, parseCitation } from './quranRefs';

// Parser for a Shamela content page.
//
// Every selector here was written against HTML actually fetched from
// shamela.ws/book/9260 (pages 1, 2, 8, 30, 319, 500, 1500, 3760, 3784), not
// from a guess about the markup. The shape it relies on:
//
//   <div class="nass margin-top-10" data-page-id="500" data-page-num="505">
//     <p><span id="p1" class="anchor"></span>…text…
//        <span class="c5">قال الله تعالى:</span>
//        <span class="c2">(وَإِذْ تَأَذَّنَ رَبُّكُمْ …)</span>
//        <span class="c2">(إبراهيم: ٧)</span> …
//        <a href="#p1" class="btn_tag btn btn-sm">…</a></p>
//     …
//   </div>
//
//   data-page-id  = Shamela's sequential page index (the URL segment)
//   data-page-num = the printed page number (ص)
//
// The copy-link anchors (a.btn_tag) and the empty span.anchor markers are site
// furniture and are dropped; the anchor's id is kept so a block can still be
// deep-linked the way Shamela links it.

export interface ParsedBlock {
  text: string;
  spans: InlineSpan[];
  anchor: string | null;
  /** The whole paragraph sat inside Shamela's heading span. */
  wholeBlockIsHeading: boolean;
}

export interface ParsedPage {
  pageIndex: number;
  printPage: number | null;
  volume: number | null;
  /**
   * The `div.nass` container only.
   *
   * The spec asks for the raw HTML to be kept so the parser can be improved and
   * re-run without re-fetching. A whole Shamela page is ~40 KB, of which ~37 KB
   * is navigation chrome that is byte-identical on all 3,784 pages; storing it
   * all would put ~150 MB in IndexedDB per book. The nass container is the
   * complete text payload and is ~3 KB, so this keeps the re-parse guarantee at
   * a tenth of the cost.
   */
  contentHtml: string;
  blocks: ParsedBlock[];
  /** Highest page index linked from the pager — the book's page count. */
  totalPages: number | null;
  /** First page index of each print volume, read from the "ج" dropdown. */
  volumeStarts: number[];
  /** Page index of the TOC entry marked active for this page. */
  activeTocPageIndex: number | null;
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function parsePage(html: string, shamelaId: number): ParsedPage | null {
  const doc = parseHtml(html);

  const nass = Array.from(doc.querySelectorAll('div.nass')).find(
    (el) => (el.getAttribute('data-page-id') ?? '').trim() !== '',
  );
  if (!nass) return null;

  const pageIndex = Number(nass.getAttribute('data-page-id'));
  if (!Number.isFinite(pageIndex)) return null;

  // data-page-num is "0" on front matter that carries no printed page number.
  const printPageRaw = Number(nass.getAttribute('data-page-num'));
  const printPage =
    Number.isFinite(printPageRaw) && printPageRaw > 0 ? printPageRaw : null;

  return {
    pageIndex,
    printPage,
    volume: readCurrentVolume(doc),
    contentHtml: nass.outerHTML,
    blocks: parseBlocks(nass.outerHTML),
    totalPages: readTotalPages(doc, shamelaId),
    volumeStarts: readVolumeStarts(doc, shamelaId),
    activeTocPageIndex: readActiveTocPage(doc, shamelaId),
  };
}

/**
 * Turn a stored `div.nass` container into blocks. Split out from parsePage so
 * the parser can be re-run over pages already in the database.
 */
export function parseBlocks(contentHtml: string): ParsedBlock[] {
  const doc = parseHtml(contentHtml);
  const container = doc.querySelector('div.nass') ?? doc.body;

  const blocks: ParsedBlock[] = [];
  for (const paragraph of Array.from(container.querySelectorAll('p'))) {
    const block = parseParagraph(paragraph);
    if (block) blocks.push(block);
  }
  return blocks;
}

function parseParagraph(paragraph: Element): ParsedBlock | null {
  const working = paragraph.cloneNode(true) as Element;

  // Shamela's per-paragraph deep-link target. Keep the id, drop the element.
  let anchor: string | null = null;
  for (const marker of Array.from(working.querySelectorAll('span.anchor'))) {
    anchor ??= marker.getAttribute('id');
    marker.remove();
  }

  // The floating "copy paragraph" button.
  for (const button of Array.from(working.querySelectorAll('a.btn_tag'))) {
    button.remove();
  }

  const builder = new TextBuilder();
  const raw: RawSpan[] = [];
  walk(working, builder, raw, 0);

  const text = builder.finish();
  if (text.trim() === '') return null;

  const spans = classifySpans(text, raw);
  const wholeBlockIsHeading = raw.some(
    (span) =>
      span.className === 'c4' &&
      span.start === 0 &&
      span.end >= text.length - 1 &&
      /^\s*\[.*\]\s*$/u.test(text),
  );

  return { text, spans, anchor, wholeBlockIsHeading };
}

interface RawSpan {
  start: number;
  end: number;
  className: string;
}

/**
 * Accumulates display text while collapsing runs of whitespace, so the offsets
 * recorded for inline spans line up with the final string. Nothing else about
 * the text is touched — harakāt, punctuation and word order are untouched.
 */
class TextBuilder {
  private buffer = '';

  get length(): number {
    return this.buffer.length;
  }

  append(raw: string): void {
    let piece = raw.replace(/\s+/gu, ' ');
    if (piece === '') return;
    if (piece === ' ' && (this.buffer === '' || this.buffer.endsWith(' '))) return;
    if (piece.startsWith(' ') && (this.buffer === '' || this.buffer.endsWith(' '))) {
      piece = piece.slice(1);
    }
    this.buffer += piece;
  }

  finish(): string {
    return this.buffer.trim();
  }
}

function walk(node: Node, builder: TextBuilder, spans: RawSpan[], depth: number): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      builder.append(child.textContent ?? '');
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    if (element.tagName === 'BR') {
      builder.append(' ');
      continue;
    }

    const styleClass = styledClassOf(element);
    const start = builder.length;
    walk(element, builder, spans, depth + 1);
    const end = builder.length;

    if (styleClass && end > start) {
      spans.push({ start, end, className: styleClass });
    }
  }
}

/** Shamela styles inline runs with generated classes c1…cN on <span>. */
function styledClassOf(element: Element): string | null {
  if (element.tagName !== 'SPAN') return null;
  for (const name of Array.from(element.classList)) {
    if (/^c\d+$/.test(name)) return name;
  }
  return null;
}

/**
 * Decide what each styled run actually is.
 *
 * The class numbers are not semantic and are not stable across volumes — in
 * volume 1 a verse citation is `<span class="c2">(البينة: ٥)</span>` and in
 * volume 3 it is `<span class="c4">[الزمر: ٥٣]</span>`. So the class only marks
 * *that* a run is styled; what it is gets decided from its content:
 *
 *   - text shaped like a sūra citation            → quran_ref
 *   - text opening with a doubled paren "((…"     → quote  (prophetic speech,
 *                                                   or a lemma from the matn)
 *   - text in single parens, followed by a
 *     citation or densely vocalised               → quran
 *   - anything else                               → emphasis (bold lead-ins
 *                                                   like "قال الله تعالى:")
 */
function classifySpans(text: string, raw: RawSpan[]): InlineSpan[] {
  const ordered = [...raw].sort((a, b) => a.start - b.start);
  const result: InlineSpan[] = [];

  const kinds: (InlineSpanKind | 'candidate')[] = ordered.map((span) => {
    const body = text.slice(span.start, span.end).trim();
    if (looksLikeCitation(body)) return 'quran_ref';
    if (body.startsWith('((')) return 'quote';
    if (body.startsWith('(') || body.startsWith('﴿') || body.startsWith('{')) return 'candidate';
    return 'emphasis';
  });

  for (const [index, span] of ordered.entries()) {
    const body = text.slice(span.start, span.end);
    let kind = kinds[index];
    let reference: string | undefined;

    if (kind === 'quran_ref') {
      reference = parseCitation(body.trim())?.reference;
    }

    if (kind === 'candidate') {
      // Confirmed by a citation immediately after it, or by heavy vocalisation
      // — the Qurʾān is fully pointed in this edition while the hadith text is
      // not, which separates a verse from a quoted lemma reliably.
      const next = kinds[index + 1];
      const nextIsCitation =
        next === 'quran_ref' && ordered[index + 1].start - span.end <= 4;
      kind = nextIsCitation || diacriticDensity(body) > 0.12 ? 'quran' : 'quote';
    }

    result.push({ start: span.start, end: span.end, kind, reference });
  }

  // Give a verse the reference from the citation that follows it, so the
  // reader can offer "look this up" without re-scanning the text.
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i].kind === 'quran' && result[i + 1].kind === 'quran_ref') {
      result[i].reference ??= result[i + 1].reference;
    }
  }

  return result;
}

function diacriticDensity(text: string): number {
  const letters = text.replace(/\s/gu, '');
  if (letters.length === 0) return 0;
  const marks = letters.match(/[ً-ٰٟ]/gu);
  return (marks?.length ?? 0) / letters.length;
}

// ------------------------------------------------------------- page furniture

function pageLinkNumbers(shamelaId: number, scope: Element | Document): number[] {
  const pattern = new RegExp(`/book/${shamelaId}/(\\d+)`);
  const numbers: number[] = [];
  for (const link of Array.from(scope.querySelectorAll('a[href]'))) {
    const match = pattern.exec(link.getAttribute('href') ?? '');
    if (match) numbers.push(Number(match[1]));
  }
  return numbers;
}

/**
 * The pager at the foot of every page links first / previous / next / last.
 * The largest of those is the last page, which is how the book's page count is
 * discovered — the landing page does not state it anywhere.
 */
function readTotalPages(doc: Document, shamelaId: number): number | null {
  const numbers = pageLinkNumbers(shamelaId, doc);
  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}

/** The "ج" dropdown lists the first page of each volume. */
function readVolumeStarts(doc: Document, shamelaId: number): number[] {
  for (const menu of Array.from(doc.querySelectorAll('.dropdown-menu'))) {
    const numbers = pageLinkNumbers(shamelaId, menu);
    if (numbers.length >= 1) {
      return Array.from(new Set(numbers)).sort((a, b) => a - b);
    }
  }
  return [];
}

function readCurrentVolume(doc: Document): number | null {
  const field =
    doc.querySelector('#fld_part_bottom') ?? doc.querySelector('#fld_part_top');
  const value = field?.getAttribute('value');
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The TOC entry Shamela marks active tells us which section this page is in. */
function readActiveTocPage(doc: Document, shamelaId: number): number | null {
  const active = doc.querySelector('.s-nav a.active, .betaka-index a.active');
  if (!active) return null;
  const match = new RegExp(`/book/${shamelaId}/(\\d+)`).exec(
    active.getAttribute('href') ?? '',
  );
  return match ? Number(match[1]) : null;
}
