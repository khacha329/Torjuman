import type { WorkBundle } from '../platform/storage/StorageAdapter';

// The work backup as something a person reads about: what one holds, in the
// words the rest of Settings uses. Settings → Work backup says it after an
// export and a restore.
//
// Added for FOUND_ISSUES 32: the export's message counted translation cards,
// explanations, marks and glossary entries, and left out the commentary cards
// and word glosses the file carries just the same (`WorkBundle`). One list
// here, so the next store a backup gains is counted in one place.

/** The bundle's fields worth naming, in the order a reader thinks of them. */
const COUNTED: [field: keyof WorkBundle, one: string, many: string][] = [
  ['cards', 'translation card', 'translation cards'],
  ['explanationCards', 'explanation', 'explanations'],
  ['sharhCards', 'commentary card', 'commentary cards'],
  ['marks', 'mark or note', 'marks and notes'],
  ['glossary', 'glossary entry', 'glossary entries'],
  ['wordGlosses', 'word gloss', 'word glosses'],
];

/** "3 translation cards, 1 explanation, …" — every counted field, zeros included. */
export function describeWorkBundle(bundle: WorkBundle): string {
  return COUNTED.map(([field, one, many]) => {
    const rows = bundle[field];
    // Read loosely: a backup from an older app can lack a field this one has.
    const count = Array.isArray(rows) ? rows.length : 0;
    return `${count.toLocaleString()} ${count === 1 ? one : many}`;
  }).join(', ');
}
