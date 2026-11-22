// Qurʾān Universal Library resources.
// Re-exported by index.ts: outside types/, import them from `types`.

import type { ProviderId, TranslationUsage } from './translation';

// ------------------------------------------------------------------ QUL
//
// Resources downloaded from the Qurʾān Universal Library and imported from a
// file. Every one of them is keyed by sūrah or by sūrah:āyah, which is why they
// resolve through an entity's already-known reference with no search and no
// inference — and why every lookup below is offline and deterministic.

export type QulResourceKind =
  | 'tafsir'
  | 'ayah-matching'
  | 'topics'
  | 'surah-info'
  // Not from QUL and not Qurʾānic: the English of one ḥadīth collection from the
  // hadith-json dataset, kept in this store because it is exactly the shape the
  // store is for (a resource, its rows, one range delete) and because a new store
  // would need a schema bump on every tablet for data that is only ever read by
  // key. Its rows are keyed "collection:number", not by āyah, and the Qurʾān
  // screens never ask for this kind. See retrieval/hadithJson.ts.
  | 'hadith-json';

export interface QulResource {
  id: string;
  kind: QulResourceKind;
  /** Taken from the file's own contents where it says, else from its name. */
  name: string;
  fileName: string;
  /** Bytes of the imported file, so the list can say what deleting reclaims. */
  byteSize: number;
  entryCount: number;
  /** What was actually read. SQLite is normalized away at import; see qul/sqlite.ts. */
  format: 'json' | 'sqlite';
  importedAt: number;
  /**
   * Present when this resource was installed from the bundled set rather than
   * chosen by the user, and which version of it. Absent for a manual import,
   * which is what keeps the two apart in Settings and stops a seed from
   * silently replacing a resource someone imported deliberately.
   */
  seed?: { slug: string; version: number };
  /** `hadith-json` only: the collection slug its rows are keyed under. */
  collection?: string;
}

/**
 * One row of an imported resource.
 *
 * A single store holds all four kinds, discriminated by `value.t`. They share a
 * shape — key in, record out — so one store and one index serve every lookup,
 * and deleting a resource is one range delete rather than four.
 */
export interface QulEntry {
  /** `${resourceId}|${key}` */
  id: string;
  resourceId: string;
  /**
   * The lookup key. What it means depends on the resource kind:
   *   tafsir         "2:255"        — every āyah, group members included
   *   ayah-matching  "2:255"
   *   topics         "ayah:2:255" and "topic:1837"
   *   surah-info     "2"
   */
  key: string;
  value: QulEntryValue;
}

export type QulEntryValue =
  | TafsirPassage
  | TafsirPointer
  | AyahMatches
  | TopicRecord
  | TopicsForAyah
  | SurahInfo
  | HadithJsonEntry
  | HadithIndexPart;

/**
 * A passage of commentary, with every āyah it covers.
 *
 * Tafsīr routinely treats several āyāt as one unit — al-Muyassar does it 625
 * times — and the passage is written to be read whole. `ayahKeys` carries the
 * group so the sheet can say "this covers 4:66–68" rather than silently
 * returning a passage that talks about more than the āyah that was tapped.
 */
export interface TafsirPassage {
  t: 'passage';
  text: string;
  ayahKeys: string[];
}

/**
 * A group member pointing at the passage that covers it.
 *
 * QUL's own JSON does exactly this — the leader carries the text, the other
 * members carry the leader's key as a bare string — and keeping it rather than
 * duplicating the text saves about a third of the file.
 */
export interface TafsirPointer {
  t: 'pointer';
  to: string;
}

export interface AyahMatch {
  ayahKey: string;
  matchedWords: number;
  coverage: number;
  score: number;
}

export interface AyahMatches {
  t: 'matches';
  matches: AyahMatch[];
}

export interface TopicRecord {
  t: 'topic';
  topicId: number;
  name: string;
  arabicName: string;
  description: string;
  ayahKeys: string[];
}

/** The reverse index, built at import so a lookup never scans 2,500 topics. */
export interface TopicsForAyah {
  t: 'topics-for-ayah';
  topicIds: number[];
}

export interface SurahInfo {
  t: 'surah';
  surahNumber: number;
  surahName: string;
  text: string;
  shortText: string;
}

/**
 * One ḥadīth of the hadith-json dataset (scraped from sunnah.com).
 *
 * `arabic` is stored for one purpose only: confirming, at lookup time, that the
 * ḥadīth numbered N in the dataset is the one the book prints under that number.
 * It is never displayed — the reader sees the book's own matn.
 */
export interface HadithJsonEntry {
  t: 'hadith-json';
  /** The continuous number within the collection (1 … 1896 for Riyāḍ). */
  number: number;
  /** The dataset's own `idInBook`, kept to show where it and `number` part ways. */
  idInBook: number;
  chapterId: number;
  chapterEnglish: string;
  narrator: string;
  text: string;
  arabic: string;
}

/**
 * One sixteenth of a hadith-json collection's text index
 * (retrieval/hadithText.ts), stored beside its ḥadīth under the same resource
 * with the key `idx:<collection>:<part>`, so the purge by resource that removes
 * a collection removes its index too.
 *
 * Derived data: rebuilt from the ḥadīth rows whenever a part is missing or `v`
 * is not the current INDEX_VERSION. The arrays are base64 of little-endian
 * uint32s, not typed arrays, because the whole-tablet transfer writes every
 * row through JSON.stringify, which turns a Uint32Array into an object of
 * numbered keys. Part p holds the windows whose hash has p as its top four
 * bits; the sorted arrays split into sixteen contiguous runs that way, so each
 * row stays well under a megabyte.
 */
export interface HadithIndexPart {
  t: 'hadith-index';
  v: number;
  collection: string;
  part: number;
  keys: string;
  values: string;
  /** Part 0 only: ḥadīth the build was given, windows kept, and how long the build took. */
  entries?: number;
  positions?: number;
  builtMs?: number;
}

/**
 * A compiled narrative over one āyah's retrieved material.
 *
 * This is the one generated thing in the QUL feature, so it is kept in its own
 * store, badged as generated wherever it is shown, and never allowed to stand
 * in for a source tab. Cached by āyah and by the exact set of resources that
 * fed it: install another tafsīr and the compilation is regenerated rather than
 * silently describing itself as covering material it never saw.
 */
export interface QulCompilation {
  cacheKey: string;
  ayahKey: string;
  resourceIds: string[];
  providerId: ProviderId;
  model: string;
  text: string;
  createdAt: number;
  usage?: TranslationUsage;
  costUsd?: number | null;
}
