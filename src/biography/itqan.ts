import { foldName } from '../retrieval/narrator';
import {
  emptyProfile,
  type NarratorProfile,
  type ScholarStatement,
  type StoredNarratorProfile,
} from './narratorProfile';

// Reading an Itqan rijāl shard into narrator profiles.
//
// ---------------------------------------------------------------------------
// Installed, never bundled
//
// The Itqan repository carries no LICENSE file, and its README's licence
// section covers the code, the ḥadīth texts and two classical lexicons — but
// says nothing about the narrator database. It also aggregates third-party
// datasets whose own terms the author does not hold. So this is the same
// arrangement as the licensed QUL resources: the app ships the knowledge of
// what to install and how to read it, the reader installs the file themselves,
// and nothing is redistributed through this repository.
//
// Absent, the card still works — Taqrīb supplies the verdict and the ṭabaqa
// from a book the reader already imported. Itqan is enrichment, not a
// prerequisite, and the code is written so that its absence is silence rather
// than an error.
//
// ---------------------------------------------------------------------------
// The shape, as measured against the real files
//
// A shard is one object keyed by numeric profile id. The manifest gives:
//
//   profiles_companion.json   10,880
//   profiles_reliable.json    26,467
//
// Each profile carries the card's fields nearly one for one, plus `namings` —
// the forms a narrator is actually cited under, which is what makes matching a
// short form in a commentary against a full nasab work — and `classical_sources`,
// a per-work grading that becomes أقوال العلماء directly.
//
// "-" is the file's placeholder for a field it does not have. Treated as
// absent, not printed: a card row reading "-" claims the source addressed the
// question and had nothing, which is not what it means.
// ---------------------------------------------------------------------------

/** The 19 works `classical_sources` keys refer to, as they should be printed. */
const WORK_NAMES: Record<string, string> = {
  taqrib: 'تقريب التهذيب',
  tahdhib_tahdhib: 'تهذيب التهذيب',
  tahdhib_kamal: 'تهذيب الكمال',
  kashif: 'الكاشف',
  mizan: 'ميزان الاعتدال',
  lisan_mizan: 'لسان الميزان',
  jarh: 'الجرح والتعديل',
  thiqat: 'الثقات لابن حبان',
  isaba: 'الإصابة',
  siyar: 'سير أعلام النبلاء',
  tabaqat: 'الطبقات الكبرى',
  tarikh: 'التاريخ الكبير',
  tarikh_islam: 'تاريخ الإسلام',
  kamil: 'الكامل في الضعفاء',
  diwan_ducafa: 'ديوان الضعفاء',
  mughni_ducafa: 'المغني في الضعفاء',
  macrifa_qurra: 'معرفة القراء',
  mucin_tabaqat: 'المعين في طبقات المحدثين',
  tadhkirat_huffaz: 'تذكرة الحفاظ',
};

/** What the file writes when it has no value. */
function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== '-';
}

interface RawSource {
  entry_id?: number;
  grade_ar?: string;
  grade_en?: string;
}

interface RawProfile {
  id?: number;
  full_name?: string;
  kunya?: string;
  laqab?: string;
  nasab?: string;
  tabaqat?: string;
  city?: string;
  birth?: string;
  death?: string;
  birth_place?: string;
  death_place?: string;
  grade_ar?: string;
  dhahabi?: string;
  namings?: string[];
  classical_sources?: Record<string, RawSource>;
}

/** One profile, converted. Null when it carries no usable name. */
export function convertItqanProfile(raw: RawProfile): NarratorProfile | null {
  if (!present(raw.full_name)) return null;

  const name = raw.full_name.trim();
  const profile = emptyProfile(foldName(name), name);
  const from = (value: string) => ({ value: value.trim(), source: 'itqan' as const });

  if (present(raw.kunya)) profile.kunya = from(raw.kunya);
  if (present(raw.nasab)) profile.lineage = from(raw.nasab);
  if (present(raw.laqab)) profile.knownAs = from(raw.laqab);
  if (present(raw.tabaqat)) profile.generation = from(raw.tabaqat);
  if (present(raw.city)) profile.residence = from(raw.city);
  if (present(raw.birth)) profile.birth = from(raw.birth);
  if (present(raw.death)) profile.death = from(raw.death);
  if (present(raw.birth_place)) profile.placeOfBirth = from(raw.birth_place);
  if (present(raw.death_place)) profile.placeOfDeath = from(raw.death_place);

  // Ibn Ḥajar's own verdict comes from the Taqrīb cross-reference rather than
  // from the shard's top-level grade: the top-level grade is Itqan's own
  // consolidation across 22 works, and printing that under «حكم ابن حجر» would
  // attribute an aggregate to a man who did not make it.
  const taqrib = raw.classical_sources?.taqrib;
  if (taqrib && present(taqrib.grade_ar)) profile.ibnHajar = from(taqrib.grade_ar);

  const statements: ScholarStatement[] = [];
  for (const [key, entry] of Object.entries(raw.classical_sources ?? {})) {
    if (!entry || !present(entry.grade_ar)) continue;
    statements.push({
      // An unknown key prints as itself rather than being dropped: a new work
      // added upstream should appear unlabelled, not vanish.
      work: WORK_NAMES[key] ?? key,
      verdict: entry.grade_ar.trim(),
      source: 'itqan',
    });
  }
  if (present(raw.dhahabi)) {
    statements.push({ work: 'الذهبي', verdict: raw.dhahabi.trim(), source: 'itqan' });
  }
  profile.statements = statements;

  // Every form this man is cited under, folded. This is what lets a two-word
  // mention in a commentary reach a profile filed under a twelve-word nasab.
  const namings = new Set<string>([foldName(name)]);
  for (const naming of raw.namings ?? []) {
    if (present(naming)) namings.add(foldName(naming));
  }
  profile.namings = [...namings].filter((value) => value.length >= 3);

  return profile;
}

export interface ShardReport {
  /** Profiles that converted. */
  profiles: StoredNarratorProfile[];
  /** Rows that carried no usable name. */
  skipped: number;
}

/**
 * Parse a whole shard.
 *
 * Takes already-parsed JSON rather than text: the caller reads the file, and
 * a 33 MB shard should be parsed once by the platform rather than twice by us.
 */
export function readItqanShard(payload: unknown, shard: string): ShardReport {
  if (payload === null || typeof payload !== 'object') {
    throw new Error('This file is not an Itqan rijāl shard — expected a JSON object of profiles.');
  }

  const profiles: StoredNarratorProfile[] = [];
  let skipped = 0;

  // Keyed by the file's own profile id, so re-importing a shard overwrites
  // its rows in place instead of doubling them.
  for (const [id, raw] of Object.entries(payload as Record<string, RawProfile>)) {
    const converted = raw && typeof raw === 'object' ? convertItqanProfile(raw) : null;
    if (converted) profiles.push({ ...converted, id: `itqan:${id}`, shard });
    else skipped += 1;
  }

  if (profiles.length === 0) {
    throw new Error(
      'No narrator profiles could be read from this file. Expected one of the ' +
        'profiles_*.json shards from Itqan’s app/data/rijal/ directory.',
    );
  }

  return { profiles, skipped };
}

/** Whether a filename looks like one of the shards. */
export function isItqanShard(fileName: string): boolean {
  return /^profiles_[a-z_]+\.json$/i.test(fileName);
}
