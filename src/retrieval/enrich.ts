import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { HadithRecord, TranslatedSegment } from '../types';
import { renderTakhrij } from '../lib/takhrij';
import { fetchVerse, type QuranLookupOptions } from './quran';
import { recordRetrieval } from '../services/retrievalLog';
import { fetchHadith, parseHadithReferences, SUNNAH_COM_SKIPPED, type HadithReference } from './sunnah';
import {
  composeEnglish,
  findLocalHadith,
  HADITH_JSON_COLLECTIONS,
  hadithJsonCollection,
  NEIGHBOUR_WINDOW,
  type LocalHadith,
} from './hadithJson';
import { loadHadithIndexes, searchHadithText } from './hadithTextIndex';
import { findShortQuote, type ShortQuoteSearch } from './hadithShortQuote';
import { QUOTED_IN_PART_BELOW } from './hadithText';
import { hadithQuotationOverrun, quotationOverrunNote } from './quotationOverrun';

// Replaces the model's placeholder for scripture with the authoritative text.
//
// The profile forbids the model from translating a verse or a matn itself; it
// only identifies them and supplies a reference. This is the step that turns
// that reference into real text. When retrieval fails the Arabic is kept and
// the segment is explicitly marked as unavailable — never filled in by the
// model.

export interface EnrichDeps {
  http: HttpClient;
  storage: StorageAdapter;
  quran: QuranLookupOptions;
  sunnahApiKey: string;
  /** Verse references detected locally in the selected passage, in order. */
  knownQuranRefs?: string[];
  /**
   * The hadith-json collection the book's ḥadīth belong to (`hadithScopeFor`):
   * searched first by text. A filter, never a proof. The same for Claude and
   * Gemini: nothing here knows which provider produced the segments.
   */
  hadithScope?: string | null;
}

export const QURAN_UNAVAILABLE =
  'Translation unavailable — the verse could not be retrieved, so no English rendering is shown. A model-generated translation is deliberately not substituted.';

export const HADITH_UNAVAILABLE =
  'No verified English translation was retrieved from sunnah.com, so none is shown. A model-generated translation is deliberately not substituted.';

export const HADITH_NEEDS_KEY =
  'No verified English translation was retrieved: sunnah.com requires an API key, which is not set in Settings. A model-generated translation is deliberately not substituted.';

export const HADITH_IMPORT_ONLY =
  'No verified English translation was found: for this collection the English comes only from the imported hadith-json file (Settings), and no imported ḥadīth matched this text. A model-generated translation is deliberately not substituted.';

export const HADITH_BY_TEXT =
  'Identified by its text; this dataset’s numbering is not the standard one, so no number is given.';

export const HADITH_QUOTED_IN_PART = 'Quoted in part; this is the whole ḥadīth.';

/**
 * A short quotation's match (retrieval/hadithShortQuote.ts), in place of
 * HADITH_BY_TEXT so the card does not say "identified" twice. `name` is the
 * collection's display name.
 */
export function hadithShortQuoteNote(name: string): string {
  return `Identified by a short quotation: these words occur in only one ḥadīth of ${name}, near the cited number. This dataset’s numbering is not the standard one, so no number is given.`;
}

const NOT_SUBSTITUTED = 'A model-generated translation is deliberately not substituted.';

/** A short quotation found in more than one ḥadīth of the cited collection. */
export function hadithShortAmbiguousNote(name: string): string {
  return `These few words occur in more than one ḥadīth of the imported ${name}, so none is shown. ${NOT_SUBSTITUTED}`;
}

/**
 * Appended where a sunnah.com key would make a request it does not make now:
 * no key is set and a cited collection is one sunnah.com is asked for (Q6).
 */
export const HADITH_KEY_WOULD_HELP =
  'With a sunnah.com key (Settings), the cited number would also be looked up there.';

/** Why a cited, imported collection gave no English (Design 7). */
export interface ImportedMiss {
  status: 'ambiguous' | 'common' | 'too-short' | 'empty' | 'too-long' | 'none-near';
  /** The collection's display name. */
  name: string;
  /** The cited number as the model gave it. */
  number: string;
  /** How many ḥadīth the imported file holds. */
  entryCount: number;
}

