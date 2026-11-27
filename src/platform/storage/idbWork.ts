import type { IDBPDatabase } from 'idb';
import type {
  AppSettings,
  BookPlacement,
  ExplanationCard,
  GlossaryEntry,
  LibraryFolder,
  Mark,
  ReadingPosition,
  ShareRecord,
  SharhCard,
  TranslationCard,
  TranslationProfile,
  WordGloss,
} from '../../types';
import type { Schema } from './idbSchema';

// The user's work: marks, cards, profiles, glossary, reading positions,
// settings, explanation and sharḥ cards, share records and word glosses —
// and, since version 12, how the library is arranged (placements, folders).
// Moved verbatim from IdbStorageAdapter.ts in restructure Phase 4 step 4f
// (docs/refactor/plans/phase4-storage.md), each method made a function whose
// first parameter fetches the database handle — a fetcher rather than the
// handle for the reason given in idbTransfer.ts (`putMarks` and `deleteMarks`
// with an empty list resolve even before `init`).

export const SETTINGS_KEY = 'app';

export async function putMarks(handle: () => IDBPDatabase<Schema>, marks: Mark[]): Promise<void> {
  if (marks.length === 0) return;
  const tx = handle().transaction('marks', 'readwrite');
  await Promise.all(marks.map((mark) => tx.store.put(mark)));
  await tx.done;
}

