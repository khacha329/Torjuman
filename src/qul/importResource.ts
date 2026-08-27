import { newId } from '../lib/id';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { QulEntry, QulResource } from '../types';
import { QulFormatError, readQulJson, readQulSqlite, type QulReading } from './read';
import { looksLikeSqlite, readSqliteTables } from './sqlite';

// One import flow, two file formats.
//
// Split into inspect and commit on purpose. The amendment asks that the user be
// shown what was detected before anything is written, and that is not only a
// courtesy: these files are downloaded by hand from a site that offers a dozen
// of them, and "I imported the wrong one" is the likely mistake. Showing the
// kind, the counts and a real excerpt before committing turns that into a
// cancelled dialog instead of a resource to hunt down and delete.

export interface QulInspection extends QulReading {
  fileName: string;
  byteSize: number;
}

/** Read and identify a file without writing anything. */
export async function inspectQulFile(file: File): Promise<QulInspection> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (looksLikeSqlite(bytes)) {
    const tables = await readSqliteTables(bytes);
    return { ...readQulSqlite(tables, file.name), fileName: file.name, byteSize: file.size };
  }

  let root: unknown;
  try {
    root = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new QulFormatError(
      'That file is neither SQLite nor JSON. QUL resources download as one or the other; ' +
        'if it arrived as a .zip, extract it first.',
    );
  }

  return { ...readQulJson(root, file.name), fileName: file.name, byteSize: file.size };
}

/**
 * Write an inspected resource.
 *
 * Entries go in before the resource row, and the resource row is what every
 * lookup starts from — so an interrupted import leaves rows nothing reads
 * rather than a resource that half-answers. If the entry write fails, the
 * partial rows are removed on the way out.
 */
export async function commitQulImport(
  storage: StorageAdapter,
  inspection: QulInspection,
): Promise<QulResource> {
  const id = newId('qul');

  const entries: QulEntry[] = inspection.entries.map((entry) => ({
    id: `${id}|${entry.key}`,
    resourceId: id,
    key: entry.key,
    value: entry.value,
  }));

  try {
    // In chunks: a single transaction over 6,000-odd records is fine on a
    // desktop and is where a tablet with a cold IndexedDB starts to stall.
    for (let index = 0; index < entries.length; index += 1000) {
      await storage.putQulEntries(entries.slice(index, index + 1000));
    }
  } catch (error) {
    await storage.deleteQulResource(id);
    throw error;
  }

  const resource: QulResource = {
    id,
    kind: inspection.kind,
    name: inspection.name,
    fileName: inspection.fileName,
    byteSize: inspection.byteSize,
    entryCount: entries.length,
    format: inspection.format,
    importedAt: Date.now(),
  };

  await storage.putQulResource(resource);
  return resource;
}

export { QulFormatError };
