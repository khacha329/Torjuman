import { normalize } from '../lib/arabic';

// Turning an inflected surface form into candidate roots.
//
// This is a deterministic morphological problem and is solved deterministically:
// no model, no network. A lookup is a hash-map hit, so generating a dozen
// candidates costs nothing and is far safer than committing to one guess. Every
// candidate is looked up and every hit is returned, ranked — the user reads
// Arabic and can judge which entry applies better than any heuristic.

/**
 * Proclitics, longest first.
 *
 * A candidate is generated at *each* strip depth, not only the deepest: وبكتابه
 * needs both بكتابه and كتابه tried, because stripping too eagerly can eat a
 * real radical.
 */
const PROCLITICS = [
  'وبال', 'فبال', 'كال', 'بال', 'وال', 'فال', 'لل', 'ال',
  'وب', 'فب', 'ول', 'فل', 'وس', 'فس',
  'ب', 'ك', 'ل', 'و', 'ف', 'س', 'ا', 'ي', 'ت', 'ن',
];

/** Pronoun suffixes, longest first. */
const ENCLITICS = [
  'كموها', 'هما', 'كما', 'هنا', 'هم', 'هن', 'كم', 'كن', 'نا', 'ها', 'ني',
  'ه', 'ك', 'ي', 'وا',
];

/** Inflectional endings, applied after the pronouns. */
const ENDINGS = ['ونا', 'ينا', 'ون', 'ين', 'ات', 'ان', 'تم', 'تن', 'وا', 'ة', 'ت', 'ا', 'ن', 'ي', 'و'];

/** Letters that can be augments rather than radicals. */
const AUGMENTS = new Set(['س', 'ا', 'ل', 'ت', 'م', 'و', 'ن', 'ي', 'ه', 'ء']);

/**
 * Fold every hamza carrier to bare ء.
 *
 * The index prints roots with ء — "(ء ب ب)", not أ or إ — so a candidate
 * carrying أ would never match. Also folds ة to ه, matching the dictionary's
 * own orthography.
 */
export function foldRoot(input: string): string {
  return input
    .replace(/[أإآئؤٱا]/g, 'ء')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '');
}

/** Root key as the TOC prints it: "(ء ب ب)" -> "ءبب". */
export function rootKeyFrom(printed: string): string {
  return foldRoot(normalize(printed));
}

function stripOnce(word: string, affixes: string[], from: 'start' | 'end'): string[] {
  const results: string[] = [];
  for (const affix of affixes) {
    if (from === 'start') {
      if (word.length - affix.length >= 3 && word.startsWith(affix)) {
        results.push(word.slice(affix.length));
      }
    } else if (word.length - affix.length >= 3 && word.endsWith(affix)) {
      results.push(word.slice(0, -affix.length));
    }
  }
  return results;
}

/**
 * Every plausible trilateral reduction of a longer stem.
 *
 * Rather than committing to one removal, all combinations that drop augment
 * letters down to three are generated. Lookup is cheap; a wrong commitment is
 * not recoverable.
 */
function trilateralReductions(stem: string): string[] {
  if (stem.length <= 3) return [];
  const out = new Set<string>();

  const recurse = (current: string) => {
    if (current.length === 3) {
      out.add(current);
      return;
    }
    if (current.length < 3) return;
    for (let i = 0; i < current.length; i++) {
      if (!AUGMENTS.has(current[i])) continue;
      recurse(current.slice(0, i) + current.slice(i + 1));
    }
  };

  recurse(stem);
  return [...out];
}

/**
 * Weak radicals, where naive stripping fails.
 *
 * A hollow verb writes its middle radical as alef — قال has root قول, باع has
 * بيع — and a defective verb writes its final radical the same way: دعا has
 * root دعو. After folding, that alef has become ء, so any trilateral candidate
 * carrying ء in second or third position gets both the و and the ي variant.
 */
function weakVariants(candidate: string): string[] {
  if (candidate.length !== 3) return [];
  const out: string[] = [];

  for (const position of [1, 2]) {
    if (candidate[position] !== 'ء') continue;
    for (const radical of ['و', 'ي']) {
      out.push(candidate.slice(0, position) + radical + candidate.slice(position + 1));
    }
  }

  return out;
}

export interface RootCandidate {
  root: string;
  /** Lower is a better guess. Hits are returned in this order. */
  rank: number;
}

/**
 * Ranked candidate roots for a surface form.
 *
 * Ranking is by how much had to be assumed: the bare skeleton first, then
 * affix-stripped forms, then trilateral reductions, then weak-radical guesses.
 */
export function rootCandidates(surface: string): RootCandidate[] {
  // Affixes are stripped on the ordinary orthography, and hamza is folded only
  // at the end. Folding first would turn الصلاة into ءلصلءه, and the definite
  // article — now ءل — would no longer match the proclitic list at all.
  const skeleton = normalize(surface).replace(/\s+/g, '');
  if (skeleton.length === 0) return [];

  const ranked = new Map<string, number>();
  const consider = (value: string, rank: number) => {
    const folded = foldRoot(value);
    if (folded.length < 3 || folded.length > 6) return;
    const existing = ranked.get(folded);
    if (existing === undefined || rank < existing) ranked.set(folded, rank);
  };

  consider(skeleton, 0);

  // Affix stripping, generating a candidate at every depth.
  const stems = new Set<string>([skeleton]);
  for (const proclitic of stripOnce(skeleton, PROCLITICS, 'start')) {
    stems.add(proclitic);
    for (const deeper of stripOnce(proclitic, PROCLITICS, 'start')) stems.add(deeper);
  }

  const trimmed = new Set<string>();
  for (const stem of stems) {
    trimmed.add(stem);
    for (const enclitic of stripOnce(stem, ENCLITICS, 'end')) {
      trimmed.add(enclitic);
      for (const ending of stripOnce(enclitic, ENDINGS, 'end')) trimmed.add(ending);
    }
    for (const ending of stripOnce(stem, ENDINGS, 'end')) trimmed.add(ending);
  }

  for (const stem of trimmed) consider(stem, stem === skeleton ? 0 : 1);

  // Trilateral reductions of anything still longer than three letters.
  for (const stem of trimmed) {
    for (const reduced of trilateralReductions(stem)) consider(reduced, 2);
  }

  // Weak radicals are written as a bare alef in the surface form, which folds
  // to ء — so the variants have to be generated from the *folded* candidates.

  // Weak radicals, on everything trilateral found so far.
  for (const [candidate, rank] of [...ranked]) {
    for (const variant of weakVariants(candidate)) consider(variant, rank + 3);
  }

  return [...ranked]
    .map(([root, rank]) => ({ root, rank }))
    .sort((a, b) => a.rank - b.rank || a.root.length - b.root.length);
}

/** True when a selection is a single word, which is all this feature handles. */
export function isSingleWord(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 40 && !/\s/.test(trimmed);
}
