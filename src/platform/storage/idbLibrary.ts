import type { IDBPDatabase } from 'idb';
import type { Block, Book, CrawlState, DictionaryEntry, Entity, Page, TocNode } from '../../types';
import { letterFold } from '../../lib/arabic';
import type { PageMeta, SearchHit } from './StorageAdapter';
import { BOOK_STORES, type Schema } from './idbSchema';
import { purgeIndex } from './idbPurge';
import { deleteNarratorShard } from './idbReference';

// Book content: books and their removal, the table of contents, pages,
// blocks and search, entities, dictionary entries and crawl state. Moved
// verbatim from IdbStorageAdapter.ts in restructure Phase 4 step 4h
// (docs/refactor/plans/phase4-storage.md), each method made a function whose
// first parameter fetches the database handle — a fetcher rather than the
// handle for the reason given in idbTransfer.ts (the empty `putBlocks`,
// `putEntities` and `putDictionaryEntries`, and the searches with an empty
// query, resolve even before `init`). The functions that read or invalidate
// the in-memory search index take it as a second parameter; the map itself,
// and why it exists, stay with the class.

/** Minimal per-block record kept in memory for search. */
export interface SearchEntry {
  id: string;
  normalized: string;
  /**
   * Letters and single spaces only.
   *
   * Reader search wants `normalized`, which keeps punctuation, because a
   * reader types punctuation. Matching one book's passage against another's
   * wants this: the two editors punctuate differently, and a colon or a
   * doubled bracket in one and not the other defeats an otherwise exact run.
   * Computed once, when the index loads.
   */
  folded: string;
}

export async function putBook(handle: () => IDBPDatabase<Schema>, book: Book): Promise<void> {
  await handle().put('books', book);
}

export async function getBook(
  handle: () => IDBPDatabase<Schema>,
  id: string,
): Promise<Book | undefined> {
  return handle().get('books', id);
}

export async function listBooks(handle: () => IDBPDatabase<Schema>): Promise<Book[]> {
  const books = await handle().getAll('books');
  return books.sort((a, b) => b.importedAt - a.importedAt);
}

export async function deleteBook(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, SearchEntry[]>,
  id: string,
): Promise<void> {
  const db = handle();
  for (const store of BOOK_STORES) {
    await purgeIndex(handle(), store, 'byBook', id);
  }
  // Narrator profiles are filed by SHARD, not by book, so they are not in
  // the loop above. A Taqrīb import's profiles belong to this book and must
  // go with it; an installed Itqan shard belongs to no book and must not.
  await deleteNarratorShard(handle, `taqrib:${id}`);

  // The book row goes last. An interrupted removal then still lists the book,
  // so pressing Remove again finishes the job; deleting the row first would
  // strand every other store's rows with nothing left to reach them by.
  await db.delete('books', id);
  await db.delete('crawlStates', id);
  await db.delete('positions', id);
  searchIndex.delete(id);
}

export async function putTocNodes(
  handle: () => IDBPDatabase<Schema>,
  nodes: TocNode[],
): Promise<void> {
  const tx = handle().transaction('tocNodes', 'readwrite');
  await Promise.all(nodes.map((node) => tx.store.put(node)));
  await tx.done;
}

