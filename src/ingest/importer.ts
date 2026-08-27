import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Block, Book, Page, TocNode } from '../types';
import { parseBookPage, parseTocBranch, type ParsedTocNode } from '../shamela/parseBook';
import { parseBlocks, parsePage, type ParsedPage } from '../shamela/parsePage';
import { detectBlockType } from '../shamela/structure';
import { bookIdFor, bookUrl, pageUrl, tocChildrenUrl } from '../shamela/urls';
import { normalize } from '../lib/arabic';
import { sha256 } from '../lib/hash';
import { hadithCollectionFor } from '../quran/detectEntities';
import { MISBAH_SHAMELA_ID } from '../dictionary/dictionaryService';

/** What the confirmation screen shows before any crawling starts. */
export interface BookPreview {
  shamelaId: number;
  bookId: string;
  title: string;
  author: string;
  publisher: string;
  edition: string;
  volumeCount: number;
  category: string;
  structureProfile: 'generic' | 'hadith-commentary';
  totalPages: number;
  volumeStarts: number[];
  toc: ParsedTocNode[];
  role: Book['role'];
}

/**
 * Guess whether a book is a reference work rather than something to read
 * through. The user confirms or overrides it on the import screen.
 */
export function guessRole(
  shamelaId: number,
  category: string,
  title: string,
): 'reading' | 'dictionary' {
  if (shamelaId === MISBAH_SHAMELA_ID) return 'dictionary';
  const haystack = normalize(`${category} ${title}`);
  return ['معاجم', 'اللغه', 'غريب', 'قاموس', 'لسان العرب'].some((hint) =>
    haystack.includes(normalize(hint)),
  )
    ? 'dictionary'
    : 'reading';
}

/**
 * Step 2–3 of the add-book flow: fetch the landing page for metadata and the
 * TOC, plus page 1 for the page count.
 *
 * The page count is not stated anywhere on the landing page — it has to be read
 * off the pager at the foot of a content page, which links to the last page.
 */
export async function fetchBookPreview(
  http: HttpClient,
  shamelaId: number,
): Promise<BookPreview> {
  const landing = await http.get(bookUrl(shamelaId));
  if (!landing.ok) {
    throw new Error(
      landing.status === 404
        ? `No Shamela book with ID ${shamelaId}.`
        : `Shamela returned ${landing.status} for book ${shamelaId}.`,
    );
  }

  const parsed = parseBookPage(landing.body, shamelaId);
  if (!parsed) {
    throw new Error(
      `Could not read book ${shamelaId}. The page loaded but did not look like a Shamela book page.`,
    );
  }

  // Book 9260 ships its whole TOC inline. Other books may leave branches
  // collapsed behind the site's own "[+]" AJAX endpoint; expand those so the
  // confirmation screen shows the real structure.
  const toc = [...parsed.toc];
  for (const branch of parsed.collapsedBranches) {
    const parent = toc.find((node) => node.key === branch.parentKey);
    if (!parent) continue;
    const response = await http.get(tocChildrenUrl(shamelaId, branch.titleId));
    if (!response.ok) continue;
    toc.push(...parseTocBranch(response.body, shamelaId, parent.key, parent.depth, toc.length));
    await delay(350);
  }
  toc.sort((a, b) => a.pageIndex - b.pageIndex || a.order - b.order);

  const firstPage = await http.get(pageUrl(shamelaId, 1));
  const page = firstPage.ok ? parsePage(firstPage.body, shamelaId) : null;

  return {
    shamelaId,
    bookId: bookIdFor(shamelaId),
    title: parsed.title,
    author: parsed.author,
    publisher: parsed.publisher,
    edition: parsed.edition,
    volumeCount: parsed.volumeCount,
    category: parsed.category,
    structureProfile: parsed.structureProfile,
    totalPages: page?.totalPages ?? 0,
    volumeStarts: page?.volumeStarts ?? [],
    toc,
    role: guessRole(shamelaId, parsed.category, parsed.title),
  };
}

/** Step 4→5: persist the skeleton so the crawl can start (and resume later). */
export async function createBookFromPreview(
  storage: StorageAdapter,
  preview: BookPreview,
): Promise<Book> {
  const existing = await storage.getBook(preview.bookId);

  const book: Book = {
    id: preview.bookId,
    shamelaId: preview.shamelaId,
    title: preview.title,
    author: preview.author,
    publisher: preview.publisher,
    edition: preview.edition,
    volumeCount: preview.volumeCount,
    category: preview.category,
    // A profile the user has already overridden in book settings wins.
    structureProfile: existing?.structureProfile ?? preview.structureProfile,
    importedAt: existing?.importedAt ?? Date.now(),
    importStatus: 'in-progress',
    totalPages: preview.totalPages,
    fetchedPages: await storage.countPages(preview.bookId),
    volumeStarts: preview.volumeStarts,
    hadithCollection:
      existing?.hadithCollection ?? hadithCollectionFor(preview.title),
    role: existing?.role ?? preview.role,
  };
  await storage.putBook(book);

  const keyToId = new Map<string, string>();
  for (const node of preview.toc) {
    keyToId.set(node.key, `${book.id}:toc${node.order}`);
  }

  const nodes: TocNode[] = preview.toc.map((node) => ({
    id: keyToId.get(node.key)!,
    bookId: book.id,
    parentId: node.parentKey ? (keyToId.get(node.parentKey) ?? null) : null,
    title: node.title,
    pageIndex: node.pageIndex,
    order: node.order,
    depth: node.depth,
  }));
  await storage.putTocNodes(nodes);

  const state = await storage.getCrawlState(book.id);
  if (!state) {
    await storage.putCrawlState({
      bookId: book.id,
      status: 'idle',
      nextPage: 1,
      failedPages: [],
      updatedAt: Date.now(),
    });
  }

  return book;
}

