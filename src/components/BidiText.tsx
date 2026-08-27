import { Fragment, type ReactNode } from 'react';

// Isolating Arabic runs inside English text.
//
// The bug this fixes has two compounding causes, and fixing either alone leaves
// text that is still wrong:
//
//  1. `dir="rtl"` is inherited. The reader pane is correctly RTL for Arabic
//     source, but that direction leaks into English UI chrome and English
//     translation output. Every container holding English sets dir="ltr"
//     explicitly — see the `Ltr` helper below.
//
//  2. Even inside a correct dir="ltr" container, the Unicode Bidirectional
//     Algorithm resolves *neutral* characters — spaces, parentheses, dashes,
//     commas, colons — from their surrounding context. An Arabic run followed
//     immediately by "(" drags that parenthesis, and often the text after it,
//     into the RTL run. That is why fixing only (1) gives text that reads
//     mostly right but with punctuation scrambled around every Arabic term.
//
// <bdi> is purpose-built for (2): it *isolates* the embedded run so its
// directionality cannot affect the surrounding text. <span dir="rtl"> is not a
// substitute — that embeds rather than isolates, and leaves the neutral
// character problem exactly where it was.

const ARABIC =
  '[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]';

/**
 * One Arabic run, including the spaces between Arabic words.
 *
 * The trailing alternation is the important part. Without it a multi-word
 * phrase like the ṣalawāt is split into five separate isolates, and five
 * adjacent isolates render in the wrong word order. Keeping a whole phrase in
 * one <bdi> is what makes the honorifics come out right — they are the longest
 * Arabic runs in this corpus and expose any regex mistake immediately.
 *
 * The Arabic block already covers the harakāt (U+064B–U+065F, U+0670), so
 * diacritics inside a run are preserved rather than breaking it in two.
 *
 * Built from escapes rather than literal ranges on purpose: a literal NBSP or
 * an invisible character inside a character class cannot be reviewed by eye and
 * is trivially corrupted in transit.
 */
const ARABIC_RUN = new RegExp(`${ARABIC}+(?:[ \\u00A0]+${ARABIC}+)*`, 'g');

/**
 * Renders a string, wrapping each Arabic run in <bdi>.
 *
 * A string with no Arabic in it comes through unchanged, so a card containing
 * no Arabic renders exactly as it did before.
 */
export function BidiText({ children }: { children: string | null | undefined }) {
  const text = children ?? '';
  if (text === '') return null;

  // The regex is /g and module-scoped, so its lastIndex must be reset.
  ARABIC_RUN.lastIndex = 0;

  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = ARABIC_RUN.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(<Fragment key={key++}>{text.slice(cursor, match.index)}</Fragment>);
    }
    parts.push(
      <bdi key={key++} lang="ar" className="arabic-inline">
        {match[0]}
      </bdi>,
    );
    cursor = match.index + match[0].length;
  }

  if (parts.length === 0) return <>{text}</>;
  if (cursor < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  }

  return <>{parts}</>;
}

/** Split a string into runs. Exported so the behaviour can be tested in Node. */
export function splitBidiRuns(text: string): { arabic: boolean; text: string }[] {
  ARABIC_RUN.lastIndex = 0;
  const runs: { arabic: boolean; text: string }[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = ARABIC_RUN.exec(text)) !== null) {
    if (match.index > cursor) {
      runs.push({ arabic: false, text: text.slice(cursor, match.index) });
    }
    runs.push({ arabic: true, text: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) runs.push({ arabic: false, text: text.slice(cursor) });
  return runs;
}

/**
 * An explicitly left-to-right container for English content.
 *
 * Direction is never inherited anywhere in this app — it is set at each
 * boundary. `unicode-bidi: isolate` (in index.css) is a backstop that stops
 * direction leaking across sibling elements; it does not replace <bdi>, because
 * inline runs still need per-run isolation.
 */
export function Ltr({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'p' | 'span' | 'section' | 'label' | 'li';
}) {
  return (
    <Tag dir="ltr" className={`ltr-isolate ${className}`}>
      {children}
    </Tag>
  );
}
