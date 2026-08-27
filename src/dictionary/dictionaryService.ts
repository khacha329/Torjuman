import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Block, Book, DictionaryEntry } from '../types';
import { newId } from '../lib/id';
import { normalize } from '../lib/arabic';
import { rootCandidates, rootKeyFrom } from './roots';

// Building the root index, and looking a word up in it.
//
// Everything here is local: no model, no network, no translation provider. A
// lookup during a session must work with the tablet fully offline.

/** Shamela book ID for al-Miṣbāḥ al-Munīr. */
export const MISBAH_SHAMELA_ID = 12145;

/**
 * A TOC leaf that is a root headword.
 *
 * The spec expected to read roots out of page titles. The book is kinder than
 * that: its TOC leaves *are* the roots, printed in parentheses.
 *
 * What they are NOT is uniformly spaced. Sound roots print as "(ء ب ب)", but
 * hollow ones join the weak letter to the next — "(ق وب)", "(ق وت)" — and many
 * carry a trailing colon: "(ق ود) :". A pattern demanding single
 * space-separated letters matches the first kind and silently drops the second,
 * which is every hollow root in the dictionary. So the inside of the brackets
 * is taken as Arabic letters and spaces in any arrangement, and the spaces are
 * removed afterwards.
 *
 * Section headings like "[الألف مع الباء وما يثلثهما]" are excluded by the
 * length cap here and by the 2–5 letter check below.
 */
const ROOT_TITLE = /^\s*[([]\s*([ء-ي][ء-ي\s]{0,14})\s*[)\]]\s*[:：]?\s*$/u;

export function rootFromTocTitle(title: string): { root: string; display: string } | null {
  const match = ROOT_TITLE.exec(title);
  if (!match) return null;

  const display = match[1].replace(/\s+/g, ' ').trim();
  const root = rootKeyFrom(display);
  if (root.length < 2 || root.length > 5) return null;

  return { root, display };
}

/** Build (or rebuild) the root index for a dictionary book from its TOC. */
export async function buildRootIndex(
  storage: StorageAdapter,
  book: Book,
): Promise<number> {
  const [nodes, pageMeta] = await Promise.all([
    storage.listTocNodes(book.id),
    storage.listPageMeta(book.id),
  ]);

  const metaByPage = new Map(pageMeta.map((meta) => [meta.pageIndex, meta]));
  const entries: DictionaryEntry[] = [];

  for (const node of nodes) {
    const parsed = rootFromTocTitle(node.title);
    if (!parsed) continue;

    const meta = metaByPage.get(node.pageIndex);
    entries.push({
      id: newId('dict'),
      bookId: book.id,
      root: parsed.root,
      rootDisplay: parsed.display,
      pageIndex: node.pageIndex,
      volume: meta?.volume ?? null,
      printPage: meta?.printPage ?? null,
    });
  }

  await storage.clearDictionaryEntries(book.id);
  await storage.putDictionaryEntries(entries);
  return entries.length;
}

export interface LookupHit {
  entry: DictionaryEntry;
  /** The candidate root that matched. */
  matchedRoot: string;
  rank: number;
  blocks: Block[];
}

export interface LookupResult {
  surface: string;
  hits: LookupHit[];
  /** True when the index missed and the full-text fallback was used. */
  viaFullText: boolean;
}

/**
 * An in-memory view of one dictionary, built once per session.
 *
 * The index is a few thousand entries and the blocks are needed for the entry
 * bodies and the full-text fallback, so both are held rather than re-queried on
 * every lookup — a lookup mid-session has to feel instant.
 */
export class Dictionary {
  private readonly byRoot = new Map<string, DictionaryEntry[]>();
  private readonly blocksByPage = new Map<number, Block[]>();
  private readonly blocks: Block[];

  readonly book: Book;

  constructor(book: Book, entries: DictionaryEntry[], blocks: Block[]) {
    this.book = book;
    this.blocks = blocks;

    for (const entry of entries) {
      const list = this.byRoot.get(entry.root);
      if (list) list.push(entry);
      else this.byRoot.set(entry.root, [entry]);
    }

    for (const block of blocks) {
      const pageIndex = Number(block.pageId.split(':p')[1] ?? 0);
      const list = this.blocksByPage.get(pageIndex);
      if (list) list.push(block);
      else this.blocksByPage.set(pageIndex, [block]);
    }
    for (const list of this.blocksByPage.values()) {
      list.sort((a, b) => a.order - b.order);
    }
  }

  get rootCount(): number {
    return this.byRoot.size;
  }

  private blocksFor(entry: DictionaryEntry): Block[] {
    return this.blocksByPage.get(entry.pageIndex) ?? [];
  }

  /**
   * Look a surface form up.
   *
   * Every candidate root is tried and every hit returned, ranked. If the index
   * misses entirely, a normalized full-text search of the dictionary's own
   * blocks catches the rest — dictionaries cite inflected forms inside their
   * entries, so this recovers a good deal. If both miss, that is reported
   * plainly; nothing is ever invented.
   */
  lookup(surface: string): LookupResult {
    const candidates = rootCandidates(surface);
    const hits: LookupHit[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      for (const entry of this.byRoot.get(candidate.root) ?? []) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        hits.push({
          entry,
          matchedRoot: candidate.root,
          rank: candidate.rank,
          blocks: this.blocksFor(entry),
        });
      }
    }

    if (hits.length > 0) {
      hits.sort((a, b) => a.rank - b.rank);
      return { surface, hits: hits.slice(0, 12), viaFullText: false };
    }

    return { surface, hits: this.fullTextFallback(surface), viaFullText: true };
  }

  private fullTextFallback(surface: string): LookupHit[] {
    const needle = normalize(surface);
    if (needle.length < 3) return [];

    const found: LookupHit[] = [];
    const seenPages = new Set<number>();

    for (const block of this.blocks) {
      if (!block.normalized.includes(needle)) continue;

      const pageIndex = Number(block.pageId.split(':p')[1] ?? 0);
      if (seenPages.has(pageIndex)) continue;
      seenPages.add(pageIndex);

      // Attribute the hit to the root whose entry begins on that page.
      const entry = [...this.byRoot.values()]
        .flat()
        .find((candidate) => candidate.pageIndex === pageIndex);
      if (!entry) continue;

      found.push({
        entry,
        matchedRoot: entry.root,
        rank: 100,
        blocks: this.blocksFor(entry),
      });
      if (found.length >= 8) break;
    }

    return found;
  }
}

/** Load a dictionary book into memory, if one has been imported. */
export async function loadDictionary(storage: StorageAdapter): Promise<Dictionary | null> {
  const books = await storage.listBooks();
  const book = books.find((candidate) => candidate.role === 'dictionary');
  if (!book) return null;

  const [entries, blocks] = await Promise.all([
    storage.listDictionaryEntries(book.id),
    storage.listBlocks(book.id),
  ]);
  if (entries.length === 0 && blocks.length === 0) return null;

  return new Dictionary(book, entries, blocks);
}
