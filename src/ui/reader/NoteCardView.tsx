import { BidiText } from '../../components/BidiText';
import type { NoteCard } from '../../types';

// A mark that carries a note, shown in the card panel.
//
// It shares the collapse behaviour, the inline margin marker and the panel
// scoping with translation cards, because all three are implemented against the
// shared anchor fields rather than against any one card kind.

export function NoteCardView({
  card,
  isActive,
  citation,
  onFocus,
  onToggleCollapse,
  onEditNote,
  onDelete,
}: {
  card: NoteCard;
  isActive: boolean;
  citation?: string;
  onFocus: () => void;
  onToggleCollapse: () => void;
  onEditNote: () => void;
  onDelete: () => void;
}) {
  const tone =
    card.markKind === 'skip'
      ? 'border-[#d9a441]/50 bg-[#d9a441]/[0.06]'
      : 'border-accent/40 bg-accent/[0.04]';

  const frame = `ltr-isolate rounded-lg border transition ${
    isActive ? 'border-accent shadow-md' : `${tone} shadow-sm hover:border-accent/50`
  }`;

  const badge = (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
        card.markKind === 'skip'
          ? 'bg-[#d9a441]/25 text-[#7a5a12]'
          : 'bg-accent/15 text-accent'
      }`}
    >
      {card.markKind === 'skip' ? 'Skip' : 'Read'}
    </span>
  );

  if (card.collapsed) {
    return (
      <article dir="ltr" className={`${frame} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
            aria-label="Expand note"
          >
            ▸
          </button>
          <button onClick={onFocus} className="min-w-0 flex-1 truncate text-left text-[12px]">
            <BidiText>{card.note}</BidiText>
          </button>
          {citation && (
            <span className="arabic shrink-0 text-[10px] text-muted" dir="rtl">
              {citation}
            </span>
          )}
          {badge}
        </div>
      </article>
    );
  }

  return (
    <article dir="ltr" onClick={onFocus} className={`${frame} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse();
          }}
          className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
          aria-label="Collapse note"
        >
          ▾
        </button>
        {badge}
        {citation && (
          <span className="arabic text-[10px] text-muted" dir="rtl">
            {citation}
          </span>
        )}
      </div>

      <p
        dir="rtl"
        lang="ar"
        className="arabic mb-2 max-h-20 overflow-hidden text-[14px] leading-loose text-muted"
        style={{ ['--reader-line-height' as string]: '1.9' }}
      >
        {card.sourceText}
      </p>

      <p dir="ltr" className="ltr-isolate text-[13px] leading-relaxed">
        <BidiText>{card.note}</BidiText>
      </p>

      <footer className="mt-3 flex items-center gap-2 border-t border-rule pt-2 text-[11px]">
        <button onClick={onEditNote} className="rounded px-2 py-1 text-muted hover:bg-rule">
          Edit note
        </button>
        <button
          onClick={onDelete}
          className="ml-auto rounded px-2 py-1 text-red-700 hover:bg-red-50"
        >
          Remove mark
        </button>
      </footer>
    </article>
  );
}
