import { Fragment, type ReactNode } from 'react';
import type { Block, EntityRange, MarkRange } from '../../types';
import { classesFor, flattenAnnotations } from './annotations';

// Renders a block's display text with every annotation layer applied.
//
// CRITICAL: the rendered text content must equal Block.text exactly, character
// for character. Selection offsets are resolved by walking the DOM text nodes
// and counting characters (see selection.ts), so injecting a separator, a
// marker, or even a stray space would silently shift every anchor in the block
// and mis-anchor the user's cards and marks.
//
// Layers overlap arbitrarily, so they are flattened into non-overlapping
// segments rather than nested — see annotations.ts for why nesting cannot work
// here. One element per segment, carrying the union of the styles over it.

export function BlockText({
  block,
  entities = [],
  marks = [],
  highlight,
}: {
  block: Block;
  /** This block's share of each resolved entity. */
  entities?: EntityRange[];
  /** This block's share of each reading mark. */
  marks?: MarkRange[];
  /** Display-text offsets of a search match to mark, if any. */
  highlight?: [start: number, end: number];
}) {
  const segments = flattenAnnotations(block.text.length, {
    spans: block.spans,
    entities,
    marks,
    highlight,
  });

  const parts: ReactNode[] = [];

  for (const segment of segments) {
    const slice = block.text.slice(segment.start, segment.end);
    const classes = classesFor(segment);

    let content: ReactNode = slice;
    if (segment.highlighted) {
      content = <mark className="rounded-sm bg-amber-200/70 text-ink">{slice}</mark>;
    }

    if (classes === '' && !segment.entity) {
      parts.push(<Fragment key={segment.start}>{content}</Fragment>);
      continue;
    }

    parts.push(
      <span
        key={segment.start}
        className={classes}
        // Plain spans, deliberately — not buttons. A button would swallow the
        // pointer events a long-press drag needs, and free selection over and
        // across entities and marks has to keep working. Taps are handled at
        // the block level, and only when the selection came back collapsed.
        {...(segment.entity
          ? {
              'data-entity-id': segment.entity.id,
              role: 'button',
              tabIndex: 0,
              'aria-label':
                segment.entity.type === 'quran'
                  ? `Qurʾān ${segment.entity.label ?? segment.entity.reference}`
                  : segment.entity.type === 'narrator'
                    ? `Narrator ${segment.entity.label ?? segment.entity.reference}`
                    : `Ḥadīth ${segment.entity.reference}`,
            }
          : {})}
      >
        {content}
      </span>,
    );
  }

  return <>{parts}</>;
}
