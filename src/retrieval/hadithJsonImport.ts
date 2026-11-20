import { newId } from '../lib/id';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { QulResource } from '../types';
import { HadithJsonFormatError, readHadithJson, type HadithJsonReading } from './hadithJson';

// Importing a hadith-json file: inspect, then commit.
//
// Split in two for the reason the QUL import is (qul/importResource.ts): these
// files are downloaded by hand from a repository that holds dozens of them, and
// "I picked the wrong one" is the likely mistake. Showing the collection, the
// count and a real excerpt before anything is written turns it into a cancelled
// dialog instead of a resource to hunt down and delete.

export interface HadithJsonInspection extends HadithJsonReading {
  fileName: string;
  byteSize: number;
}

export async function inspectHadithJsonFile(file: File): Promise<HadithJsonInspection> {
  let root: unknown;
  try {
    root = JSON.parse(await file.text());
  } catch {
    throw new HadithJsonFormatError(
      'That file is not JSON. hadith-json files are .json; if it arrived zipped, extract it first.',
    );
  }
  return { ...readHadithJson(root, file.name), fileName: file.name, byteSize: file.size };
}

/**
 * Write an inspected collection, replacing an earlier import of the same one.
 *
 * Rows go in before the resource row (which is what every lookup starts from),
 * so an interrupted import leaves rows nothing reads rather than a collection
 * that half-answers; on a failed write the partial rows are removed. The old
 * copy is deleted only after the new one is complete.
 */
export async function commitHadithJsonImport(
  storage: StorageAdapter,
  inspection: HadithJsonInspection,
): Promise<QulResource> {
  const id = newId('qul');

  try {
    // In chunks, as the QUL import does: one transaction over ~1,900 rows of
    // text is where a tablet with a cold IndexedDB starts to stall.
    for (let index = 0; index < inspection.entries.length; index += 500) {
      await storage.putQulEntries(
        inspection.entries.slice(index, index + 500).map((entry) => ({
          id: `${id}|${entry.key}`,
          resourceId: id,
          key: entry.key,
          value: entry.value,
        })),
      );
    }
  } catch (error) {
    await storage.deleteQulResource(id);
    throw error;
  }

  const resource: QulResource = {
    id,
    kind: 'hadith-json',
    name: inspection.name,
    fileName: inspection.fileName,
    byteSize: inspection.byteSize,
    entryCount: inspection.entries.length,
    format: 'json',
    importedAt: Date.now(),
    collection: inspection.collection.slug,
  };
  await storage.putQulResource(resource);

  for (const old of await storage.listQulResources()) {
    if (old.kind === 'hadith-json' && old.collection === resource.collection && old.id !== id) {
      await storage.deleteQulResource(old.id);
    }
  }
  return resource;
}

export async function listHadithJsonResources(storage: StorageAdapter): Promise<QulResource[]> {
  return (await storage.listQulResources()).filter((resource) => resource.kind === 'hadith-json');
}
