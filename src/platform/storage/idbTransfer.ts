import type { IDBPDatabase } from 'idb';
import type { Schema } from './idbSchema';

// Raw store I/O for the whole-tablet transfer (library/deviceTransfer.ts,
// through the StorageAdapter interface): list the stores, count, read in key
// order, write and clear them. Moved verbatim from IdbStorageAdapter.ts in
// restructure Phase 4 step 4e (docs/refactor/plans/phase4-storage.md), each
// method made a function whose first parameter fetches the database handle.
//
// A function that fetches the handle, rather than the handle itself, because
// some methods return before they touch the database — `putStoreRows` with no
// rows resolves even before `init` — and reading `this.handle` in the class to
// pass it would make them reject instead (check D's before-init scenario).
//
// The search index is passed as `Map<string, unknown>`: these functions only
// clear it, and its entry type moves with the book-content group (step 4h).
//
// Untyped on purpose: these move rows between this database and a file
// without interpreting them, so the per-store generics would add casts and
// no safety. The store name is checked against the live database instead.

export function listStoreNames(handle: () => IDBPDatabase<Schema>): string[] {
  return Array.from(handle().objectStoreNames);
}

function untyped(handle: () => IDBPDatabase<Schema>, store: string): IDBPDatabase {
  const db = handle() as unknown as IDBPDatabase;
  if (!db.objectStoreNames.contains(store)) {
    throw new Error(`This database has no "${store}" store.`);
  }
  return db;
}

export async function countStoreRows(
  handle: () => IDBPDatabase<Schema>,
  store: string,
): Promise<number> {
  return untyped(handle, store).count(store);
}

export async function readStoreRows(
  handle: () => IDBPDatabase<Schema>,
  store: string,
  after: unknown,
  limit: number,
): Promise<{ rows: unknown[]; lastKey: unknown }> {
  const db = untyped(handle, store);
  const range =
    after === undefined ? undefined : IDBKeyRange.lowerBound(after as IDBValidKey, true);
  // One transaction for both reads, so the keys and the rows describe the
  // same snapshot and line up index for index.
  const tx = db.transaction(store, 'readonly');
  const [keys, rows] = await Promise.all([
    tx.store.getAllKeys(range, limit),
    tx.store.getAll(range, limit),
  ]);
  await tx.done;
  return { rows, lastKey: keys.length > 0 ? keys[keys.length - 1] : undefined };
}

export async function putStoreRows(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, unknown>,
  store: string,
  rows: unknown[],
): Promise<void> {
  if (rows.length === 0) return;
  const db = untyped(handle, store);
  const tx = db.transaction(store, 'readwrite');
  await Promise.all(rows.map((row) => tx.store.put(row)));
  await tx.done;
  searchIndex.clear();
}

export async function clearAllStores(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, unknown>,
): Promise<void> {
  const db = handle() as unknown as IDBPDatabase;
  const names = Array.from(db.objectStoreNames);
  const tx = db.transaction(names, 'readwrite');
  await Promise.all(names.map((name) => tx.objectStore(name).clear()));
  await tx.done;
  searchIndex.clear();
}
