import type { SharhCard } from '../../types';

// A ḥadīth's commentary, retrieved from an imported sharḥ.
//
// Arabic only, and deliberately so. Nothing on this card has been translated,
// summarised or generated — it is a passage from a book the reader imported,
// located by searching that book for the ḥadīth's own words. Translating it
// here would blur the one distinction the card exists to make: this is what the
// commentator wrote, not what a model made of it. The panel's own translation
// action remains available over the same range for anyone who wants English.
//
// The match strength is on the face of the card rather than buried. A passage
// found by two shingles and one found by nine are both shown, and the reader is
// entitled to know which one they are looking at before quoting it in a lesson.

export function SharhCardView({
  card,
  isActive,
  citation,
  onFocus,
  onToggleCollapse,
  onDelete,
}: {
  card: SharhCard;
  isActive: boolean;
  citation?: string;
  onFocus: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
}) {
  const frame = `ltr-isolate rounded-lg border transition ${
    isActive
      ? 'border-verse shadow-md'
      : 'border-verse/35 bg-verse/[0.03] shadow-sm hover:border-verse/55'
  }`;

  const confidence = `${card.shingleHits} of ${card.shinglesTried} passages matched`;

  if (card.collapsed) {
    return (
      <article dir="ltr" className={`${frame} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
            aria-label="Expand commentary"
          >
            ▸
          </button>
          <button onClick={onFocus} className="min-w-0 flex-1 truncate text-left text-[12px]">
            {card.sourceBookTitle}
          </button>
          {citation && (
            <span className="arabic shrink-0 text-[10px] text-muted" dir="rtl">
              {citation}
            </span>
          )}
          <span className="shrink-0 rounded-full bg-verse/15 px-1.5 py-0.5 text-[9px] font-medium text-verse">
            Sharḥ
          </span>
        </div>
      </article>
    );
  }

  return (
    <article dir="ltr" className={`${frame} p-3`}>
      <header className="mb-2 flex flex-wrap items-baseline gap-2">
        <button
          onClick={onToggleCollapse}
          className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
          aria-label="Collapse commentary"
        >
          ▾
        </button>
        <span className="rounded-full bg-verse/15 px-1.5 py-0.5 text-[9px] font-medium text-verse">
          Sharḥ
        </span>
        <button onClick={onFocus} className="min-w-0 flex-1 text-left text-[12px] font-medium">
          {card.sourceBookTitle}
        </button>
        {citation && (
          <span className="arabic shrink-0 text-[10px] text-muted" dir="rtl">
            {citation}
          </span>
        )}
        <button
          onClick={onDelete}
          className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
          aria-label="Delete commentary card"
        >
          ×
        </button>
      </header>

      {/* The matn as the commentary itself prints it, which is not always
          word-for-word what the reader's own book prints. Showing it is what
          lets them confirm the right ḥadīth was found. */}
      <p
        dir="rtl"
        lang="ar"
        className="arabic mb-2 rounded-md bg-matn px-2.5 py-2 text-[15px] leading-loose"
        style={{ ['--reader-line-height' as string]: '2.0' }}
      >
        {card.matnText}
      </p>

      <div
        dir="rtl"
        lang="ar"
        className="arabic space-y-2 text-[16px] leading-loose"
        style={{ ['--reader-line-height' as string]: '2.0' }}
      >
        {card.passages.map((passage, index) => (
          <p key={index}>{passage}</p>
        ))}
      </div>

      {card.truncated && (
        <p className="mt-2 text-[10px] text-muted">
          A long commentary, cut off here. Open the work itself to read the rest.
        </p>
      )}

      <p className="mt-3 border-t border-rule pt-2 text-[10px] text-muted">
        Verbatim from {card.sourceBookTitle}; {confidence}. Nothing on this card is
        translated or model-generated.
      </p>
    </article>
  );
}
