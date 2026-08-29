import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { BiographyEntry, Block, Book } from '../types';
import { foldName } from '../retrieval/narrator';
import {
  buildBiographyIndex,
  looksLikeEntryHeading,
  type BiographyIndexResult,
} from './buildIndex';
import { lookupBiography, type BiographyLookup } from './lookup';

// Wiring the biographical index to storage.
//
// The index is derived from a book's own table of contents, so it is cheap to
// rebuild and is never migrated: any change to the derivation is picked up by
// rebuilding, exactly as entity detection is.

/** Books whose contents can be name-indexed. */
export function isBiographicalWork(book: Book): boolean {
  return book.role === 'reference' && book.category.includes('التراجم');
}

/**
 * Build and store a book's name index, replacing whatever was there.
 *
 * Returns the result including a refusal, which the caller shows to the user.
 * A refusal is a normal outcome and not an error: it means this work's contents
 * are section headings rather than people, and saying so is the whole point.
 */
export async function rebuildBiographyIndex(
  storage: StorageAdapter,
  book: Book,
): Promise<BiographyIndexResult> {
  const nodes = await storage.listTocNodes(book.id);
  const result = buildBiographyIndex(book.id, nodes, book.volumeStarts ?? []);

  await storage.clearBiographyEntries(book.id);
  if (result.entries.length > 0) {
    for (let index = 0; index < result.entries.length; index += 1000) {
      await storage.putBiographyEntries(result.entries.slice(index, index + 1000));
    }
  }
  return result;
}

/**
 * Look a selected name up across every imported biographical work.
 *
 * Reads the whole index — three works at most, a few tens of thousands of rows
 * — and filters in memory. An IndexedDB index on aliases would need a
 * multiEntry key and would still not answer containment queries, which is what
 * matching a short form against a full nasab requires.
 */
export async function lookupName(
  storage: StorageAdapter,
  selection: string,
): Promise<BiographyLookup> {
  const [entries, books] = await Promise.all([
    storage.listBiographyEntries(),
    storage.listBooks(),
  ]);
  return lookupBiography(selection, entries, books);
}

/** Whether any biographical work is imported and indexed at all. */
export async function hasBiographies(storage: StorageAdapter): Promise<boolean> {
  const entries = await storage.listBiographyEntries();
  return entries.length > 0;
}

/**
 * Index any biographical work that has been imported but not yet indexed.
 *
 * Lazy, exactly as entity detection is: a work imported before this feature
 * existed, or restored from a backup, gets its index on the next reader open
 * rather than needing a migration. Returns whether anything is now indexed, so
 * the caller can decide whether to offer the action at all.
 *
 * A refusal is remembered by absence — a work whose contents are not names has
 * no entries, so this retries it each time. That is cheap (it reads a TOC and
 * runs a regex) and means fixing the underlying problem, by importing a better
 * edition, takes effect without anything to reset.
 */
export async function ensureBiographyIndexes(
  storage: StorageAdapter,
): Promise<{ indexed: boolean; results: Map<string, BiographyIndexResult> }> {
  const books = await storage.listBooks();
  const works = books.filter(isBiographicalWork);
  const results = new Map<string, BiographyIndexResult>();

  for (const book of works) {
    const existing = await storage.listBiographyEntries(book.id);
    if (existing.length > 0) continue;
    results.set(book.id, await rebuildBiographyIndex(storage, book));
  }

  return { indexed: await hasBiographies(storage), results };
}

/** What the sheet needs to render one entry. */
export interface EntryReading {
  blocks: Block[];
  /** Printed ج/ص, read from the page rather than guessed from the index. */
  volume: number | null;
  printPage: number | null;
  /** False when the entry's own heading could not be found in the body. */
  anchored: boolean;
  /** True when the entry runs past the pages that were read. */
  truncated: boolean;
  /** Pages the entry spans that have not been crawled yet. */
  missingPages: number[];
}

/**
 * How far past its own page an entry is allowed to run.
 *
 * A bound, not an estimate. Most entries are a page or two, but the major
 * Companions are far longer — ʿUmar b. al-Khaṭṭāb runs 31 pages across eleven
 * subsections. The cap only stops one lookup pulling half a volume out of
 * IndexedDB if the index is ever wrong about where the next entry starts.
 */
