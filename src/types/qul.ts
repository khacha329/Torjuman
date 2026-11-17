// Qurʾān Universal Library resources.
// Re-exported by index.ts: outside types/, import them from `types`.

import type { ProviderId, TranslationUsage } from './translation';

// ------------------------------------------------------------------ QUL
//
// Resources downloaded from the Qurʾān Universal Library and imported from a
// file. Every one of them is keyed by sūrah or by sūrah:āyah, which is why they
// resolve through an entity's already-known reference with no search and no
// inference — and why every lookup below is offline and deterministic.

export type QulResourceKind = 'tafsir' | 'ayah-matching' | 'topics' | 'surah-info';

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
  | SurahInfo;

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