export async function listTocNodes(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<TocNode[]> {
  const nodes = await handle().getAllFromIndex('tocNodes', 'byBook', bookId);
  return nodes.sort((a, b) => a.order - b.order);
}

export async function putPage(handle: () => IDBPDatabase<Schema>, page: Page): Promise<void> {
  await handle().put('pages', page);
}

export async function getPage(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
  pageIndex: number,
): Promise<Page | undefined> {
  return handle().get('pages', `${bookId}:p${pageIndex}`);
}

/**
 * Reads only the compound index keys, never the records themselves — the
 * stored HTML for a whole book is tens of megabytes and must not be pulled
 * into memory just to work out which pages are missing.
 */
export async function listFetchedPageIndices(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<number[]> {
  const tx = handle().transaction('pages', 'readonly');
  const indices: number[] = [];
  let cursor = await tx.store
    .index('byBookPage')
    .openKeyCursor(IDBKeyRange.bound([bookId, -Infinity], [bookId, Infinity]));
  while (cursor) {
    indices.push(cursor.key[1]);
    cursor = await cursor.continue();
  }
  await tx.done;
  return indices.sort((a, b) => a - b);
}

/**
 * Cursors the page records and keeps only the three numbers the reader needs.
 * The stored HTML passes through but is never retained, so the ج/ص margin
 * costs a few hundred kilobytes of live memory instead of the whole book.
 */
export async function listPageMeta(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<PageMeta[]> {
  const meta: PageMeta[] = [];
  const tx = handle().transaction('pages', 'readonly');
  let cursor = await tx.store
    .index('byBookPage')
    .openCursor(IDBKeyRange.bound([bookId, -Infinity], [bookId, Infinity]));
  while (cursor) {
    meta.push({
      pageIndex: cursor.value.pageIndex,
      volume: cursor.value.volume,
      printPage: cursor.value.printPage,
    });
    cursor = await cursor.continue();
  }
  await tx.done;
  return meta;
}

export async function countPages(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<number> {
  return handle().countFromIndex('pages', 'byBook', bookId);
}

export async function putBlocks(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, SearchEntry[]>,
  blocks: Block[],
): Promise<void> {
  if (blocks.length === 0) return;
  const tx = handle().transaction('blocks', 'readwrite');
  await Promise.all(blocks.map((block) => tx.store.put(block)));
  await tx.done;
  searchIndex.delete(blocks[0].bookId);
}

export async function deleteBlocksForPage(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, SearchEntry[]>,
  pageId: string,
): Promise<void> {
  const tx = handle().transaction('blocks', 'readwrite');
  let cursor = await tx.store.index('byPage').openCursor(pageId);
  let bookId: string | null = null;
  while (cursor) {
    bookId = cursor.value.bookId;
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
  if (bookId) searchIndex.delete(bookId);
}

export async function listBlocksForPage(
  handle: () => IDBPDatabase<Schema>,
  pageId: string,
): Promise<Block[]> {
  const blocks = await handle().getAllFromIndex('blocks', 'byPage', pageId);
  return blocks.sort((a, b) => a.order - b.order);
}

export async function listBlocks(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<Block[]> {
  const blocks = await handle().getAllFromIndex('blocks', 'byBook', bookId);
  return blocks.sort((a, b) => a.order - b.order);
}

export async function getBlock(
  handle: () => IDBPDatabase<Schema>,
  id: string,
): Promise<Block | undefined> {
  return handle().get('blocks', id);
}

export async function countBlocks(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<number> {
  return handle().countFromIndex('blocks', 'byBook', bookId);
}

async function loadSearchIndex(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, SearchEntry[]>,
  bookId: string,
): Promise<SearchEntry[]> {
  const cached = searchIndex.get(bookId);
  if (cached) return cached;

  const entries: SearchEntry[] = [];
  const tx = handle().transaction('blocks', 'readonly');
  let cursor = await tx.store.index('byBookOrder').openCursor(
    IDBKeyRange.bound([bookId, -Infinity], [bookId, Infinity]),
  );
  while (cursor) {
    entries.push({
      id: cursor.value.id,
      normalized: cursor.value.normalized,
      folded: letterFold(cursor.value.normalized),
    });
    cursor = await cursor.continue();
  }
  await tx.done;

  searchIndex.set(bookId, entries);
  return entries;
}

/**
 * Search on letters alone, for matching a passage across two books.
 *
 * Same scan as `searchBlocks`, against the folded field. Separate rather
 * than a flag because the two have different meanings: one answers "where
 * did the reader's words occur", the other "is this the same passage".
 */
export async function searchBlocksLoose(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, SearchEntry[]>,
  bookId: string,
  foldedQuery: string,
  limit: number,
): Promise<SearchHit[]> {
  if (!foldedQuery) return [];
  const entries = await loadSearchIndex(handle, searchIndex, bookId);

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const at = entry.folded.indexOf(foldedQuery);
    if (at === -1) continue;
    const block = await getBlock(handle, entry.id);
    if (!block) continue;
    hits.push({ block, matchStart: at, matchLength: foldedQuery.length });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function searchBlocks(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, SearchEntry[]>,
  bookId: string,
  normalizedQuery: string,
  limit: number,
): Promise<SearchHit[]> {
  if (!normalizedQuery) return [];
  const entries = await loadSearchIndex(handle, searchIndex, bookId);

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const at = entry.normalized.indexOf(normalizedQuery);
    if (at === -1) continue;
    const block = await getBlock(handle, entry.id);
    if (!block) continue;
    hits.push({ block, matchStart: at, matchLength: normalizedQuery.length });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function putEntities(
  handle: () => IDBPDatabase<Schema>,
  entities: Entity[],
): Promise<void> {
  if (entities.length === 0) return;
  for (let i = 0; i < entities.length; i += 500) {
    const tx = handle().transaction('entities', 'readwrite');
    await Promise.all(entities.slice(i, i + 500).map((entity) => tx.store.put(entity)));
    await tx.done;
  }
}

export async function listEntities(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<Entity[]> {
  return handle().getAllFromIndex('entities', 'byBook', bookId);
}

export async function clearEntities(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<void> {
  await purgeIndex(handle(), 'entities', 'byBook', bookId);
}

export async function putDictionaryEntries(
  handle: () => IDBPDatabase<Schema>,
  entries: DictionaryEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  for (let i = 0; i < entries.length; i += 500) {
    const tx = handle().transaction('dictionaryEntries', 'readwrite');
    await Promise.all(entries.slice(i, i + 500).map((entry) => tx.store.put(entry)));
    await tx.done;
  }
}

export async function listDictionaryEntries(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<DictionaryEntry[]> {
  return handle().getAllFromIndex('dictionaryEntries', 'byBook', bookId);
}

export async function clearDictionaryEntries(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<void> {
  await purgeIndex(handle(), 'dictionaryEntries', 'byBook', bookId);
}

export async function putCrawlState(
  handle: () => IDBPDatabase<Schema>,
  state: CrawlState,
): Promise<void> {
  await handle().put('crawlStates', state);
}

export async function getCrawlState(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<CrawlState | undefined> {
  return handle().get('crawlStates', bookId);
}
