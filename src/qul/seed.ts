import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { QulEntry, QulResource } from '../types';
import { inspectQulBytes } from './importResource';
import { recordRetrieval } from '../app/retrievalLog';

// QUL resources that install themselves on first boot, when present.
//
// ---------------------------------------------------------------------------
// Pointers, not content
//
// This file is a manifest: it says what to install and where it goes. The
// resources themselves are NOT in the repository — public/qul/ is gitignored,
// for the same reason the Amendment 14 catalog ships book IDs rather than
// books. Redistributing a licensed third-party resource through a public repo
// is not a permission this project holds, and QUL's licences differ per
// resource rather than being one blanket grant.
//
// So a build from a clean checkout ships none of these, and that is a supported
// state, not a degraded one: the resource is absent, its tab does not render,
// and docs/RESOURCES.md says where to get it. Put the files in public/qul/ on
// your own machine and everything below installs them.
//
// ---------------------------------------------------------------------------
// Why these are fetched rather than precached
//
// The obvious design is to let the service worker precache public/qul/ and be
// done. That is wrong here: seeding copies every entry into IndexedDB, so a
// precached copy is a second copy of the same 3.5 MB that nothing ever reads
// again. They are excluded from the precache in vite.config.ts and fetched once,
// on the first boot that has a network. After that the resources live in
// IndexedDB and the files are never needed again — which is also why deleting
// a seeded resource in Settings sticks rather than reappearing next launch.
//
// The cost of that choice is that a brand-new install with no network has no
// tafsīr. It gets one on the first online launch, in the background, without
// blocking the reader.
// ---------------------------------------------------------------------------

/** One bundled resource. */
export interface SeedEntry {
  /** Stable identity. The resource id is derived from it, so re-seeding
   *  overwrites in place instead of accumulating copies. */
  slug: string;
  /** Under public/qul/. */
  file: string;
  /** Bump to reinstall this resource on the next boot. */
  version: number;
  /** Shown in Settings before anything is fetched. */
  approxBytes: number;
  /**
   * Whether this file is committed to the repository and therefore expected in
   * every build.
   *
   * This is the distinction that makes a missing file loud. Both states are
   * legitimate and they fail identically at the network layer — a 404 — so
   * without saying which was intended, a resource that was supposed to ship and
   * silently did not looks exactly like one that was deliberately left out. The
   * first is a deployment bug; the second is the licence being respected.
   *
   *   true   committed; a 404 is a BUG and is reported loudly
   *   false  not redistributable; a 404 is the expected state and is quiet
   */
  bundled: boolean;
  /** Why `bundled` is what it is. Shown in Settings for the ones that are not. */
  licence: string;
}

/**
 * What ships.
 *
 * al-Muyassar only, for tafsīr. It is concise — 2.3 MB against Ibn Kathīr's
 * several hundred — and the point of a bundled tafsīr is that a verse sheet is
 * never empty on a fresh install, not that the whole shelf is present. Larger
 * tafāsīr stay optional imports.
 *
 * topics.db is deliberately absent: it is SQLite, and reading it needs sql.js
 * and its ~1.2 MB wasm runtime. Making every cold install pay that to seed
 * 0.4 MB of topics is the wrong trade. It remains a manual import, and the
 * Topics tab simply does not appear until it is added.
 */