/**
 * The note for a card whose cited collection is imported and still gave no
 * English, saying which test failed, instead of blaming a missing key alone
 * (the owner's Bukhārī 6607 card: docs/plans/hadith-short-quote.md, Goal).
 * A quotation of six words or more (`too-long` here) went through the text
 * search and the number path's ±NEIGHBOUR_WINDOW check, so the note says
 * what that check found at the cited number.
 */
export function hadithImportedMissNote(miss: ImportedMiss): string {
  const { name, number } = miss;
  switch (miss.status) {
    case 'ambiguous':
      return hadithShortAmbiguousNote(name);
    case 'common':
      return `These words are too common in the imported ${name} to identify one ḥadīth. ${NOT_SUBSTITUTED}`;
    case 'too-short':
    case 'empty':
      return `The quotation is too short to identify by its text in the imported ${name}. ${NOT_SUBSTITUTED}`;
    case 'none-near':
      return `No ḥadīth of the imported ${name} near number ${number} contains these words; the file’s numbering may differ from the book’s. ${NOT_SUBSTITUTED}`;
    case 'too-long':
      return Number(number) <= miss.entryCount
        ? `No ḥadīth in the imported ${name} matched this text, and its ḥadīth at number ${number} and the ${NEIGHBOUR_WINDOW} either side are different ones. ${NOT_SUBSTITUTED}`
        : `No ḥadīth in the imported ${name} matched this text, and the file has no ḥadīth numbered ${number}. ${NOT_SUBSTITUTED}`;
  }
}

/**
 * The ambiguity note, naming the candidates (numbers only where citable). Two
 * candidates in one non-citable collection have the same name, so the names
 * are de-duplicated: «more than one ḥadīth in Ṣaḥīḥ al-Bukhārī».
 */
export function hadithAmbiguousNote(candidates: readonly string[]): string {
  const names = [...new Set(candidates)];
  const where = names.length === 1 ? `in ${names[0]}` : `(${names.join('; ')})`;
  return `This text matches more than one ḥadīth ${where}, so none is shown. A model-generated translation is deliberately not substituted.`;
}

export async function enrichSegments(
  segments: TranslatedSegment[],
  deps: EnrichDeps,
): Promise<TranslatedSegment[]> {
  const enriched: TranslatedSegment[] = [];

  // References resolved locally against the bundled muṣḥaf, consumed in order.
  // A locally matched reference beats a model-supplied one: one was proved
  // against the Qurʾān text, the other was recalled.
  const known = [...(deps.knownQuranRefs ?? [])];

  for (const segment of segments) {
    if (segment.type === 'quran') {
      const local = known.shift();
      enriched.push(
        await enrichQuran(local ? { ...segment, reference: local } : segment, deps),
      );
    } else if (segment.type === 'hadith') {
      enriched.push(await enrichHadith(segment, deps));
    } else {
      // A takhrīj formula is overwritten with the table's rendering even though
      // the model already produced one. That is the point of the table: the
      // same thirty phrases come out identically on this path and on the
      // offline one, in the wording the user will read aloud.
      enriched.push(applyTakhrijTable({ ...segment, source: 'model' }));
    }
  }

  return enriched;
}

async function enrichQuran(
  segment: TranslatedSegment,
  deps: EnrichDeps,
): Promise<TranslatedSegment> {
  const reference = segment.reference?.trim() ?? '';
  const verse = reference
    ? await fetchVerse(deps.http, deps.storage, reference, deps.quran)
    : null;

  if (!verse) {
    return {
      ...segment,
      // Keep whatever Arabic the model echoed from the source text.
      english: '',
      source: undefined,
      note: joinNotes(segment.note, QURAN_UNAVAILABLE),
    };
  }

  return {
    ...segment,
    arabic: verse.arabic,
    english: verse.english,
    source: 'quran.com',
    reference,
    note: joinNotes(segment.note, `English: ${verse.translationName}.`),
  };
}

