// Biographical entries and narrator profiles.
// Re-exported by index.ts: outside types/, import them from `types`.

/**
 * One person's entry in a biographical work, located from that work's own
 * table of contents.
 *
 * Retrieval only. Nothing here is generated, summarised or ranked by a model:
 * the name is what the work prints, the aliases are string decompositions of
 * it, and the body shown to the reader is the blocks at `pageIndex`, verbatim.
 */
export interface BiographyEntry {
  id: string;
  bookId: string;
  /** As printed in the contents, harakāt and all. Displayed. */
  name: string;
  /** Folded whole name. Search only, never displayed. */
  nameNormalized: string;
  /**
   * Derived forms this entry is findable under, most specific first, each
   * tagged with how specific it is so results can be ranked without a model.
   * See biography/names.ts.
   */
  aliases: { value: string; kind: string }[];
  pageIndex: number;
  /**
   * Page the FOLLOWING entry begins on — the bound on how far this one runs.
   *
   * Usd al-Ghāba puts 2.5 entries on an average page, so a page is neither the
   * start nor the end of an entry: the page ʿUmar b. al-Khaṭṭāb starts on opens
   * with the tail of one biography and the whole of another, and his own text
   * continues onto the next page. Without this bound the sheet either shows
   * somebody else's life or stops mid-sentence.
   */
  endPageIndex: number;
  /**
   * The work's own entry number, when it prints one — "٣٨٣٠".
   *
   * Used to find the entry's heading in the body, which is the only reliable
   * way to know where on a shared page it actually begins.
   */
  entryNumber: string | null;
  /** Resolved lazily when the sheet opens; the TOC gives a page, not blocks. */
  blockIds: string[];
  volume: number;
  printPage: number;
}

// Narrator profiles. Why every field is nullable and carries its source is
// explained at the top of biography/narratorProfile.ts.

export type FieldSource = 'taqrib' | 'itqan';

export interface SourcedValue {
  value: string;
  source: FieldSource;
}

/** One scholar's statement about a narrator. */
export interface ScholarStatement {
  /** Which work it is drawn from — «تقريب التهذيب», «الكاشف», … */
  work: string;
  /** The verdict as that work words it. Never paraphrased. */
  verdict: string;
  source: FieldSource;
}

/**
 * The card's fields, in the order the reference layout prints them.
 *
 * Keyed rather than positional so a source can contribute any subset, and the
 * renderer can walk a label table without knowing which source filled what.
 */
export interface NarratorProfile {
  /** Folded, for lookup. */
  key: string;
  /** As printed, for display. */
  fullName: string;

  kunya: SourcedValue | null;
  /** The nasab paragraph — the lineage as the source writes it. */
  lineage: SourcedValue | null;
  /** Laqab or the nisba a man is generally known by. */
  knownAs: SourcedValue | null;
  /** الطبقة — which generation. */
  generation: SourcedValue | null;
  residence: SourcedValue | null;
  birth: SourcedValue | null;
  death: SourcedValue | null;
  placeOfBirth: SourcedValue | null;
  placeOfDeath: SourcedValue | null;
  /** حكم ابن حجر — his own grading, from Taqrīb. */
  ibnHajar: SourcedValue | null;

  /** أقوال العلماء — every scholar's statement, unmerged. */
  statements: ScholarStatement[];
  /** المصادر — the entry text each source contributed, verbatim. */
  sources: { work: string; text: string; source: FieldSource }[];
  /** Name forms this narrator is cited under, for matching. */
  namings: string[];
}

/**
 * A profile as stored.
 *
 * `namings` is indexed multiEntry, which is why lookup does not load the store:
 * 37,000 profiles with their statements is far too much to hold in memory for
 * a tap, unlike the TOC-derived index, which is a few thousand short rows.
 */
export interface StoredNarratorProfile extends NarratorProfile {
  /** Unique. `itqan:<profile id>` for an imported shard. */
  id: string;
  /** The file it came from, so removing a shard removes exactly its rows. */
  shard: string;
}
