// The passage sent to Gemini, cut into numbered pieces, so a segment can point
// at the Arabic it covers instead of writing it back.
//
// Why. The segment schema used to ask the model to echo each segment's Arabic
// verbatim. Gemini stops a reply whose output reproduces known text with
// finishReason RECITATION, and classical books are exactly the known text it
// stops on: the owner saw replies that ended after "[ {", reported as a parse
// failure. The Arabic is already in the app — it is what was sent — so the
// model is asked only for the English and a reference to the pieces it
// translated (`from`, `to`, both inclusive, counted from 1), and the app fills
// the Arabic in from the stored text. Piece numbers rather than character
// offsets: a small model miscounts characters, and an off-by-three offset cuts
// a word in half, where a wrong piece number is at worst one sentence out.
//
// Boundaries are where a segment can plausibly start or end: after sentence
// and clause punctuation followed by a space, at a line break, and around
// whatever a verse or a quoted matn is printed in — ﴿﴾, «», “”, plain "…", and
// ( ) — so a verse or a ḥadīth inside a sentence can still be its own segment.
//
// The plain quotes and parentheses were added after a real card went wrong: a
// ḥadīth printed as "إنما الأعمال بالنيات" shared one piece with the
// commentary after it. Gemini Flash-Lite wanted the ḥadīth and the commentary
// as two segments, had one number for both, and numbered every later segment
// one piece late, the app clamping the overflow onto the last piece. The same
// shared piece also carried the commentary's words into the ḥadīth segment's
// Arabic, so the hadith-json lookup, which wants every word of a short
// quotation inside the stored ḥadīth, found nothing. Book 9260 prints its verses
// in ASCII parentheses (see quran/detectEntities.ts), hence ( ). A pair of
// parentheses round a citation becomes a piece of its own too; that costs a
// number, nothing else, since a segment can cover several pieces. A piece is never empty and the
// pieces cover the passage exactly (whitespace between them included in the
// piece before), so joining any run of them gives back the source verbatim.

export interface SourceUnit {
  /** Offsets into the passage, end exclusive. */
  start: number;
  end: number;
}

/** After one of these and whitespace, a new piece starts. */
const CLAUSE_END = /[.!?؟؛:،]/;

/** A piece starts at one of these… */
const OPENERS = '﴿«“(';
/** …and ends after one of these, with the punctuation that closes the quotation. */
const CLOSERS = '﴾»”)';

export function splitUnits(text: string): SourceUnit[] {
  const cuts: number[] = [];
  // A plain " opens and closes alike, so they are paired in order. An unpaired
  // one only misplaces a boundary, and every piece still joins back verbatim.
  let inPlainQuote = false;
  const cutAfterClose = (i: number) => {
    let j = i + 1;
    // Keep the punctuation that closes the quotation with it.
    while (j < text.length && /[.!?؟؛:،)\]]/.test(text[j])) j++;
    while (j < text.length && /\s/.test(text[j])) j++;
    cuts.push(j);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // A cut is the index where the next piece starts.
    if (ch === '\n') {
      let j = i;
      while (j < text.length && /\s/.test(text[j])) j++;
      cuts.push(j);
      i = j - 1;
    } else if (CLAUSE_END.test(ch) && /\s/.test(text[i + 1] ?? '')) {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      cuts.push(j);
    } else if (OPENERS.includes(ch)) {
      cuts.push(i);
    } else if (CLOSERS.includes(ch)) {
      cutAfterClose(i);
    } else if (ch === '"') {
      if (inPlainQuote) cutAfterClose(i);
      else cuts.push(i);
      inPlainQuote = !inPlainQuote;
    }
  }

  const units: SourceUnit[] = [];
  let start = 0;
  for (const cut of [...new Set(cuts)].sort((a, b) => a - b)) {
    if (cut <= start || cut >= text.length) continue;
    // A piece of whitespace alone is folded into the one before.
    if (text.slice(start, cut).trim() === '') continue;
    units.push({ start, end: cut });
    start = cut;
  }
  if (start < text.length) {
    if (units.length > 0 && text.slice(start).trim() === '') units[units.length - 1].end = text.length;
    else units.push({ start, end: text.length });
  }
  return units;
}

/** The pieces as the model sees them: `[1] …`, one per line. */
export function numberedUnits(text: string, units: SourceUnit[]): string {
  return units
    .map((unit, index) => `[${index + 1}] ${text.slice(unit.start, unit.end).trim()}`)
    .join('\n');
}

/**
 * The Arabic of pieces `from`..`to` (1-based, inclusive), or null when the
 * reference is not a usable pair of piece numbers. Reversed pairs are put in
 * order and out-of-range ends clamped: the model named real pieces, just
 * clumsily, and its English is still for them.
 */
export function unitRange(
  units: SourceUnit[],
  from: unknown,
  to: unknown,
): { first: number; last: number } | null {
  if (units.length === 0) return null;
  if (typeof from !== 'number' || typeof to !== 'number') return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const clamp = (value: number) => Math.min(Math.max(Math.round(value), 1), units.length);
  const a = clamp(from);
  const b = clamp(to);
  return { first: Math.min(a, b), last: Math.max(a, b) };
}

export function unitsText(
  text: string,
  units: SourceUnit[],
  range: { first: number; last: number },
): string {
  return text.slice(units[range.first - 1].start, units[range.last - 1].end).trim();
}

/**
 * Where to cut a passage in two for the retry after RECITATION: the piece
 * boundary nearest the middle, or, for a passage that is one piece, the space
 * nearest the middle. Null when there is no space at all to cut at.
 */
export function halfwayCut(text: string, units: SourceUnit[]): number | null {
  const middle = text.length / 2;
  if (units.length >= 2) {
    let best = units[1].start;
    for (const unit of units.slice(1)) {
      if (Math.abs(unit.start - middle) < Math.abs(best - middle)) best = unit.start;
    }
    return best;
  }
  let best: number | null = null;
  for (let i = 1; i < text.length - 1; i++) {
    if (/\s/.test(text[i]) && text.slice(0, i).trim() !== '' && text.slice(i).trim() !== '') {
      if (best === null || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
    }
  }
  return best === null ? null : best + 1;
}
