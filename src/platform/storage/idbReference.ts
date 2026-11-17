import type { IDBPDatabase } from 'idb';
import type {
  BiographyEntry,
  HadithRecord,
  QulCompilation,
  QulEntry,
  QulResource,
  QuranVerse,
  StoredNarratorProfile,
} from '../../types';
import type { Schema } from './idbSchema';
import { purgeIndex } from './idbPurge';

// Reference data: the retrieval cache (Qurʾān verses, ḥadīth), QUL resources,
// entries and compilations, biography entries and narrator profiles. Moved
// verbatim from IdbStorageAdapter.ts in restructure Phase 4 step 4g
// (docs/refactor/plans/phase4-storage.md), each method made a function whose
// first parameter fetches the database handle — a fetcher rather than the
// handle for the reason given in idbTransfer.ts (`putNarratorProfiles` with an
// empty list, and `findNarratorProfiles` under three letters, resolve even
// before `init`).

export async function putQuranVerse(
  handle: () => IDBPDatabase<Schema>,
  verse: QuranVerse,
): Promise<void> {
  await handle().put('quranVerses', verse);
}

export async function getQuranVerse(
  handle: () => IDBPDatabase<Schema>,
  reference: string,
): Promise<QuranVerse | undefined> {
  return handle().get('quranVerses', reference);
}

export async function putHadith(
  handle: () => IDBPDatabase<Schema>,
  record: HadithRecord,
): Promise<void> {
  await handle().put('hadiths', record);
}

export async function getHadith(
  handle: () => IDBPDatabase<Schema>,
  reference: string,
): Promise<HadithRecord | undefined> {
  return handle().get('hadiths', reference);
}

export async function putQulResource(
  handle: () => IDBPDatabase<Schema>,
  resource: QulResource,
): Promise<void> {
  await handle().put('qulResources', resource);
}

export async function putBiographyEntries(
  handle: () => IDBPDatabase<Schema>,
  entries: BiographyEntry[],
): Promise<void> {
  const transaction = handle().transaction('biographyEntries', 'readwrite');
  await Promise.all(entries.map((entry) => transaction.store.put(entry)));
  await transaction.done;
}

export async function listBiographyEntries(
  handle: () => IDBPDatabase<Schema>,
  bookId?: string,
): Promise<BiographyEntry[]> {
  if (bookId === undefined) return handle().getAll('biographyEntries');
  return handle().getAllFromIndex('biographyEntries', 'byBook', bookId);
}

export async function clearBiographyEntries(
  handle: () => IDBPDatabase<Schema>,
  bookId: string,
): Promise<void> {
  await purgeIndex(handle(), 'biographyEntries', 'byBook', bookId);
}

export async function listQulResources(handle: () => IDBPDatabase<Schema>): Promise<QulResource[]> {
  const all = await handle().getAll('qulResources');
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteQulResource(
  handle: () => IDBPDatabase<Schema>,
  id: string,
): Promise<void> {
  // Entries first, resource row last. A word-by-word resource is ~77,000
  // entries, too many to clear in a single transaction without the same
  // per-row stall `purgeIndex` exists to avoid — so the removal is no longer
  // atomic, and the ordering is what makes that safe: an interrupted purge
  // still lists the resource, and pressing Remove again finishes it. The
  // reverse order would leave entries no longer reachable from anywhere.
  await purgeIndex(handle(), 'qulEntries', 'byResource', id);
  await handle().delete('qulResources', id);
}

export async function putQulEntries(
  handle: () => IDBPDatabase<Schema>,
  entries: QulEntry[],
): Promise<void> {
  const transaction = handle().transaction('qulEntries', 'readwrite');
  await Promise.all(entries.map((entry) => transaction.store.put(entry)));
  await transaction.done;
}

export async function getQulEntry(
  handle: () => IDBPDatabase<Schema>,
  resourceId: string,
  key: string,
): Promise<QulEntry | undefined> {
  return handle().get('qulEntries', `${resourceId}|${key}`);
}

export async function getQulEntries(
  handle: () => IDBPDatabase<Schema>,
  resourceId: string,
  keys: string[],
): Promise<QulEntry[]> {
  const transaction = handle().transaction('qulEntries', 'readonly');
  const found = await Promise.all(
    keys.map((key) => transaction.store.get(`${resourceId}|${key}`)),
  );
  await transaction.done;
  return found.filter((entry): entry is QulEntry => entry !== undefined);
}

export async function putQulCompilation(
  handle: () => IDBPDatabase<Schema>,
  record: QulCompilation,
): Promise<void> {
  await handle().put('qulCompilations', record);
}

export async function getQulCompilation(
  handle: () => IDBPDatabase<Schema>,
  cacheKey: string,
): Promise<QulCompilation | undefined> {
  return handle().get('qulCompilations', cacheKey);
}

export async function putNarratorProfiles(
  handle: () => IDBPDatabase<Schema>,
  profiles: StoredNarratorProfile[],
): Promise<void> {
  for (let i = 0; i < profiles.length; i += 500) {
    const tx = handle().transaction('narratorProfiles', 'readwrite');
    await Promise.all(profiles.slice(i, i + 500).map((row) => tx.store.put(row)));
    await tx.done;
  }
}

export async function findNarratorProfiles(
  handle: () => IDBPDatabase<Schema>,
  naming: string,
): Promise<StoredNarratorProfile[]> {
  if (naming.length < 3) return [];
  return handle().getAllFromIndex('narratorProfiles', 'byNaming', naming);
}

export async function listNarratorShards(
  handle: () => IDBPDatabase<Schema>,
): Promise<{ shard: string; count: number }[]> {
  const counts = new Map<string, number>();
  const tx = handle().transaction('narratorProfiles', 'readonly');
  // Key cursor only: counting shards must not read tens of thousands of
  // full profiles into memory just to render a settings row.
  let cursor = await tx.store.index('byShard').openKeyCursor();
  while (cursor) {
    counts.set(cursor.key as string, (counts.get(cursor.key as string) ?? 0) + 1);
    cursor = await cursor.continue();
  }
  await tx.done;
  return [...counts].map(([shard, count]) => ({ shard, count }));
}

export async function deleteNarratorShard(
  handle: () => IDBPDatabase<Schema>,
  shard: string,
): Promise<void> {
  await purgeIndex(handle(), 'narratorProfiles', 'byShard', shard);
}