export const SEED_MANIFEST: SeedEntry[] = [
  {
    slug: 'matching-ayah',
    file: 'matching-ayah.json',
    version: 1,
    approxBytes: 378_000,
    bundled: true,
    // Not a text. Every value is a computed similarity measurement — an ayah
    // key, a word count, a coverage percentage, word offsets — produced by
    // QUL's own matching pass over the muṣḥaf. There is no third party's
    // writing in the file to redistribute.
    licence: 'Computed matching data, no third-party text. Committed.',
  },
  {
    slug: 'muyassar',
    file: 'ar-tafsir-muyassar.json',
    version: 1,
    approxBytes: 2_370_000,
    bundled: false,
    // at-Tafsīr al-Muyassar is a King Fahd Complex production of the 2000s,
    // not a classical text out of copyright. Whether it may be redistributed
    // is a question about that specific resource's terms, and the export
    // carries no licence metadata to answer it from.
    licence:
      'at-Tafsīr al-Muyassar, King Fahd Complex, modern. Redistribution terms ' +
      'not established — install it yourself from QUL.',
  },
  {
    slug: 'surah-info-en',
    file: 'surah-info-en.json',
    version: 1,
    approxBytes: 954_000,
    bundled: false,
    // The English sūrah introductions in this export are Mawdūdī's, from the
    // Tafhīm al-Qurʾān prefaces — the "Name / Period of Revelation / Theme and
    // Subject Matter" structure is his. He died in 1979, so this is in
    // copyright in every jurisdiction that matters, however widely it is
    // reproduced online.
    licence:
      'Mawdūdī, Tafhīm al-Qurʾān sūrah introductions — in copyright. ' +
      'Install it yourself from QUL.',
  },
];

/** The subset that must be present in a correctly built deployment. */
export const BUNDLED_SEEDS = SEED_MANIFEST.filter((entry) => entry.bundled);

/** Total the bundled set will occupy, for Settings to state up front. */
export const SEED_APPROX_BYTES = SEED_MANIFEST.reduce(
  (total, entry) => total + entry.approxBytes,
  0,
);

/** Deterministic, so re-seeding replaces rather than duplicates. */
function seedIdFor(slug: string): string {
  return `qul-seed-${slug}`;
}

export interface SeedProgress {
  /** 1-based position in the run. */
  index: number;
  total: number;
  slug: string;
  phase: 'fetching' | 'reading' | 'writing' | 'done';
}

export interface SeedOutcome {
  installed: string[];
  /** Already present at the current version. */
  upToDate: string[];
  /**
   * Slugs deliberately not shipped, whose file 404s as expected.
   *
   * Distinct from `failed` on purpose. The licensed resources are gitignored,
   * so every build legitimately ships without them, and that is not an error to
   * report to the reader: the resource is simply not installed and its tab does
   * not appear.
   */
  absent: string[];
  /**
   * Slugs that ARE committed and still 404ed — a deployment fault.
   *
   * This is the case that used to be indistinguishable from `absent`, and it
   * cost a debugging session: a resource can vanish from a build for reasons
   * that have nothing to do with the network — a .gitignore pattern matching
   * more than it meant to, a file never added, a `globIgnores` line — and the
   * app then renders an empty tab as though that were the intended state.
   * Nothing here is quiet.
   */
  missing: string[];
  /** slug → why it could not be installed. */
  failed: Record<string, string>;
}

/**
 * Which bundled resources are missing or out of date.
 *
 * `removed` are slugs the user deleted in Settings. They are skipped no matter
 * how far behind their version is: reinstalling something on the next launch
 * because it was removed is indistinguishable from a bug, and there is no way
 * for the user to work around it. Settings offers an explicit way back.
 */
export function pendingSeeds(
  existing: QulResource[],
  removed: readonly string[] = [],
): SeedEntry[] {
  const byslug = new Map(
    existing.filter((resource) => resource.seed).map((resource) => [resource.seed!.slug, resource]),
  );
  const tombstoned = new Set(removed);
  return SEED_MANIFEST.filter(
    (entry) =>
      !tombstoned.has(entry.slug) &&
      (byslug.get(entry.slug)?.seed?.version ?? -1) < entry.version,
  );
}

/**
 * Install any bundled resource that is missing or out of date.
 *
 * Idempotent by construction, which the amendment asks for explicitly:
 *
 *   * the resource id is derived from the slug, so a second run overwrites the
 *     same rows rather than adding a parallel set;
 *   * the old rows are cleared before the new ones are written;
 *   * the resource row is written LAST, and every lookup starts from it — so a
 *     reload part-way through leaves entries that nothing reads, and the next
 *     boot sees the resource as still missing and redoes it cleanly.
 *
 * One failure does not stop the others; a resource that could not be fetched is
 * reported and retried on the next launch.
 */
