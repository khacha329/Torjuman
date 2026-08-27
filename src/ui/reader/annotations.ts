import type { Entity, EntityRange, InlineSpan, InlineSpanKind, Mark, MarkRange } from '../../types';

// Flattening every annotation layer over a block into non-overlapping segments.
//
// ---------------------------------------------------------------------------
// Why flattening rather than nesting.
//
// A single block can now carry, all at once:
//
//   1. block-type styling      (hadith_matn, takhrij, …)
//   2. parser inline runs      (Qurʾān, quoted lemma, emphasis)
//   3. entity tinting          (a resolved verse or hadith)
//   4. a skip mark             (background highlight)
//   5. a read mark             (underline)
//   6. the live browser selection
//
// These overlap arbitrarily — a read span inside a skip block is the *primary*
// use case, not an edge case — and overlapping ranges simply cannot be
// expressed as nested elements. Trying produces broken markup and, worse,
// breaks text selection across the seams.
//
// So every boundary any layer introduces is collected, sorted, and one element
// is emitted per gap carrying the union of the styles active over it. The DOM
// stays flat, selection works across the whole block, and adding a seventh
// layer later is one more field.
//
// The rendered characters are never touched. Selection anchors are resolved by
// counting characters in the block's text nodes, so a segment boundary must
// never insert, drop, or reorder anything.
// ---------------------------------------------------------------------------

export interface Segment {
  start: number;
  end: number;
  spanKind?: InlineSpanKind;
  entity?: Entity;
  /**
   * True only when this segment covers its entity whole. A subdivided entity
   * must not have `unicode-bidi: isolate` applied to each piece — that would
   * put one quotation into several isolates and change how it resolves.
   */
  entityWhole: boolean;
  skip?: Mark;
  read?: Mark;
  highlighted: boolean;
}

export interface AnnotationLayers {
  spans: InlineSpan[];
  entities: EntityRange[];
  marks: MarkRange[];
  highlight?: [start: number, end: number];
}

/** Drop overlaps among the parser's own runs so none renders twice. */
function flattenSpans(spans: InlineSpan[]): InlineSpan[] {
  const kept: InlineSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (span.end <= span.start) continue;
    if (kept.some((existing) => span.start < existing.end && existing.start < span.end)) {
      continue;
    }
    kept.push(span);
  }
  return kept;
}

export function flattenAnnotations(textLength: number, layers: AnnotationLayers): Segment[] {
  const spans = flattenSpans(layers.spans);

  const clamp = (value: number) => Math.max(0, Math.min(value, textLength));

  const cuts = new Set<number>([0, textLength]);
  for (const span of spans) {
    cuts.add(clamp(span.start));
    cuts.add(clamp(span.end));
  }
  for (const range of layers.entities) {
    cuts.add(clamp(range.start));
    cuts.add(clamp(range.end));
  }
  for (const range of layers.marks) {
    cuts.add(clamp(range.start));
    cuts.add(clamp(range.end));
  }
  if (layers.highlight) {
    cuts.add(clamp(layers.highlight[0]));
    cuts.add(clamp(layers.highlight[1]));
  }

  const boundaries = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end <= start) continue;

    const span = spans.find((candidate) => candidate.start <= start && candidate.end >= end);
    const entityRange = layers.entities.find(
      (candidate) => candidate.start <= start && candidate.end >= end,
    );

    // Span scope beats block scope, so a span mark wins where both apply. They
    // are tracked in separate channels anyway — highlight and underline — so
    // both still render; this only decides which mark object a segment reports
    // for each channel.
    const skip = pickMark(layers.marks, start, end, 'skip');
    const read = pickMark(layers.marks, start, end, 'read');

    segments.push({
      start,
      end,
      spanKind: span?.kind,
      entity: entityRange?.entity,
      entityWhole:
        entityRange !== undefined &&
        entityRange.start === start &&
        entityRange.end === end,
      skip,
      read,
      highlighted: layers.highlight
        ? layers.highlight[0] <= start && layers.highlight[1] >= end
        : false,
    });
  }

  return segments;
}

function pickMark(
  ranges: MarkRange[],
  start: number,
  end: number,
  kind: Mark['kind'],
): Mark | undefined {
  const covering = ranges.filter(
    (range) => range.mark.kind === kind && range.start <= start && range.end >= end,
  );
  if (covering.length === 0) return undefined;
  // Span scope is the more specific statement about this passage.
  return (covering.find((range) => range.mark.scope === 'span') ?? covering[0]).mark;
}

/**
 * The CSS classes for one segment.
 *
 * Each layer gets its own visual channel so they stay legible when stacked:
 *
 *   skip     background highlight  (plus a band in the right margin)
 *   read     underline in the accent colour
 *   entity   background tint, a distinct hue from skip
 *   spans    text colour and weight
 *
 * Skip and entity both use background and would collide, so skip is a warm
 * amber against the entity's cool green, and skip's real signal is the margin
 * band — which lets the background stay light enough that Arabic with harakāt
 * is still comfortable to read. The user may well still read a skipped passage
 * if he is asked about it.
 */
const SPAN_CLASS: Record<InlineSpanKind, string> = {
  quran: 'text-verse font-medium',
  quran_ref: 'text-verse/70 text-[0.8em] align-baseline',
  quote: 'text-ink/90',
  emphasis: 'font-bold',
};

export function classesFor(segment: Segment): string {
  const classes: string[] = [];

  if (segment.spanKind) classes.push(SPAN_CLASS[segment.spanKind]);

  if (segment.entity) {
    classes.push('entity-tint');
    classes.push(segment.entity.type === 'quran' ? 'entity-quran' : 'entity-hadith');
    if (segment.entityWhole) classes.push('entity-isolate');
  }

  if (segment.skip) classes.push('mark-skip');
  if (segment.read) classes.push('mark-read');

  return classes.join(' ');
}
