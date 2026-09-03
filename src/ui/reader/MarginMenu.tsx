import { useEffect, useRef } from 'react';
import type { Block, Mark } from '../../types';

/** Long-press menu on the block margin. */
export function MarginMenu({
  block,
  anchor,
  current,
  onSkip,
  onRead,
  onClear,
  onAddNote,
  onTranslateAll,
  onClose,
}: {
  block: Block;
  anchor: HTMLElement;
  current: Mark | undefined;
  onSkip: (block: Block) => void;
  onRead: (block: Block) => void;
  onClear: (block: Block) => void;
  onAddNote: (block: Block) => void;
  /** Only offered on a ḥadīth's own matn: see the guard below. */
  onTranslateAll: (block: Block) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const timer = setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    document.addEventListener('keydown', onEscape);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [onClose]);

  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left - 150), window.innerWidth - 172);
  const top = Math.min(Math.max(8, rect.top), window.innerHeight - 200);

  const item =
    'block w-full rounded px-2 py-2 text-left text-[13px] hover:bg-parchment';

  return (
    <div
      ref={ref}
      dir="ltr"
      role="menu"
      className="ltr-isolate fixed z-50 w-40 rounded-lg border border-rule bg-white p-1 shadow-xl"
      style={{ left, top }}
    >
      <button
        className={item}
        onClick={() => {
          onSkip(block);
          onClose();
        }}
      >
        <span className="rounded-sm bg-[#d9a441]/40 px-1">Skip</span>
      </button>
      <button
        className={item}
        onClick={() => {
          onRead(block);
          onClose();
        }}
      >
        <span className="underline decoration-accent decoration-2 underline-offset-4">
          Read
        </span>
      </button>
      <button
        className={item}
        onClick={() => {
          onAddNote(block);
          onClose();
        }}
      >
        {current?.note ? 'Edit note…' : 'Add note…'}
      </button>
      {/* Only on a matn block. The action translates one ḥadīth's commentary,
          and that range is defined by starting at a matn — offering it beside
          an arbitrary paragraph would have no range to mean. */}
      {block.type === 'hadith_matn' && (
        <button
          className={`${item} border-t border-rule`}
          onClick={() => {
            onTranslateAll(block);
            onClose();
          }}
        >
          Translate all…
        </button>
      )}
      <button
        className={`${item} text-muted disabled:opacity-40`}
        disabled={!current}
        onClick={() => {
          onClear(block);
          onClose();
        }}
      >
        Clear
      </button>
    </div>
  );
}