/** Turn one fetched page into blocks and persist both. */
export async function storePage(
  storage: StorageAdapter,
  book: Book,
  parsed: ParsedPage,
  tocIndex: TocIndex,
): Promise<void> {
  const pageId = `${book.id}:p${parsed.pageIndex}`;

  const page: Page = {
    id: pageId,
    bookId: book.id,
    pageIndex: parsed.pageIndex,
    volume: parsed.volume ?? volumeFor(book, parsed.pageIndex),
    printPage: parsed.printPage,
    rawHtml: parsed.contentHtml,
    fetchedAt: Date.now(),
  };
  await storage.putPage(page);

  const blocks = await buildBlocks(storage, book, page, parsed.blocks, tocIndex, parsed);
  await storage.deleteBlocksForPage(pageId);
  await storage.putBlocks(blocks);
}

/** Re-run the parser over already-stored HTML, without touching the network. */
export async function reparsePage(
  storage: StorageAdapter,
  book: Book,
  pageIndex: number,
  tocIndex: TocIndex,
): Promise<number> {
  const page = await storage.getPage(book.id, pageIndex);
  if (!page) return 0;

  const parsedBlocks = parseBlocks(page.rawHtml);
  const blocks = await buildBlocks(storage, book, page, parsedBlocks, tocIndex, null);
  await storage.deleteBlocksForPage(page.id);
  await storage.putBlocks(blocks);
  return blocks.length;
}

/**
 * Build the blocks for a page.
 *
 * Block IDs are *derived*, not allocated: `bookId:p{page}:{index}`. Same book,
 * same page, same position, same ID — on any device, on any import, in any
 * order. That is what makes a user's cards and marks portable independently of
 * the book content, and it is why the earlier counter-plus-matching scheme is
 * gone: a monotonic counter is not reproducible, so a second import of the same
 * book minted different IDs and stranded every anchor pointing at the old ones.
 *
 * The trade-off is that if a re-parse changes how many blocks a page yields,
 * the index of everything after the change shifts. `contentHash` exists to make
 * that visible rather than silent.
 */
async function buildBlocks(
  _storage: StorageAdapter,
  book: Book,
  page: Page,
  parsedBlocks: ParsedPage['blocks'],
  tocIndex: TocIndex,
  parsed: ParsedPage | null,
): Promise<Block[]> {
  if (parsedBlocks.length === 0) return [];

  const tocNodeId = tocIndex.resolve(parsed?.activeTocPageIndex ?? page.pageIndex);

  return parsedBlocks.map((parsedBlock, offset) => {
    const detection = detectBlockType({
      text: parsedBlock.text,
      spans: parsedBlock.spans,
      wholeBlockIsHeading: parsedBlock.wholeBlockIsHeading,
      profile: book.structureProfile,
    });

    return {
      id: blockIdFor(book.id, page.pageIndex, offset),
      bookId: book.id,
      pageId: page.id,
      // Ordering is derived from position in the book, so it stays correct even
      // when pages arrive out of order after a resume.
      order: page.pageIndex * 1000 + offset,
      type: detection.type,
      text: parsedBlock.text,
      normalized: normalize(parsedBlock.text),
      contentHash: sha256(parsedBlock.text),
      hadithNumber: detection.hadithNumber,
      tocNodeId,
      spans: parsedBlock.spans,
      anchor: parsedBlock.anchor,
    };
  });
}

/** The one place a block ID is formed. Deterministic by construction. */
export function blockIdFor(bookId: string, pageIndex: number, indexWithinPage: number): string {
  return `${bookId}:p${pageIndex}:${indexWithinPage}`;
}

function volumeFor(book: Book, pageIndex: number): number | null {
  if (book.volumeStarts.length === 0) return null;
  let volume = 1;
  for (const [index, start] of book.volumeStarts.entries()) {
    if (pageIndex >= start) volume = index + 1;
  }
  return volume;
}

/** Maps a page index to the TOC node whose section contains it. */
export class TocIndex {
  private readonly sorted: { pageIndex: number; id: string }[];

  constructor(nodes: TocNode[]) {
    this.sorted = nodes
      .map((node) => ({ pageIndex: node.pageIndex, id: node.id }))
      .sort((a, b) => a.pageIndex - b.pageIndex);
  }

  resolve(pageIndex: number): string | null {
    let found: string | null = null;
    for (const entry of this.sorted) {
      if (entry.pageIndex > pageIndex) break;
      found = entry.id;
    }
    return found;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