export async function listMarks(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<Mark[]> {
  return handle().getAllFromIndex('marks', 'byBook', bookId);
}

export async function deleteMarks(
  handle: () => IDBPDatabase<Schema>,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const tx = handle().transaction('marks', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function putCard(
  handle: () => IDBPDatabase<Schema>,
  card: TranslationCard,
): Promise<void> {
  await handle().put('cards', card);
}

export async function listCards(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<TranslationCard[]> {
  return handle().getAllFromIndex('cards', 'byBook', bookId);
}

export async function getCardByCacheKey(
  handle: () => IDBPDatabase<Schema>,
  cacheKey: string,
): Promise<TranslationCard | undefined> {
  // Only a finished card is a cache hit (FOUND_ISSUES 41). A failed card is
  // stored under the key it was asked with, so serving it would show the same
  // error again with no request, and a transient failure would stick until the
  // card's own Retry. Several rows can share one key (a failed card and the
  // later success), so the index is walked rather than reading its first row.
  // A partial card (only part of the passage came back, TranslationCard.partial)
  // is not a hit either: selecting the passage again is how it is asked for
  // whole, and serving the part would answer that with the same part.
  let cursor = await handle()
    .transaction('cards')
    .store.index('byCacheKey')
    .openCursor(cacheKey);
  while (cursor) {
    if (cursor.value.status === 'complete' && !cursor.value.partial) return cursor.value;
    cursor = await cursor.continue();
  }
  return undefined;
}

export async function deleteCard(handle: () => IDBPDatabase<Schema>, id: string): Promise<void> {
  await handle().delete('cards', id);
}

export async function putProfile(
  handle: () => IDBPDatabase<Schema>,
  profile: TranslationProfile,
): Promise<void> {
  await handle().put('profiles', profile);
}

export async function listProfiles(
  handle: () => IDBPDatabase<Schema>,
): Promise<TranslationProfile[]> {
  return handle().getAll('profiles');
}

export async function getProfile(
  handle: () => IDBPDatabase<Schema>,
  id: string,
): Promise<TranslationProfile | undefined> {
  return handle().get('profiles', id);
}

export async function deleteProfile(handle: () => IDBPDatabase<Schema>, id: string): Promise<void> {
  await handle().delete('profiles', id);
}

export async function putGlossaryEntry(
  handle: () => IDBPDatabase<Schema>,
  entry: GlossaryEntry,
): Promise<void> {
  await handle().put('glossary', entry);
}

export async function listGlossary(handle: () => IDBPDatabase<Schema>): Promise<GlossaryEntry[]> {
  const entries = await handle().getAll('glossary');
  return entries.sort((a, b) => a.addedAt - b.addedAt);
}

export async function deleteGlossaryEntry(
  handle: () => IDBPDatabase<Schema>,
  id: string,
): Promise<void> {
  await handle().delete('glossary', id);
}

export async function putReadingPosition(
  handle: () => IDBPDatabase<Schema>,
  position: ReadingPosition,
): Promise<void> {
  await handle().put('positions', position);
}

export async function getReadingPosition(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<ReadingPosition | undefined> {
  return handle().get('positions', bookId);
}

export async function putSettings(
  handle: () => IDBPDatabase<Schema>,
  settings: AppSettings,
): Promise<void> {
  await handle().put('settings', { ...settings, key: SETTINGS_KEY });
}

export async function getSettings(
  handle: () => IDBPDatabase<Schema>,
): Promise<AppSettings | undefined> {
  const stored = await handle().get('settings', SETTINGS_KEY);
  if (!stored) return undefined;
  const { key: _key, ...settings } = stored;
  return settings;
}

export async function putExplanationCard(
  handle: () => IDBPDatabase<Schema>,
  card: ExplanationCard,
): Promise<void> {
  await handle().put('explanationCards', card);
}

export async function listExplanationCards(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<ExplanationCard[]> {
  return handle().getAllFromIndex('explanationCards', 'byBook', bookId);
}

export async function deleteExplanationCard(
  handle: () => IDBPDatabase<Schema>,
  id: string,
): Promise<void> {
  await handle().delete('explanationCards', id);
}

export async function putSharhCard(
  handle: () => IDBPDatabase<Schema>,
  card: SharhCard,
): Promise<void> {
  await handle().put('sharhCards', card);
}

export async function listSharhCards(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<SharhCard[]> {
  return handle().getAllFromIndex('sharhCards', 'byBook', bookId);
}

export async function deleteSharhCard(
  handle: () => IDBPDatabase<Schema>,
  id: string,
): Promise<void> {
  await handle().delete('sharhCards', id);
}

export async function putShareRecord(
  handle: () => IDBPDatabase<Schema>,
  record: ShareRecord,
): Promise<void> {
  await handle().put('shareRecords', record);
}

export async function listShareRecords(handle: () => IDBPDatabase<Schema>): Promise<ShareRecord[]> {
  const records = await handle().getAll('shareRecords');
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Forgets the local record. It does not, and cannot, unpublish anything.
 *
 * The file lives in a git repository that only the author can push to, so
 * withdrawing a share is deleting that file and pushing. Settings says so
 * rather than implying this button did it.
 */
export async function deleteShareRecord(
  handle: () => IDBPDatabase<Schema>,
  id: string,
): Promise<void> {
  await handle().delete('shareRecords', id);
}

export async function putWordGloss(
  handle: () => IDBPDatabase<Schema>,
  gloss: WordGloss,
): Promise<void> {
  await handle().put('wordGlosses', gloss);
}

export async function getWordGloss(
  handle: () => IDBPDatabase<Schema>,
  word: string,
): Promise<WordGloss | undefined> {
  return handle().get('wordGlosses', word);
}

export async function listWordGlosses(handle: () => IDBPDatabase<Schema>): Promise<WordGloss[]> {
  return handle().getAll('wordGlosses');
}

// The library's arrangement (version 12; see BookPlacement). Added after
// restructure Phase 4, so not moved code.

export async function listBookPlacements(
  handle: () => IDBPDatabase<Schema>,
): Promise<BookPlacement[]> {
  return handle().getAll('bookPlacements');
}

/**
 * Writes the placements in one transaction. A move renumbers a whole section,
 * and a section written half-way would leave two books with one place.
 */
export async function putBookPlacements(
  handle: () => IDBPDatabase<Schema>,
  placements: BookPlacement[],
): Promise<void> {
  if (placements.length === 0) return;
  const tx = handle().transaction('bookPlacements', 'readwrite');
  await Promise.all(placements.map((placement) => tx.store.put(placement)));
  await tx.done;
}

/** In the order they were made, which is the order the Library lists them. */
export async function listLibraryFolders(
  handle: () => IDBPDatabase<Schema>,
): Promise<LibraryFolder[]> {
  const folders = await handle().getAll('libraryFolders');
  return folders.sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export async function putLibraryFolder(
  handle: () => IDBPDatabase<Schema>,
  folder: LibraryFolder,
): Promise<void> {
  await handle().put('libraryFolders', folder);
}

/**
 * Removes the folder and moves its books to Unfiled, in one transaction: a
 * folder deleted while its books still named it would leave them shown as
 * Unfiled anyway (a placement naming no folder is), but a failure between two
 * transactions could leave the folder in place with its books moved out, and
 * neither half is what was asked. No book is deleted.
 *
 * An unpinned book's place is cleared, so it arrives at the top of Unfiled
 * rather than wherever its old number falls among Unfiled's books. A pinned
 * book keeps its place: it is shown in Pinned, and its number is its place
 * there, which deleting a folder does not change.
 */
export async function deleteLibraryFolder(
  handle: () => IDBPDatabase<Schema>,
  id: string,
  now: number,
): Promise<void> {
  const tx = handle().transaction(['bookPlacements', 'libraryFolders'], 'readwrite');
  const placements = tx.objectStore('bookPlacements');
  const filed = (await placements.getAll()).filter((placement) => placement.folderId === id);
  await Promise.all([
    ...filed.map((placement) =>
      placements.put({
        ...placement,
        folderId: null,
        position: placement.pinned ? placement.position : null,
        updatedAt: now,
      }),
    ),
    tx.objectStore('libraryFolders').delete(id),
  ]);
  await tx.done;
}
