import type { BlockType, InlineSpan, StructureProfile } from '../types';
import { parseArabicNumber } from '../lib/arabic';

// Structure detection. Runs at parse time and decides Block.type.
//
// Every pattern below was written against real fetched HTML from book 9260 —
// see the notes on each rule for the exact text it was derived from. Tier 1 is
// generic and must stay safe for a tafsīr or fiqh manual; anything that assumes
// a hadith commentary belongs in tier 2.

/**
 * Hadith numbering at the start of a matn. Book 9260 uses two forms:
 *
 *   "١/٤١٢ ـ وعن عبادة بن الصامت رضي الله عنه قال:"   bab-local / book-global
 *   "٤-وعن أبي عبد الله جابر بن عبد الله الأنصاري"     book-global only
 *
 * When both numbers are present the second is the running number across the
 * whole of Riyāḍ aṣ-Ṣāliḥīn, which is what sunnah.com indexes by, so that is
 * the one captured.
 */
const HADITH_NUMBER = /^\s*([٠-٩0-9]+)\s*(?:\/\s*([٠-٩0-9]+)\s*)?[-ـ–—]\s*/u;

/** "وعن أبي هريرة رضي الله عنه قال" / "عن ابن عمر رضي الله عنهما". */
const NARRATOR_OPENING = /^\s*(?:و?عن|وعنه)\s+\S/u;
const COMPANION_FORMULA = /رضي\s+الله\s+عنه/u;
const PROPHETIC_FORMULA = /(?:قال|سمعت)\s+(?:رسول\s+الله|النبي)\s+صلى\s+الله\s+عليه\s+وسلم/u;

/** "وفي رواية لمسلم:" / "وفي لفظ:" / "وزاد البخاري:" — a variant wording. */
const VARIANT_NARRATION = /^\s*(?:وفي\s+رواية|وفي\s+لفظ|وزاد|وفي\s+حديث)/u;

/**
 * Takhrīj — the attribution that closes a hadith. Matched only against short
 * blocks, because far more often it trails inside the matn's own paragraph.
 */
const TAKHRIJ =
  /^\s*(?:متفق\s+عليه|رواه(?:ما|هما)?\s+\S+|أخرجه\s+\S+|وفي\s+رواية|رواه\s+الشيخان)/u;

/** "كتاب الصيام" / "باب الإخلاص" / "١- باب التوبة" at the head of a block. */
const CHAPTER_OPENING = /^\s*(?:[٠-٩0-9]+\s*[-ـ–—]?\s*)?(?:كتاب|باب)\s+\S/u;

/** Shamela's inline separator between hadiths. */
const DIVIDER = /^[\s*ـ•·]+$/u;

export interface DetectionInput {
  text: string;
  spans: InlineSpan[];
  /** True when the whole paragraph was wrapped in Shamela's heading span. */
  wholeBlockIsHeading: boolean;
  profile: StructureProfile;
}

export interface DetectionResult {
  type: BlockType;
  hadithNumber: string | null;
}

export function detectBlockType(input: DetectionInput): DetectionResult {
  const { text, spans, wholeBlockIsHeading, profile } = input;
  const trimmed = text.trim();

  // ---- Tier 1: generic, always on -------------------------------------

  if (wholeBlockIsHeading || CHAPTER_OPENING.test(trimmed)) {
    return { type: 'chapter_title', hadithNumber: null };
  }

  if (isEntirelyQuran(trimmed, spans)) {
    return { type: 'quran', hadithNumber: null };
  }

  if (isPoetry(trimmed)) {
    return { type: 'poetry', hadithNumber: null };
  }

  // ---- Tier 2: hadith-commentary only ---------------------------------

  if (profile === 'hadith-commentary') {
    const numbered = HADITH_NUMBER.exec(trimmed);
    if (numbered) {
      // A number alone is not enough — "٥- باب المراقبة" was already caught
      // above, but a stray numbered list item in commentary would slip through.
      const rest = trimmed.slice(numbered[0].length);
      if (NARRATOR_OPENING.test(rest) || COMPANION_FORMULA.test(rest) || PROPHETIC_FORMULA.test(rest)) {
        return { type: 'hadith_matn', hadithNumber: extractNumber(numbered) };
      }
    }

    if (NARRATOR_OPENING.test(trimmed) && COMPANION_FORMULA.test(trimmed)) {
      return { type: 'hadith_matn', hadithNumber: null };
    }

    // A variant narration of the hadith just given ("وفي رواية لمسلم: ((…))").
    // It is prophetic text, not commentary, so it must not be styled as sharh —
    // requiring a quoted run keeps this off ordinary prose that merely mentions
    // a riwāya.
    if (VARIANT_NARRATION.test(trimmed) && spans.some((span) => span.kind === 'quote')) {
      return { type: 'hadith_matn', hadithNumber: null };
    }

    if (trimmed.length < 80 && TAKHRIJ.test(trimmed)) {
      return { type: 'takhrij', hadithNumber: null };
    }

    // In this profile the running text is Ibn ʿUthaymīn's commentary.
    return { type: 'sharh', hadithNumber: null };
  }

  return { type: 'body', hadithNumber: null };
}

function extractNumber(match: RegExpExecArray): string | null {
  // Prefer the second number of "١/٤١٢" — the book-wide running number.
  const raw = match[2] ?? match[1];
  const value = parseArabicNumber(raw);
  return value === null ? null : String(value);
}

/**
 * True when the block is nothing but a verse, its citation, and the formula
 * that introduces it. Verses usually appear *inside* a commentary paragraph in
 * this edition, so this fires rarely — inline styling is driven by the spans.
 *
 * The introducing formula ("قال الله تعالى:", "وقال تعالى:") is counted as
 * covered rather than as prose. Without that, two paragraphs that are
 * typographically identical in the print — a lead-in, a verse, a citation —
 * get different types purely because one verse is longer than the other, and
 * the reader then styles them inconsistently.
 */
function isEntirelyQuran(text: string, spans: InlineSpan[]): boolean {
  if (text.length === 0) return false;
  if (!spans.some((span) => span.kind === 'quran')) return false;

  const covered = spans
    .filter(
      (span) =>
        span.kind === 'quran' || span.kind === 'quran_ref' || span.kind === 'emphasis',
    )
    .reduce((total, span) => total + (span.end - span.start), 0);
  return covered / text.length > 0.8;
}

/**
 * Poetry heuristic: a hemistich pair is typeset as two short balanced halves
 * separated by a wide gap. Deliberately conservative — the spec accepts misses,
 * and a false positive would centre a paragraph of prose.
 */
function isPoetry(text: string): boolean {
  if (text.length > 400 || DIVIDER.test(text)) return false;
  const gaps = text.match(/\s{4,}/g);
  if (!gaps || gaps.length < 1) return false;

  const halves = text.split(/\s{4,}/).filter((part) => part.trim().length > 0);
  if (halves.length < 2) return false;

  // Balanced halves: no part more than three times the length of another.
  const lengths = halves.map((part) => part.trim().length);
  return Math.max(...lengths) <= Math.min(...lengths) * 3;
}

export function isDivider(text: string): boolean {
  return DIVIDER.test(text.trim());
}
