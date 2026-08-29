import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { entryBlocks, lookupName } from '../../biography/service';
import type { BiographyHit, BiographyLookup } from '../../biography/lookup';
import type { Block } from '../../types';
import { AnchoredPanel } from './AnchoredPanel';
import { Spinner } from '../common';

// The sheet that opens when a selected name is looked up.
//
// ---------------------------------------------------------------------------
// Retrieval, and nothing else
//
// Every word of Arabic below comes verbatim out of a book the user imported.
// Nothing is summarised, nothing is generated, and no model is called at any
// point — not for the lookup, not for the ranking, not for the display. The
// ranking is a table lookup on how specific the matched alias was.
//
// Ambiguity is the normal case and is never resolved for the reader. Many
// scholars share a name; «عمر» is dozens of people. So every match is shown,
// grouped by the work it came from and labelled with its ج/ص, and the reader
// decides which is meant. Presenting one confident answer that happens to be
// the wrong Muḥammad is worse than presenting four and asking.
// ---------------------------------------------------------------------------

const MATCH_LABELS: Record<string, string> = {
  full: 'full name',
  'ism-nasab': 'name and father',
  kunya: 'kunya',
  nisba: 'nisba',
  ism: 'first name only',
};

export function BiographySheet({
  selection,
  anchor,
  onClose,
}: {
  selection: string;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const { storage } = useApp();
  const [result, setResult] = useState<BiographyLookup | null>(null);
  const [chosen, setChosen] = useState<BiographyHit | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setChosen(null);
    void lookupName(storage, selection).then((found) => {
      if (cancelled) return;
      setResult(found);
      // Pre-select only when there is exactly one candidate. With more than one
      // the reader picks, which is the whole point.
      setChosen(found.total === 1 ? found.groups[0].hits[0] : null);
    });
    return () => {
      cancelled = true;
    };
  }, [selection, storage]);

  useEffect(() => {
    if (!chosen) {
      setBlocks(null);
      return;
    }
    let cancelled = false;
    setBlocks(null);
    void entryBlocks(storage, chosen.entry.bookId, chosen.entry.pageIndex).then((found) => {
      if (!cancelled) setBlocks(found);
    });
    return () => {
      cancelled = true;
    };
  }, [chosen, storage]);

  return (
    <AnchoredPanel
      anchor={anchor}
      onClose={onClose}
      preferSheet
      title={
        <>
          <span className="rounded-full bg-rule/60 px-2 py-0.5 text-[10px] font-medium">
            Biography
          </span>
          <span dir="rtl" lang="ar" className="arabic text-[13px] font-medium">
            {chosen ? chosen.entry.name : selection}
          </span>
          {chosen && (
            <span className="text-[10px] text-muted">
              ج{chosen.entry.volume} · ص{chosen.entry.printPage}
            </span>
          )}
        </>
      }
    >
      {!result && <Spinner label="Searching the imported works…" />}

      {result && result.total === 0 && (
        <div className="text-[12px] text-muted">
          <p>
            No entry for{' '}
            <span dir="rtl" lang="ar" className="arabic text-[14px] text-ink">
              {selection}
            </span>{' '}
            in the biographical works on this device.
          </p>
          {/* Nothing is guessed here. A nearest match would be a different
              person, which is worse than no answer. */}
          <p className="mt-2">
            No nearest match is offered — a name that is close is a different
            person. Try a shorter form of the name, or add another work in{' '}
            <button className="underline" onClick={() => navigate({ name: 'settings' })}>
              Settings → Add from catalog
            </button>
            .
          </p>
        </div>
      )}

      {result && result.total > 0 && (
        <>
          {/* The selector. Grouped by work, because which book an entry is
              from is part of judging it — al-Iṣāba and Usd al-Ghāba cover
              Companions, Siyar covers scholars broadly. */}
          {result.total > 1 && (
            <div className="mb-3 max-h-52 overflow-y-auto rounded-md border border-rule">
              {result.groups.map((group) => (
                <div key={group.bookId}>
                  <p
                    dir="rtl"
                    lang="ar"
                    className="arabic sticky top-0 bg-parchment px-2.5 py-1 text-[11px] text-muted"
                  >
                    {group.bookTitle} · {group.hits.length}
                  </p>
                  <ul className="divide-y divide-rule/60">
                    {group.hits.map((hit) => (
                      <li key={hit.entry.id}>
                        <button
                          onClick={() => setChosen(hit)}
                          className={`flex w-full flex-wrap items-baseline gap-x-2 px-2.5 py-1.5 text-start transition ${
                            chosen?.entry.id === hit.entry.id
                              ? 'bg-accent/10'
                              : 'hover:bg-rule/30'
                          }`}
                        >
                          <span dir="rtl" lang="ar" className="arabic flex-1 text-[14px]">
                            {hit.entry.name}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted">
                            ج{hit.entry.volume} · ص{hit.entry.printPage}
                          </span>
                          {/* Why this row matched. A row that matched on the
                              first name alone is far weaker evidence than one
                              that matched the full name, and saying so is what
                              lets the reader discriminate. */}
                          <span className="shrink-0 text-[10px] text-muted">
                            {hit.exact ? 'exact' : MATCH_LABELS[hit.matchedAs] ?? hit.matchedAs}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {result.total > 1 && !chosen && (
            <p className="text-[12px] text-muted">
              {result.total} people match{' '}
              <span dir="rtl" lang="ar" className="arabic text-[14px] text-ink">
                {selection}
              </span>
              . Choose one above — none is picked for you, because a name this
              short belongs to several.
            </p>
          )}

          {chosen && blocks === null && <Spinner label="Reading the entry…" />}

          {chosen && blocks !== null && blocks.length === 0 && (
            <p className="text-[12px] text-muted">
              This entry is on page {chosen.entry.pageIndex} of{' '}
              <span dir="rtl" lang="ar" className="arabic">
                {result.groups.find((g) => g.bookId === chosen.entry.bookId)?.bookTitle}
              </span>
              , which has not been fetched yet. Finish importing that book and it
              will read offline.
            </p>
          )}

          {chosen && blocks !== null && blocks.length > 0 && (
            <div
              dir="rtl"
              lang="ar"
              className="arabic space-y-2 text-[16px] leading-loose"
              style={{ ['--reader-line-height' as string]: '2.0' }}
            >
              {blocks.map((block) => (
                <p key={block.id}>{block.text}</p>
              ))}
            </div>
          )}

          {chosen && (
            <p className="mt-3 border-t border-rule pt-2 text-[10px] text-muted">
              Shown verbatim from the imported work. Nothing on this panel is
              summarised or model-generated.
            </p>
          )}
        </>
      )}
    </AnchoredPanel>
  );
}
