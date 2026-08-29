import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Block, Book } from '../types';
import { buildBiographyIndex, type BiographyIndexResult } from './buildIndex';
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

/**
 * The blocks making up one entry, read at open time rather than at index time.
 *
 * The contents give a page, not a range: an entry runs from its own heading to
 * the next one, which may be on the same page or several pages later. Reading
 * the page the entry starts on covers the overwhelming majority and costs one
 * lookup; nothing here fetches from the network, so an entry on an unfetched
 * page simply has no text to show and says so.
 */
export async function entryBlocks(
  storage: StorageAdapter,
  bookId: string,
  pageIndex: number,
): Promise<Block[]> {
  const page = await storage.getPage(bookId, pageIndex);
  if (!page) return [];
  return storage.listBlocksForPage(page.id);
}
