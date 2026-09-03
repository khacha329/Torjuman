import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Book } from '../types';
import { foldName } from '../retrieval/narrator';
import { recordRetrieval } from '../app/retrievalLog';
import {
  mergeProfiles,
  hasContent,
  type NarratorProfile,
  type StoredNarratorProfile,
} from './narratorProfile';
import { isTaqrib, parseTaqribEntry, TAQRIB_WORK } from './taqrib';
import { readItqanShard } from './itqan';

// Assembling one narrator's card from whatever sources are installed.
//
// ---------------------------------------------------------------------------
// Two sources, one store, and identity is never assumed
//
// Taqrīb is parsed from a book the reader imported; Itqan is an installed
// dataset. Both land in the same store, keyed by their own ids and indexed
// under every name form they are cited by, so a lookup is one indexed read
// rather than a scan of tens of thousands of profiles.
//
// What this deliberately does NOT do is decide that two profiles are the same
// man. Sharing a name form is not identity — «محمد بن عبد الله» is hundreds of
// people — so profiles are merged only when their full names fold to exactly
// the same string, and everything else is offered to the reader as a separate
// candidate. Silently fusing two men into one card would produce a confident,
// coherent, wrong biography, which is the worst output this feature could have.
// ---------------------------------------------------------------------------

/** Taqrīb's profiles are filed under a shard name derived from its book. */
export function taqribShardFor(bookId: string): string {
  return `taqrib:${bookId}`;
}

/**
 * Parse a Taqrīb import into narrator profiles, once.
 *
 * Taqrīb is the one biographical work whose contents cannot be indexed — 249
 * letter headings for ~8,800 narrators — so where the others are read from
 * their table of contents, this one is read from its body. Measured against the
 * live book: Ibn Ḥajar's verdict on 97% of entries, the ṭabaqa on 87%.
 */
export async function ensureTaqribProfiles(
  storage: StorageAdapter,
  book: Book,
): Promise<{ built: number; skipped: boolean }> {
  if (!isTaqrib(book.title)) return { built: 0, skipped: true };

  const shard = taqribShardFor(book.id);
  const existing = await storage.listNarratorShards();
  if (existing.some((entry) => entry.shard === shard)) return { built: 0, skipped: true };

  const blocks = await storage.listBlocks(book.id);
  const profiles: StoredNarratorProfile[] = [];

  for (const block of blocks) {
    const entry = parseTaqribEntry(block.text);
    if (!entry) continue;
    profiles.push({
      ...entry.profile,
      // The work's own entry number makes this stable across a re-import.
      id: `${shard}:${entry.entryNumber}`,
      shard,
    });
  }

  if (profiles.length > 0) await storage.putNarratorProfiles(profiles);
  return { built: profiles.length, skipped: false };
}

/** Install one Itqan shard, replacing any previous copy of the same file. */
export async function importItqanFile(
  storage: StorageAdapter,
  fileName: string,
  payload: unknown,
): Promise<{ imported: number; skipped: number }> {
  const { profiles, skipped } = readItqanShard(payload, fileName);

  // Replaced rather than merged: a re-import is how a corrected file is
  // installed, and leaving the old rows would keep the old values alive under
  // ids the new file no longer uses.
  await storage.deleteNarratorShard(fileName);
  await storage.putNarratorProfiles(profiles);

  return { imported: profiles.length, skipped };
}

export interface NarratorCandidate {
  profile: NarratorProfile;
  /** Which sources contributed, for the card's footer. */
  sources: string[];
}

/**
 * Every narrator the installed sources know by this name.
 *
 * Returns a list, always. Ambiguity is the normal case and is never resolved
 * here — the sheet shows the candidates and the reader chooses, exactly as the
 * biographical-entry lookup does.
 */
export async function lookupNarrator(
  storage: StorageAdapter,
  name: string,
): Promise<NarratorCandidate[]> {
  const folded = foldName(name);
  const matches = await storage.findNarratorProfiles(folded);

  // Grouped by the folded FULL name, which is the only identity claim the data
  // actually supports. Two profiles agreeing there are the same man described
  // twice; two profiles merely sharing a citation form are not.
  const groups = new Map<string, StoredNarratorProfile[]>();
  for (const profile of matches) {
    const list = groups.get(profile.key);
    if (list) list.push(profile);
    else groups.set(profile.key, [profile]);
  }

  const candidates: NarratorCandidate[] = [];
  for (const group of groups.values()) {
    // Taqrīb first: its verdict is Ibn Ḥajar's own wording read out of his
    // book, where Itqan's is a third party's cross-reference to it. Where both
    // have a field, his own book wins; Itqan fills everything he is silent on.
    const ordered = [...group].sort((a, b) =>
      Number(b.shard.startsWith('taqrib:')) - Number(a.shard.startsWith('taqrib:')),
    );
    // Typed explicitly: merging yields a plain NarratorProfile, and letting the
    // accumulator inherit StoredNarratorProfile from the array would claim the
    // merge still carries one row's id and shard, which it does not.
    const merged = ordered
      .slice(1)
      .reduce<NarratorProfile>((into, next) => mergeProfiles(into, next), ordered[0]);
    if (!hasContent(merged)) continue;

    candidates.push({
      profile: merged,
      sources: [...new Set(ordered.map((p) => (p.shard.startsWith('taqrib:') ? TAQRIB_WORK : 'Itqan')))],
    });
  }

  recordRetrieval({
    kind: 'biography',
    outcome: candidates.length > 0 ? 'hit' : matches.length === 0 ? 'data-absent' : 'no-match',
    query: name,
    summary:
      candidates.length > 0
        ? `${candidates.length} narrator profile(s) from ${
            [...new Set(candidates.flatMap((c) => c.sources))].join(' + ')
          }.`
        : 'No narrator profile under this name. Import Taqrīb at-Tahdhīb, or an Itqan rijāl shard.',
    detail: [
      ['folded', folded],
      ['rows matched', String(matches.length)],
      ['distinct people', String(candidates.length)],
    ],
  });

  return candidates;
}

/**
 * Build the Taqrīb profiles for any imported copy of it, once.
 *
 * Lazy in the same way entity detection and the biographical index are: a
 * book imported before this existed gets its profiles on the next reader open
 * rather than needing a migration. Cheap to re-check — one shard listing.
 */
export async function ensureNarratorSources(
  storage: StorageAdapter,
): Promise<{ available: boolean; built: number }> {
  const books = await storage.listBooks();
  let built = 0;
  for (const book of books) {
    if (!isTaqrib(book.title)) continue;
    built += (await ensureTaqribProfiles(storage, book)).built;
  }
  return { available: await hasNarratorProfiles(storage), built };
}

/** Whether any narrator source is installed at all. */
export async function hasNarratorProfiles(storage: StorageAdapter): Promise<boolean> {
  const shards = await storage.listNarratorShards();
  return shards.length > 0;
}