async function enrichHadith(
  segment: TranslatedSegment,
  deps: EnrichDeps,
): Promise<TranslatedSegment> {
  // A takhrīj often names more than one collection ("Bukhārī 1; Muslim 1907").
  // Each is tried in the model's order; the first that yields English wins.
  const references = segment.reference ? parseHadithReferences(segment.reference) : [];

  // Text first (plan, Design 6): a match proved against the imported Arabic
  // beats a reference the model recalled, whichever provider recalled it.
  // An error in the text search (the resource list or a row read that throws,
  // or a fault in the matcher) falls back to the reference path rather than
  // failing the card: the translation is already paid for (review of
  // e23fe93). An index that will not load never gets here: loadHadithIndexes
  // leaves that collection out and reports it. Nor does this make a broken
  // store survivable — the reference path reads storage too.
  let byText: TranslatedSegment | null = null;
  try {
    byText = await enrichHadithByText(segment, references, deps);
  } catch (error) {
    recordRetrieval({
      kind: 'hadith',
      outcome: 'lookup-failed',
      query: segment.arabic.slice(0, 80),
      summary: 'The text search failed; the reference was tried instead.',
      detail: [['error', error instanceof Error ? error.message : String(error)]],
    });
  }
  if (byText) return byText;

  // A quotation too short for the text search, proved by the cited number
  // and the whole collection (docs/plans/hadith-short-quote.md). A match
  // comes before sunnah.com because it is a text proof, like the search above
  // (Q5). An ambiguity does not end the card: sunnah.com and the old
  // exact-number rule (`shortQuoteHolds`) still get their turn, and the
  // ambiguity is only the note when they too find nothing (owner's answer,
  // 2026-11-23, review of 13604c5; Q9: the existing paths stay). Any other
  // miss in an imported collection is kept for the note, too.
  const short = await enrichHadithByShortQuote(segment, references, deps);
  if (short.segment) return short.segment;

  let record: HadithRecord | null = null;
  for (const reference of references) {
    record = await fetchHadith(deps.http, deps.storage, reference, deps.sunnahApiKey);
    if (record && record.english !== '') break;
  }

  if (!record || record.english === '') {
    // The imported hadith-json collections, when there are any. The reference
    // is the model's and so is only a candidate; `findLocalHadith` confirms it
    // against the Arabic the segment carries before any English is returned.
    let local: LocalHadith | null = null;
    for (const reference of references) {
      local = await findLocalHadith(
        deps.storage,
        `${reference.collection}:${reference.number}`,
        segment.arabic,
      );
      if (local) break;
    }
    if (local) {
      return {
        ...segment,
        english: local.english,
        source: 'hadith-json',
        // Renumbered to the dataset only where its numbers are citable; for
        // every collection but Riyāḍ and the Forty, the dataset's position is
        // not (or not proven to be) the standard number.
        reference: local.citable
          ? `${local.collection}:${local.entry.number}`
          : segment.reference,
      };
    }
    // A cited collection is imported and still gave nothing: say why
    // (Design 7), and mention the key only where it would make a request
    // (Q6). Nothing cited is imported: the notes below, as before.
    if (short.miss) {
      recordRetrieval({
        kind: 'hadith',
        outcome: 'no-match',
        query: segment.arabic.slice(0, 80),
        summary: `No English from the imported ${short.miss.name}: ${short.miss.status}.`,
        detail: [['reference', segment.reference ?? '(none)']],
      });
      const keyWouldHelp =
        !deps.sunnahApiKey && references.some((ref) => !SUNNAH_COM_SKIPPED.has(ref.collection));
      return {
        ...segment,
        english: '',
        source: undefined,
        note: joinNotes(
          segment.note,
          hadithImportedMissNote(short.miss),
          keyWouldHelp ? HADITH_KEY_WOULD_HELP : undefined,
          overrunNote(segment.arabic),
        ),
      };
    }
    return {
      ...segment,
      english: '',
      source: undefined,
      note: joinNotes(
        segment.note,
        // A sunnah.com key cannot help where every cited collection is one
        // sunnah.com is never asked for (Mālik, Aḥmad), nor in a sharḥ of a
        // non-citable collection when the model cited nothing: its numbers
        // are never sent there. Say where the English comes from instead.
        (references.length > 0 && references.every((ref) => SUNNAH_COM_SKIPPED.has(ref.collection))) ||
          (references.length === 0 && isNonCitable(deps.hadithScope))
          ? HADITH_IMPORT_ONLY
          : deps.sunnahApiKey
            ? HADITH_UNAVAILABLE
            : HADITH_NEEDS_KEY,
        overrunNote(segment.arabic),
      ),
    };
  }

  return {
    ...segment,
    // Prefer sunnah.com's Arabic when it has it; otherwise keep the source's.
    arabic: record.arabic || segment.arabic,
    english: record.english,
    source: 'sunnah.com',
    reference: `${record.collection}:${record.number}`,
    note: joinNotes(segment.note, record.grade ? `Grading: ${record.grade}.` : undefined),
  };
}

