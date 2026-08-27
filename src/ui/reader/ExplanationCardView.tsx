import { BidiText } from '../../components/BidiText';
import { toArabicNumerals } from '../../lib/arabic';
import type { ExplanationCard } from '../../types';
import { Spinner } from '../common';

// An answer to "what does this phrase mean as a concept", attached beneath the
// translation it hangs from.
//
// It never modifies that translation. Deleting it leaves the parent untouched.

export function ExplanationCardView({
  card,
  isActive,
  onFocus,
  onToggleCollapse,
  onDelete,
}: {
  card: ExplanationCard;
  isActive: boolean;
  onFocus: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
}) {
  const frame = `ltr-isolate rounded-lg border border-l-4 transition ${
    isActive
      ? 'border-accent border-l-accent shadow-md'
      : 'border-rule border-l-verse/60 shadow-sm hover:border-accent/40'
  }`;

  const badge = (
    <span className="shrink-0 rounded-full bg-verse/10 px-1.5 py-0.5 text-[9px] font-medium text-verse">
      Explanation
    </span>
  );

  if (card.collapsed) {
    return (
      <article dir="ltr" className={`${frame} bg-white px-3 py-2`}>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
            aria-label="Expand explanation"
          >
            ▸
          </button>
          <button onClick={onFocus} className="min-w-0 flex-1 truncate text-left text-[12px]">
            <BidiText>{card.query}</BidiText>
          </button>
          {badge}
        </div>
      </article>
    );
  }

  return (
    <article dir="ltr" onClick={onFocus} className={`${frame} bg-white p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse();
          }}
          className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
          aria-label="Collapse explanation"
        >
          ▾
        </button>
        {badge}
      </div>

      <p
        dir="rtl"
        lang="ar"
        className="arabic mb-3 text-[16px] leading-loose"
        style={{ ['--reader-line-height' as string]: '1.9' }}
      >
        {card.query}
      </p>

      {card.status === 'loading' && <Spinner label="Researching…" />}

      {card.status === 'error' && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-[12px] text-red-900">
          {card.error}
        </p>
      )}

      {card.status === 'complete' && (
        <>
          <p dir="ltr" className="ltr-isolate text-[13px] leading-relaxed">
            <BidiText>{card.explanation}</BidiText>
          </p>

          {/* Local sources first: they are the higher-quality material, they
              are offline, and they cite to a ج/ص the user can turn to. */}
          {card.localSources.length > 0 && (
            <section className="mt-3">
              <h4 className="mb-1.5 text-[10px] font-medium tracking-wide text-muted uppercase">
                From your library
              </h4>
              <ul className="space-y-1.5">
                {card.localSources.map((source, index) => (
                  <li
                    key={index}
                    className="rounded-md border border-rule bg-parchment px-2 py-1.5"
                  >
                    <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[10px] text-muted">
                      <span className="arabic" dir="rtl">
                        {source.bookTitle}
                      </span>
                      <span className="arabic" dir="rtl">
                        {source.volume !== null && `ج${toArabicNumerals(source.volume)} `}
                        {source.printPage !== null && `ص${toArabicNumerals(source.printPage)}`}
                      </span>
                    </div>
                    <p
                      dir="rtl"
                      lang="ar"
                      className="arabic text-[14px] leading-relaxed"
                      style={{ ['--reader-line-height' as string]: '1.8' }}
                    >
                      {source.excerpt}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Web sources are the weaker material and are marked as such. Every
              claim carries a link; excerpts stay brief because this card points
              at sources rather than replacing them. */}
          {card.webSources.length > 0 && (
            <section className="mt-3">
              <h4 className="mb-1.5 flex items-center gap-2 text-[10px] font-medium tracking-wide text-muted uppercase">
                From the web
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] normal-case text-amber-900">
                  unverified
                </span>
              </h4>
              <ul className="space-y-1.5">
                {card.webSources.map((source, index) => (
                  <li key={index} className="rounded-md border border-amber-200/70 px-2 py-1.5">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] font-medium text-accent underline"
                    >
                      {source.title}
                    </a>
                    <span className="ml-1.5 text-[10px] text-muted">{source.siteName}</span>
                    <p dir="ltr" className="ltr-isolate mt-1 text-[12px] leading-relaxed text-muted">
                      <BidiText>{source.excerpt}</BidiText>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <footer className="mt-3 flex items-center gap-2 border-t border-rule pt-2 text-[11px]">
        <span className="text-[10px] text-muted">
          {card.model}
          {card.costUsd ? ` · $${card.costUsd.toFixed(4)}` : ''}
        </span>
        <button
          onClick={onDelete}
          className="ml-auto rounded px-2 py-1 text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </footer>
    </article>
  );
}
