import type { BiographyEntry, TocNode } from '../types';
import { deriveAliases, looksLikePerson } from './names';

// Building a name index out of a biographical work's own table of contents.
//
// ---------------------------------------------------------------------------
// The premise, and where it fails
//
// Siyar aʿlām an-nubalāʾ, al-Iṣāba and Usd al-Ghāba are organised one entry per
// person, and their contents are therefore already a list of names — 6,162,
// 13,854 and 8,148 nodes respectively, measured against the live pages. No
// parsing of the body is needed; the structure is there.
//
// That premise does not hold universally, and the failure is quiet. Taqrīb
// at-Tahdhīb contains roughly 8,800 narrators and its contents are 249 entries
// reading «حرف الألف» and «ذكر من اسمه أحمد» — letter headings, with the
// narrators themselves numbered only in the body. An index built from it would
// hold 249 useless rows and would answer every lookup with nothing, looking
// exactly like a book with no matches.
//
// Worse, two editions of the SAME work differ: Usd al-Ghāba is 8,148 nodes in
// ط العلمية and 33 collapsed bāb headings in ط الفكر and ط الشعب. Picking the
// wrong edition of the right book produces the same silent emptiness.
//
// So the index refuses to build when the contents are not names, and says which
// of the two it found. A refusal with a reason is worth far more than a
// thousand rows nobody can use.
// ---------------------------------------------------------------------------

/**
 * Minimum share of contents entries that must read as people.
 *
 * Measured across the four works the amendment named:
 *
 *   Siyar (10906)          6,162 nodes   passes comfortably
 *   al-Iṣāba (9767)       13,854 nodes   passes
 *   Usd al-Ghāba (1110)    8,148 nodes   passes
 *   Usd al-Ghāba (23700)      33 nodes   refused — bāb headings only
 *   Taqrīb (8609)            249 nodes   refused — letter headings only
 *
 * Set where it separates those groups with room on both sides rather than
 * tuned to the boundary, because the next bad edition will not be one of these.
 */
export const MIN_PERSON_SHARE = 0.5;

/** And an absolute floor: a handful of names is not a biographical index. */
export const MIN_PERSON_COUNT = 100;

export interface BiographyIndexResult {
  entries: BiographyEntry[];
  /** Contents entries examined. */
  examined: number;
  /** How many of them read as a person rather than a structural heading. */
  personCount: number;
  personShare: number;
  /** Set when the index was refused; `entries` is then empty. */
  refusedBecause?: string;
}

/**
 * Build the index, or refuse and say why.
 *
 * `nodes` are the book's TOC rows as stored, in reading order.
 */
export function buildBiographyIndex(
  bookId: string,
  nodes: TocNode[],
  volumeStarts: number[] = [],
): BiographyIndexResult {
  const people = nodes.filter((node) => looksLikePerson(node.title));
  const examined = nodes.length;
  const personCount = people.length;
  const personShare = examined === 0 ? 0 : personCount / examined;

  const refuse = (reason: string): BiographyIndexResult => ({
    entries: [],
    examined,
    personCount,
    personShare,
    refusedBecause: reason,
  });

  if (examined === 0) {
    return refuse('This book has no table of contents to index.');
  }
  if (personCount < MIN_PERSON_COUNT) {
    return refuse(
      `Only ${personCount} of ${examined} contents entries read as a person's name. ` +
        `This work's contents are section headings rather than a list of people, so a ` +
        `name index cannot be built from them. Some editions of a work carry a full ` +
        `per-person contents where others do not — check whether another edition of ` +
        `the same book does.`,
    );
  }
  if (personShare < MIN_PERSON_SHARE) {
    return refuse(
      `Only ${Math.round(personShare * 100)}% of ${examined} contents entries read as ` +
        `personal names, which is too few to treat this as a biographical index. It is ` +
        `still readable and searchable as an ordinary book.`,
    );
  }

  const entries: BiographyEntry[] = [];
  for (const node of people) {
    const aliases = deriveAliases(node.title);
    if (aliases.length === 0) continue;

    entries.push({
      id: `${bookId}|bio|${node.id}`,
      bookId,
      name: node.title,
      nameNormalized: aliases[0].value,
      aliases,
      pageIndex: node.pageIndex,
      blockIds: [],
      volume: volumeOf(node.pageIndex, volumeStarts),
      // The TOC carries only Shamela's sequential index. The printed ص lives on
      // the Page record and is filled in when the sheet opens that page, so the
      // index does not have to wait on every page being fetched.
      printPage: node.pageIndex,
    });
  }

  return { entries, examined, personCount, personShare };
}

/** Which volume a page index falls in, 1-based. */
function volumeOf(pageIndex: number, volumeStarts: number[]): number {
  if (volumeStarts.length === 0) return 1;
  let volume = 1;
  for (let index = 0; index < volumeStarts.length; index++) {
    if (volumeStarts[index] <= pageIndex) volume = index + 1;
  }
  return volume;
}