function isNonCitable(slug: string | null | undefined): boolean {
  const collection = slug ? hadithJsonCollection(slug) : undefined;
  return collection !== undefined && !collection.citableNumbers;
}

/**
 * The collections to search, in priority order (Q3): the book's own, then
 * Bukhārī, Muslim, then the registry's order. The order is the matcher's
 * collection priority.
 *
 * The tiers below do more than limit what is loaded, and the plan's Design 6
 * said otherwise (review of e23fe93). A tier-1 answer can differ from one pass
 * over every collection: the matcher prefers the member with the longer chain
 * before the collection's rank, so a fuller copy in an unsearched collection
 * would have won; a family in an unsearched collection could have made the
 * answer ambiguous; and the posting cap and the candidate cut count only what
 * is searched. That is the intent — the book's own collection and the ones
 * the model named are the better evidence — but it is a choice, not a no-op.
 */
function priorityOrder(scope: string | null | undefined, imported: ReadonlySet<string>): string[] {
  const order = [scope, 'bukhari', 'muslim', ...HADITH_JSON_COLLECTIONS.map((c) => c.slug)];
  const out: string[] = [];
  for (const slug of order) if (slug && imported.has(slug) && !out.includes(slug)) out.push(slug);
  return out;
}

/** A candidate as a person would name it: the number only where the collection's numbers are citable. */
function describeCandidate(slug: string, number: number): string {
  const collection = hadithJsonCollection(slug);
  if (!collection) return slug;
  return collection.citableNumbers ? `${collection.displayName} ${number}` : collection.displayName;
}

/**
 * The imported English for a `hadith` segment, found by its text; null when
 * nothing is imported, nothing matched, the English is empty, or the match is
 * ambiguous while the model cited a collection that was not searched — the
 * caller then tries the references as before, sunnah.com included (the
 * owner's answer, 2026-11-22).
 *
 * Tier 1 searches the book's collection and the ones the model cited; tier 2,
 * only when tier 1 found nothing at all, every imported collection. Any other
 * ambiguous answer ends the search: it is returned as Arabic with a note,
 * never resolved by a recalled number.
 */