const MAX_ENTRY_PAGES = 40;

/**
 * The blocks making up one entry, read at open time rather than at index time.
 *
 * ---------------------------------------------------------------------------
 * A page is neither the start nor the end of an entry
 *
 * This is the thing the first version got wrong. The contents give a page, and
 * the obvious implementation shows that page — but Usd al-Ghāba prints 2.5
 * entries to a page. The page ʿUmar b. al-Khaṭṭāb starts on opens with the tail
 * of one biography, continues with the whole of ʿUmar b. al-Ḥakam as-Sulamī,
 * and only reaches ʿUmar himself in the second-to-last block, whose text then
 * runs onto the following page. Showing the page showed the wrong man.
 *
 * So the body is anchored on the work's own heading. Usd al-Ghāba prints
 * «[٣٨٣٠ - عمر بن الخطاب]» as a heading block, and the number is the same one
 * the contents line carries — which makes it an exact, non-fuzzy anchor. The
 * entry then runs to the next heading, across page boundaries, bounded by where
 * the index says the following entry begins.
 *
 * Falling back to the whole page when no heading matches is deliberate: some
 * text is better than none, and `anchored: false` lets the sheet say so rather
 * than pretending.
 * ---------------------------------------------------------------------------
 */
export async function entryBlocks(
  storage: StorageAdapter,
  entry: BiographyEntry,
): Promise<EntryReading> {
  const last = Math.min(
    Math.max(entry.endPageIndex, entry.pageIndex),
    entry.pageIndex + MAX_ENTRY_PAGES,
  );
  const truncated = entry.endPageIndex > last;

  const blocks: Block[] = [];
  const missingPages: number[] = [];
  let volume: number | null = null;
  let printPage: number | null = null;

  for (let index = entry.pageIndex; index <= last; index++) {
    const page = await storage.getPage(entry.bookId, index);
    if (!page) {
      missingPages.push(index);
      continue;
    }
    if (index === entry.pageIndex) {
      volume = page.volume;
      printPage = page.printPage;
    }
    blocks.push(...(await storage.listBlocksForPage(page.id)));
  }

  if (blocks.length === 0) {
    return { blocks, volume, printPage, anchored: false, truncated, missingPages };
  }

  const start = blocks.findIndex((block) => isHeadingFor(block, entry));
  if (start === -1) {
    // No heading matched. Show the page rather than nothing, and say so.
    return { blocks, volume, printPage, anchored: false, truncated, missingPages };
  }

  // Runs to the next NUMBERED heading — the following entry.
  //
  // Not the next heading of any kind: a long biography is subdivided by its own
  // unnumbered headings («إسلامه», «هجرته», «فضائله»), and stopping at the first
  // of those cut ʿUmar's life off after its opening paragraph. Those headings
  // are part of the entry and belong in the text, where they give the reader
  // the work's own structure.
  let end = blocks.length;
  for (let index = start + 1; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.type === 'chapter_title' && looksLikeEntryHeading(block.text)) {
      end = index;
      break;
    }
  }

  return {
    blocks: blocks.slice(start, end),
    volume,
    printPage,
    anchored: true,
    truncated: truncated && end === blocks.length,
    missingPages,
  };
}

/**
 * Whether this block is the heading that opens the given entry.
 *
 * By number where the work prints one, because a number is exact and a name is
 * not: «عمر بن الخطاب» also occurs inside «أم عبد الله بن عمر بن الخطاب», and
 * matching on the name alone would open his daughter's entry for him. Falls
 * back to the folded name for works that do not number their entries.
 */
function isHeadingFor(block: Block, entry: BiographyEntry): boolean {
  if (block.type !== 'chapter_title') return false;

  if (entry.entryNumber) {
    // Bounded by non-digits so «٣٨٣» does not match inside «٣٨٣٠».
    const pattern = new RegExp(`(?:^|[^0-9\u0660-\u0669])${entry.entryNumber}(?:[^0-9\u0660-\u0669]|$)`);
    return pattern.test(block.text);
  }

  return foldName(block.text).includes(entry.nameNormalized);
}
