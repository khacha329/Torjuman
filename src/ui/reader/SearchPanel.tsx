import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { findInDisplayText, normalize, toArabicNumerals } from '../../lib/arabic';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import type { Block } from '../../types';
import { inputClass } from '../common';

export interface SearchResult {
  block: Block;
  range: [number, number] | null;
  context: string;
}

/**
 * Search over the current book.
 *
 * The query goes through exactly the same normalization as the text did at
 * ingest, so a word typed without harakāt finds the vocalised occurrences —
 * which is how anyone actually types Arabic.
 */
export function SearchPanel({
  bookId,
  pageMeta,
  onJump,
  onClose,
}: {
  bookId: string;
  pageMeta: Map<number, PageMeta>;
  onJump: (result: SearchResult) => void;
  onClose: () => void;
}) {
  const { storage } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  const run = useCallback(
    async (raw: string) => {
      const normalized = normalize(raw);
      if (normalized.length < 2) {
        setResults(null);
        return;
      }

      const id = ++requestId.current;
      setSearching(true);
      const hits = await storage.searchBlocks(bookId, normalized, 200);
      if (id !== requestId.current) return;

      setResults(
        hits.map((hit) => ({
          block: hit.block,
          range: findInDisplayText(hit.block.text, normalized),
          context: hit.block.text,
        })),
      );
      setSearching(false);
    },
    [storage, bookId],
  );

  useEffect(() => {
    const timer = setTimeout(() => void run(query), 250);
    return () => clearTimeout(timer);
  }, [query, run]);

  return (
    // LTR chrome holding RTL snippets; each snippet declares its own direction.
    <div dir="ltr" className="ltr-isolate flex h-full flex-col border-l border-rule bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-rule p-3">
        <input
          className={inputClass}
          dir="rtl"
          autoFocus
          placeholder="بحث في هذا الكتاب…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button onClick={onClose} className="rounded px-2 py-1 text-sm text-muted hover:bg-rule">
          Close
        </button>
      </div>

      <div className="shrink-0 border-b border-rule px-3 py-1.5 text-[11px] text-muted">
        {searching && 'Searching…'}
        {!searching && results && `${results.length} result${results.length === 1 ? '' : 's'}`}
        {!searching && !results && 'Diacritics are ignored — type the bare word.'}
      </div>

      <div className="flex-1 overflow-auto">
        {results?.map((result) => {
          const pageIndex = Number(result.block.pageId.split(':p')[1] ?? 0);
          const meta = pageMeta.get(pageIndex);

          return (
            <button
              key={result.block.id}
              onClick={() => onJump(result)}
              className="block w-full border-b border-rule/60 px-3 py-2.5 text-right hover:bg-parchment"
            >
              <p
                dir="rtl"
                lang="ar"
                className="arabic text-[15px] leading-relaxed"
                style={{ ['--reader-line-height' as string]: '1.9' }}
              >
                {renderExcerpt(result)}
              </p>
              <p dir="ltr" className="ltr-isolate mt-1 text-[11px] text-muted">
                {meta?.volume !== null && meta?.volume !== undefined && (
                  <bdi className="arabic-inline">ج{toArabicNumerals(meta.volume)}</bdi>
                )}{' '}
                {meta?.printPage !== null && meta?.printPage !== undefined && (
                  <bdi className="arabic-inline">ص{toArabicNumerals(meta.printPage)}</bdi>
                )}
              </p>
            </button>
          );
        })}

        {results?.length === 0 && (
          <p className="p-4 text-center text-sm text-muted">No matches.</p>
        )}
      </div>
    </div>
  );
}

/** A window of surrounding text with the match marked. */
function renderExcerpt(result: SearchResult) {
  const { context, range } = result;
  if (!range) return context.slice(0, 160) + (context.length > 160 ? '…' : '');

  const [start, end] = range;
  const from = Math.max(0, start - 70);
  const to = Math.min(context.length, end + 70);

  return (
    <>
      {from > 0 && '…'}
      {context.slice(from, start)}
      <mark className="rounded-sm bg-amber-200/70 text-ink">{context.slice(start, end)}</mark>
      {context.slice(end, to)}
      {to < context.length && '…'}
    </>
  );
}