async function enrichHadithByText(
  segment: TranslatedSegment,
  references: readonly HadithReference[],
  deps: EnrichDeps,
): Promise<TranslatedSegment | null> {
  if (segment.arabic.trim() === '') return null;
  const imported = new Set(
    (await deps.storage.listQulResources())
      .filter((resource) => resource.kind === 'hadith-json' && resource.collection)
      .map((resource) => resource.collection as string),
  );
  if (imported.size === 0) return null;

  const all = priorityOrder(deps.hadithScope, imported);
  const cited = new Set(references.map((ref) => ref.collection));
  const first = all.filter((slug) => slug === deps.hadithScope || cited.has(slug));
  const tiers = first.length > 0 && first.length < all.length ? [first, all] : [all];
  const hints = references.map((ref) => ({
    collection: ref.collection,
    number: Number(ref.number),
    inDatasetNumbering: hadithJsonCollection(ref.collection)?.citableNumbers ?? false,
  }));

  for (const tier of tiers) {
    const loaded = await loadHadithIndexes(deps.storage, tier, undefined, (collection, error) =>
      recordRetrieval({
        kind: 'hadith',
        outcome: 'lookup-failed',
        query: `text index of ${collection}`,
        summary: 'The text index could not be loaded or built; that collection was not searched.',
        detail: [['error', error instanceof Error ? error.message : String(error)]],
      }),
    );
    if (loaded.length === 0) continue;
    const result = await searchHadithText(deps.storage, loaded, segment.arabic, { mode: 'segment', hints });
    const searchedSet = new Set(loaded.map((item) => item.index.collection));
    const searched = [...searchedSet].join(', ');

    // An ambiguity among what was searched does not contradict a citation of
    // a collection that was not (not imported, or failed to load): the old
    // reference path, sunnah.com included, gets its turn. The owner's answer,
    // 2026-11-22 (review of e23fe93): before text came first, such a card had
    // sunnah.com's English.
    if (result.ambiguous && references.some((ref) => !searchedSet.has(ref.collection))) {
      return null;
    }

    if (result.ambiguous) {
      const named = result.contenders.map((candidate) => describeCandidate(candidate.collection, candidate.number));
      recordRetrieval({
        kind: 'hadith',
        outcome: 'no-match',
        query: segment.arabic.slice(0, 80),
        summary: `More than one ḥadīth matches this text: ${named.join('; ')}.`,
        detail: [['searched', searched], ['reference', segment.reference ?? '(none)']],
      });
      return {
        ...segment,
        english: '',
        source: undefined,
        note: joinNotes(segment.note, hadithAmbiguousNote(named)),
      };
    }

    const chosen = result.chosen;
    if (!chosen) continue;
    const entry = result.entries.get(`${chosen.collection}:${chosen.number}`);
    const english = entry ? composeEnglish(entry) : '';
    if (english === '') return null;

    const collection = hadithJsonCollection(chosen.collection);
    // The whole family, repetitions included: Bukhārī repeats a ḥadīth under
    // many numbers, and a citation of any of them is a citation of this one
    // (review of 07b207b).
    const members = result.family;
    const notes: (string | undefined)[] = [segment.note];
    let reference: string | undefined;
    if (collection?.citableNumbers) {
      reference = `${chosen.collection}:${chosen.number}`;
    } else if (
      segment.reference &&
      references.some((ref) =>
        members.some(
          (member) =>
            member.collection === ref.collection &&
            Math.abs(member.number - Number(ref.number)) <= NEIGHBOUR_WINDOW,
        ),
      )
    ) {
      // The model named this ḥadīth's collection with a number within
      // NEIGHBOUR_WINDOW of one of the places the dataset has it (any member
      // of the family, repetitions included): the same proof the
      // number path accepts, so its citation stands. A number further off —
      // «Ṣaḥīḥ al-Bukhārī 9999» — is not shown above proved English; it falls
      // to the name and "The model cited …" below (owner's answer, 2026-11-22,
      // review of e23fe93).
      reference = segment.reference;
    } else {
      reference = collection?.displayName ?? chosen.collection;
      notes.push(HADITH_BY_TEXT);
      if (segment.reference) notes.push(`The model cited ${segment.reference}.`);
    }
    if (chosen.coverageOfMatn < QUOTED_IN_PART_BELOW) notes.push(HADITH_QUOTED_IN_PART);

    recordRetrieval({
      kind: 'hadith',
      outcome: 'hit',
      query: segment.arabic.slice(0, 80),
      summary: `Identified by its text in ${collection?.displayName ?? chosen.collection}.`,
      detail: [
        ['searched', searched],
        ['matched', `${chosen.collection} position ${chosen.number}`],
        ['coverage of the passage', chosen.coverage.toFixed(2)],
        ['coverage of the matn', chosen.coverageOfMatn.toFixed(2)],
        ['repetitions', String(result.repetitions)],
        ['also in', result.also.map((member) => member.collection).join(', ') || '(none)'],
        ['reference', segment.reference ?? '(none)'],
      ],
    });
    return {
      ...segment,
      english,
      source: 'hadith-json',
      reference,
      note: joinNotes(...notes),
    };
  }
  return null;
}

/**
 * The imported English for a short quotation, proved by a cited number
 * (`findShortQuote`). Without a match the reference path runs.
 *
 * Each reference is tried in the model's order and the first match wins.
 * When none matched, `miss` is why the first cited collection that is
 * imported gave nothing (ambiguous, too common, too short, nothing near the
 * number, or a quotation long enough for the text search), for the reference
 * path's note if it too finds nothing (Design 7). An ambiguity no longer ends
 * the card (owner's answer, 2026-11-23), so whether another cited collection
 * was searched changes only the note, which stays true either way. A read
 * that fails is logged and counts as not searched: it gives no miss.
 */
