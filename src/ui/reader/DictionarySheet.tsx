import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { toArabicNumerals } from '../../lib/arabic';
import { BidiText } from '../../components/BidiText';
import type { LookupResult } from '../../dictionary/dictionaryService';
import type { WordGloss } from '../../types';
import { AnchoredPanel } from './AnchoredPanel';
import { Button, Spinner } from '../common';

export type GlossState =
  | { status: 'loading' }
  | { status: 'ready'; gloss: WordGloss }
  | { status: 'error'; message: string };

// The dictionary entry for a looked-up word.
//
// Arabic-Arabic throughout: this is a lexical entry, not a translation, and no
// English is generated for it. The offline entry is the deliverable; the
// "Translate this entry" action is clearly optional and is the only thing here
// that needs the network.

export function DictionarySheet({
  result,
  gloss,
  anchor,
  onClose,
  onTranslateEntry,
}: {
  result: LookupResult;
  /** The English gloss, when one has been asked for. */
  gloss: GlossState | null;
  anchor: HTMLElement;
  onClose: () => void;
  onTranslateEntry: (text: string) => void;
}) {
  const { settings } = useApp();
  const [selected, setSelected] = useState(0);

  const hit = result.hits[selected];
  const entryText = hit ? hit.blocks.map((block) => block.text).join('\n\n') : '';

  return (
    <AnchoredPanel
      anchor={anchor}
      onClose={onClose}
      // A lexical entry runs long, and a sheet can go near-full-height without
      // covering the word that was tapped.
      preferSheet
      title={
        <>
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium">
            Dictionary
          </span>
          {hit ? (
            <span className="arabic text-[15px] font-medium" dir="rtl" lang="ar">
              {hit.entry.rootDisplay}
            </span>
          ) : (
            <span className="arabic text-[15px]" dir="rtl" lang="ar">
              {result.surface}
            </span>
          )}
          {hit && (
            <span className="arabic text-[10px] text-muted" dir="rtl">
              {hit.entry.volume !== null && `ج${toArabicNumerals(hit.entry.volume)} `}
              {hit.entry.printPage !== null && `ص${toArabicNumerals(hit.entry.printPage)}`}
            </span>
          )}
        </>
      }
      footer={
        hit ? (
          <div className="flex items-center gap-2">
            <Button onClick={() => onTranslateEntry(entryText)}>Translate this entry</Button>
            <span className="text-[10px] text-muted">needs network</span>
          </div>
        ) : undefined
      }
    >
      {/* Meaning above Dictionary: brief English first, then the longer
          Arabic entry. Asking for one never prevents asking for the other. */}
      {gloss && (
        <section className="mb-4 rounded-md border border-accent/30 bg-accent/[0.04] p-3">
          <h4 className="mb-1.5 flex items-center gap-2 text-[10px] font-medium tracking-wide text-muted uppercase">
            Meaning
            {gloss.status === 'ready' && gloss.gloss.isTechnicalTerm && (
              <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] normal-case text-accent">
                technical term
              </span>
            )}
          </h4>

          {gloss.status === 'loading' && <Spinner label="Looking up…" />}

          {gloss.status === 'error' && (
            <p className="text-[12px] text-amber-900">{gloss.message}</p>
          )}

          {gloss.status === 'ready' && (
            <>
              <p dir="ltr" className="ltr-isolate text-[13px] leading-relaxed">
                <BidiText>{gloss.gloss.meaning}</BidiText>
              </p>
              {gloss.gloss.root && (
                <p className="mt-1.5 text-[11px] text-muted">
                  Root:{' '}
                  <bdi className="arabic-inline" dir="rtl">
                    {gloss.gloss.root}
                  </bdi>
                </p>
              )}
              {gloss.gloss.note && (
                <p dir="ltr" className="ltr-isolate mt-1 text-[11px] text-muted italic">
                  <BidiText>{gloss.gloss.note}</BidiText>
                </p>
              )}
            </>
          )}
        </section>
      )}

      {gloss && result.hits.length > 0 && (
        <h4 className="mb-1.5 text-[10px] font-medium tracking-wide text-muted uppercase">
          Dictionary
        </h4>
      )}

      {result.hits.length === 0 ? (
        <div className="text-sm">
          <p className="mb-1 font-medium">No entry found</p>
          <p className="text-muted">
            Neither the root index nor a full-text search of the dictionary matched{' '}
            <bdi className="arabic-inline">{result.surface}</bdi>. Nothing is guessed here —
            try translating the passage instead.
          </p>
        </div>
      ) : (
        <>
          {/* More than one candidate root matched. The user reads Arabic and
              can judge which entry applies far better than a heuristic can, so
              all of them are offered rather than one being picked. */}
          {result.hits.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {result.hits.map((candidate, index) => (
                <button
                  key={candidate.entry.id}
                  onClick={() => setSelected(index)}
                  className={`arabic rounded-full border px-2.5 py-1 text-[14px] ${
                    index === selected
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-rule hover:bg-parchment'
                  }`}
                  dir="rtl"
                  lang="ar"
                >
                  {candidate.entry.rootDisplay}
                </button>
              ))}
            </div>
          )}

          {result.viaFullText && (
            <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              No root matched directly. These entries mention the word in their text.
            </p>
          )}

          {/* The reader's own Arabic typography, so an entry is as readable as
              the main text. */}
          <div
            dir="rtl"
            lang="ar"
            className="arabic whitespace-pre-line"
            style={{
              fontFamily: `'${settings.fontFamily}', 'Amiri', serif`,
              fontSize: Math.max(18, settings.fontSize - 4),
              ['--reader-line-height' as string]: String(settings.lineHeight),
            }}
          >
            {entryText}
          </div>
        </>
      )}
    </AnchoredPanel>
  );
}