export async function seedQulResources(
  storage: StorageAdapter,
  baseUrl: string,
  removed: readonly string[] = [],
  onProgress?: (progress: SeedProgress) => void,
): Promise<SeedOutcome> {
  const existing = await storage.listQulResources();
  const pending = pendingSeeds(existing, removed);

  const outcome: SeedOutcome = {
    installed: [],
    upToDate: SEED_MANIFEST.filter((entry) => !pending.includes(entry)).map((e) => e.slug),
    absent: [],
    missing: [],
    failed: {},
  };
  if (pending.length === 0) return outcome;

  for (const [position, entry] of pending.entries()) {
    const report = (phase: SeedProgress['phase']) =>
      onProgress?.({ index: position + 1, total: pending.length, slug: entry.slug, phase });

    try {
      report('fetching');
      const response = await fetch(`${baseUrl}qul/${entry.file}`);

      if (response.status === 404) {
        if (entry.bundled) {
          // Committed, and not there. Say so on the console as well as in the
          // outcome: whoever is looking at a blank tab on a tablet has the
          // console available and the Settings panel two taps away, and this
          // is the one line that names the cause rather than the symptom.
          console.error(
            `[seed] ${entry.file} is committed to the repository but returned 404 ` +
              `from ${baseUrl}qul/. It did not reach this build — check .gitignore ` +
              `and that the file was committed.`,
          );
          outcome.missing.push(entry.slug);
        } else {
          // Deliberately not shipped: the licence is not ours to grant. Normal.
          outcome.absent.push(entry.slug);
        }
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${entry.file}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());

      report('reading');
      const inspection = await inspectQulBytes(bytes, entry.file);

      report('writing');
      const id = seedIdFor(entry.slug);

      // Clear first. A previous interrupted attempt may have left entries with
      // no resource row, and a version bump must not merge old keys with new.
      await storage.deleteQulResource(id);

      const rows: QulEntry[] = inspection.entries.map((item) => ({
        id: `${id}|${item.key}`,
        resourceId: id,
        key: item.key,
        value: item.value,
      }));
      for (let index = 0; index < rows.length; index += 1000) {
        await storage.putQulEntries(rows.slice(index, index + 1000));
      }

      // Last, deliberately. See the note above.
      await storage.putQulResource({
        id,
        kind: inspection.kind,
        name: inspection.name,
        fileName: inspection.fileName,
        byteSize: inspection.byteSize,
        entryCount: rows.length,
        format: inspection.format,
        importedAt: Date.now(),
        seed: { slug: entry.slug, version: entry.version },
      });

      report('done');
      outcome.installed.push(entry.slug);
    } catch (caught) {
      outcome.failed[entry.slug] =
        caught instanceof Error ? caught.message : String(caught);
    }
  }

  recordRetrieval({
    kind: 'seed',
    outcome:
      outcome.missing.length > 0 || Object.keys(outcome.failed).length > 0
        ? 'lookup-failed'
        : outcome.absent.length > 0
          ? 'data-absent'
          : 'hit',
    query: `${pending.length} pending of ${SEED_MANIFEST.length} bundled resources`,
    summary:
      outcome.missing.length > 0
        ? `${outcome.missing.length} committed resource(s) did not reach this build.`
        : `${outcome.installed.length} installed, ${outcome.absent.length} not shipped.`,
    detail: [
      ['base', baseUrl],
      ['installed', outcome.installed.join(', ') || 'none'],
      ['missing (a bug)', outcome.missing.join(', ') || 'none'],
      ['not shipped (by licence)', outcome.absent.join(', ') || 'none'],
      [
        'failed',
        Object.entries(outcome.failed)
          .map(([slug, why]) => `${slug}: ${why}`)
          .join(' | ') || 'none',
      ],
    ],
  });

  return outcome;
}