async function enrichHadithByShortQuote(
  segment: TranslatedSegment,
  references: readonly HadithReference[],
  deps: EnrichDeps,
): Promise<{ segment: TranslatedSegment | null; miss: ImportedMiss | null }> {
  let miss: ImportedMiss | null = null;
  if (segment.arabic.trim() === '' || references.length === 0) return { segment: null, miss };
  for (const ref of references) {
    const cited = Number(ref.number);
    let search: ShortQuoteSearch;
    try {
      search = await findShortQuote(deps.storage, ref.collection, cited, segment.arabic);
    } catch (error) {
      recordRetrieval({
        kind: 'hadith',
        outcome: 'lookup-failed',
        query: segment.arabic.slice(0, 80),
        summary: `The short-quotation search of ${ref.collection} failed; that reference counts as not searched.`,
        detail: [['error', error instanceof Error ? error.message : String(error)]],
      });
      continue;
    }
    const { result } = search;
    if (result.status === 'not-imported') continue;
    const collection = hadithJsonCollection(ref.collection);
    const name = collection?.displayName ?? ref.collection;
    if (result.status !== 'matched') {
      miss ??= { status: result.status, name, number: ref.number, entryCount: search.entryCount };
      continue;
    }

    const english = composeEnglish(result.entry);
    if (english === '') continue;

    // Labelled as a text match is (enrichHadithByText): the matched number
    // where it is citable; the model's citation where a member of the family
    // lies within NEIGHBOUR_WINDOW of it; otherwise the collection's name.
    const notes: (string | undefined)[] = [segment.note];
    let reference: string | undefined;
    if (collection?.citableNumbers) {
      reference = `${ref.collection}:${result.entry.number}`;
    } else if (segment.reference && result.family.some((n) => Math.abs(n - cited) <= NEIGHBOUR_WINDOW)) {
      reference = segment.reference;
    } else {
      reference = name;
      notes.push(hadithShortQuoteNote(name));
      if (segment.reference) notes.push(`The model cited ${segment.reference}.`);
    }
    // Three to five words of a ḥadīth are always a part of it.
    notes.push(HADITH_QUOTED_IN_PART);

    recordRetrieval({
      kind: 'hadith',
      outcome: 'hit',
      query: segment.arabic.slice(0, 80),
      summary: `Identified by a short quotation in ${name}.`,
      detail: [
        ['matched', `${ref.collection} position ${result.entry.number}`],
        ['distance from the cited number', String(result.distance)],
        ['family', result.family.join(', ')],
        ['rows read', String(search.rowsRead)],
        ['ms', String(search.ms)],
        ['reference', segment.reference ?? '(none)'],
      ],
    });
    return {
      segment: { ...segment, english, source: 'hadith-json', reference, note: joinNotes(...notes) },
      miss: null,
    };
  }

  return { segment: null, miss };
}

/**
 * Replace a takhrīj segment's English with the table's rendering.
 *
 * Returns the segment unchanged when it is not a takhrīj, which is the ordinary
 * case. Exported so both translation paths use the same function rather than
 * two implementations that could drift.
 */
export function applyTakhrijTable(segment: TranslatedSegment): TranslatedSegment {
  const rendered = renderTakhrij(segment.arabic);
  if (!rendered) return segment;
  return { ...segment, english: rendered.english, source: 'takhrij-table' };
}

/**
 * Why the lookup may have missed, when the segment holds commentary after the
 * quotation (retrieval/quotationOverrun.ts). Only on the unavailable path: a
 * ḥadīth found anyway needs no such note.
 */
function overrunNote(arabic: string): string | undefined {
  const words = hadithQuotationOverrun(arabic);
  return words === null ? undefined : quotationOverrunNote(words);
}

function joinNotes(...parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((part): part is string => Boolean(part && part.trim()));
  return kept.length ? kept.join(' ') : undefined;
}
