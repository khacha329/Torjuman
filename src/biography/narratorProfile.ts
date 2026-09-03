// A narrator's card: discrete fields, every one of them retrieved.
//
// ---------------------------------------------------------------------------
// Absent is a value
//
// The rule this whole file exists to hold: a field is either read from a source
// or it is not shown. Nothing is inferred, nothing is interpolated from a
// neighbouring narrator, and no model is ever asked to fill a gap. A card that
// says nothing about where a man was born is correct when the sources say
// nothing about it; a card that guesses is a fabrication with a scholarly
// veneer, which is worse than an empty row in exactly the setting this app is
// for.
//
// Hence every field is nullable and the renderer omits nulls rather than
// printing a placeholder.
//
// ---------------------------------------------------------------------------
// Two sources, and provenance travels with the value
//
// Fields arrive from two places with different characters:
//
//   Taqrīb at-Tahdhīb   parsed out of the book's own body text, on the device,
//                       from a book the reader imported. Ibn Ḥajar, d. 1449 —
//                       no licence question exists.
//   Itqan               an imported dataset keyed by narrator, richer but
//                       optional, and not present on every install.
//
// Every value therefore records which source it came from, and the card shows
// it. "ثقة" carries a different weight when it is Ibn Ḥajar's own word in
// Taqrīb than when it is a third party's aggregation of him, and collapsing the
// two into one unattributed string would destroy the distinction a reader needs
// in order to cite anything.
// ---------------------------------------------------------------------------

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

/** The Arabic labels, in the reference layout's order. */
export const FIELD_LABELS: [keyof NarratorProfile, string, string][] = [
  ['kunya', 'الكنية', 'Kunya'],
  ['lineage', 'النسب', 'Lineage'],
  ['knownAs', 'الشهرة', 'Known as'],
  ['generation', 'الطبقة', 'Generation'],
  ['residence', 'الإقامة', 'Residence'],
  ['birth', 'الميلاد', 'Birth'],
  ['death', 'الوفاة', 'Death'],
  ['placeOfBirth', 'مكان الميلاد', 'Place of birth'],
  ['placeOfDeath', 'مكان الوفاة', 'Place of death'],
  ['ibnHajar', 'حكم ابن حجر', "Ibn Ḥajar's verdict"],
];

export function emptyProfile(key: string, fullName: string): NarratorProfile {
  return {
    key,
    fullName,
    kunya: null,
    lineage: null,
    knownAs: null,
    generation: null,
    residence: null,
    birth: null,
    death: null,
    placeOfBirth: null,
    placeOfDeath: null,
    ibnHajar: null,
    statements: [],
    sources: [],
    namings: [],
  };
}

/**
 * Combine what two sources know about one narrator.
 *
 * `primary` wins any field both supply. Nothing is averaged, reconciled, or
 * silently preferred on quality grounds — where the two disagree, the loser is
 * not discarded but appears in أقوال العلماء under its own work's name, so the
 * disagreement stays visible. Scholars differing about a narrator is the
 * substance of this discipline, not noise to be cleaned up.
 */
export function mergeProfiles(
  primary: NarratorProfile,
  secondary: NarratorProfile,
): NarratorProfile {
  const pick = (a: SourcedValue | null, b: SourcedValue | null) => a ?? b;

  return {
    key: primary.key,
    fullName: primary.fullName || secondary.fullName,
    kunya: pick(primary.kunya, secondary.kunya),
    lineage: pick(primary.lineage, secondary.lineage),
    knownAs: pick(primary.knownAs, secondary.knownAs),
    generation: pick(primary.generation, secondary.generation),
    residence: pick(primary.residence, secondary.residence),
    birth: pick(primary.birth, secondary.birth),
    death: pick(primary.death, secondary.death),
    placeOfBirth: pick(primary.placeOfBirth, secondary.placeOfBirth),
    placeOfDeath: pick(primary.placeOfDeath, secondary.placeOfDeath),
    ibnHajar: pick(primary.ibnHajar, secondary.ibnHajar),
    statements: dedupeStatements([...primary.statements, ...secondary.statements]),
    sources: [...primary.sources, ...secondary.sources],
    namings: [...new Set([...primary.namings, ...secondary.namings])],
  };
}

/** One statement per work per wording. The same verdict twice is one fact. */
function dedupeStatements(statements: ScholarStatement[]): ScholarStatement[] {
  const seen = new Set<string>();
  return statements.filter((statement) => {
    const key = `${statement.work}|${statement.verdict}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Whether a card has anything at all to show beyond a name. */
export function hasContent(profile: NarratorProfile): boolean {
  return (
    FIELD_LABELS.some(([field]) => profile[field] !== null) ||
    profile.statements.length > 0 ||
    profile.sources.length > 0
  );
}
