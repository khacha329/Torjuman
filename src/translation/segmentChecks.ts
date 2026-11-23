// A check on a model's segments that ends in a note on the card rather than
// a silent repair.
//
// From a real Gemini Flash-Lite card (see the comment at the top of
// sourceUnits.ts). Its piece numbers drifted one piece late, and the app
// clamped the overflow onto the last piece without a word, so English sat
// beside the wrong Arabic and nothing on the card said so. Cutting the pieces
// better makes that rarer; this says so when it happens anyway, so a card that
// needs retranslating can be told from one that does not. (The same card's
// ḥadīth segment ran on into the commentary; that is noted where the ḥadīth
// is looked up, retrieval/quotationOverrun.ts, since only the lookup knows
// whether it mattered.)

export interface PieceSequenceProblem {
  detail: string;
  /**
   * The numbers ran past the last piece. On the owner's card this was the
   * only visible sign: an extra segment early on kept the numbering in order
   * but one piece late, and only the overflow at the end showed it.
   */
  overran: boolean;
}

/**
 * What is wrong with one segment's piece numbers, given where the segment
 * before it ended, or null when they follow on. Each segment should start at
 * the piece after the previous one's last, inside 1..pieceCount, in order.
 * `previousTo` is the highest piece the model's own previous records named
 * (0 for the first), not the clamped one: after one slip, a model that
 * carries on from its own numbering is flagged once, not on every later
 * segment.
 */
export function pieceSequenceProblem(
  previousTo: number,
  from: unknown,
  to: unknown,
  pieceCount: number,
): PieceSequenceProblem | null {
  const problem = (detail: string, overran = false) => ({ detail, overran });
  if (typeof from !== 'number' || typeof to !== 'number') return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const outside = [from, to].find((n) => n < 1 || n > pieceCount);
  if (outside !== undefined) {
    return problem(
      `it names piece ${outside}, and the passage has pieces 1–${pieceCount}`,
      outside > pieceCount,
    );
  }
  if (from > to) return problem(`it names pieces ${from} to ${to}, backwards`);
  if (from <= previousTo) {
    return problem(`it starts at piece ${from}, which the segment before already covered`);
  }
  if (from > previousTo + 1) {
    return problem(
      from === previousTo + 2
        ? `piece ${previousTo + 1} is in no segment`
        : `pieces ${previousTo + 1}–${from - 1} are in no segment`,
    );
  }
  return null;
}

/** The note a segment gets for a sequence problem. */
export function pieceSequenceNote(problem: PieceSequenceProblem): string {
  return problem.overran
    ? `The model's piece numbers ran past the end of the passage (${problem.detail}), ` +
        'so this English, and possibly the English of the segments before it, may sit ' +
        'beside the wrong Arabic.'
    : `The model's piece numbers are out of order here (${problem.detail}), ` +
        'so this English may sit beside the wrong Arabic.';
}
