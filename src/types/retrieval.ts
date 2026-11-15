// Retrieved Qurʾān verses and ḥadīth records.
// Re-exported by index.ts: import them from `types`, not from this file.

/** Cached Qurʾān verse, keyed by "surah:ayah". */
export interface QuranVerse {
  reference: string; // "2:255"
  arabic: string;
  english: string;
  translationName: string;
  fetchedAt: number;
}

/** Cached hadith, keyed by a normalized "collection:number" reference. */
export interface HadithRecord {
  reference: string; // "riyadussalihin:1"
  collection: string;
  number: string;
  arabic: string;
  english: string;
  grade: string | null;
  sourceUrl: string | null;
  fetchedAt: number;
  /** Which HadithSource produced this record. */
  sourceId?: HadithSourceId;
  /**
   * Every grading of THIS narration, in Arabic, as dorar states them.
   *
   * A list, never one. dorar is a full-text search, so a query returns every
   * narration carrying that wording; the records kept here are the ones whose
   * narrator matches the book's, and within those, several scholars grading the
   * same narration differently is normal. That disagreement is information the
   * user needs when preparing a lesson — merging it, averaging it, or picking a
   * representative would resolve a scholarly dispute on his behalf.
   *
   * Empty means no record matched the narrator. That is shown as "no grading
   * found", because an unmatched grading is worse than an absent one.
   */
  gradings?: HadithAttribution[];
  /** The narrator read out of the book, which the gradings were matched on. */
  narrator?: string | null;
}

export type HadithSourceId = 'sunnah' | 'dorar';

export interface HadithAttribution {
  /** الراوي — the companion who narrated it. */
  rawi: string | null;
  /** المحدث — the scholar whose grading this is. */
  mohdith: string | null;
  /** المصدر — the book the grading was printed in. */
  book: string | null;
  /** الصفحة أو الرقم */
  numberOrPage: string | null;
  /** خلاصة حكم المحدث — the grade itself. */
  grade: string | null;
  /** التخريج — where else it is reported. */
  takhrij: string | null;
}
