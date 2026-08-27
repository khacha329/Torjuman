import { useState } from 'react';
import { BidiText } from '../../components/BidiText';
import type { ProviderId, TranslatedSegment, TranslationCard } from '../../types';
import { modelsFor } from '../../translation/models';
import { OFFLINE_MODELS } from '../../translation/offline/OfflineProvider';
import { allProviders, badgeFor, providerFor } from '../../translation/registry';
import { Spinner } from '../common';

const SEGMENT_STYLE: Record<TranslatedSegment['type'], { label: string; frame: string }> = {
  quran: { label: 'Qurʾān', frame: 'border-l-2 border-verse/50 bg-verse/5' },
  hadith: { label: 'Ḥadīth', frame: 'border-l-2 border-accent/50 bg-matn' },
  poetry: { label: 'Poetry', frame: 'border-l-2 border-muted/40 bg-rule/20' },
  prose: { label: '', frame: '' },
};

export function TranslationCardView({
  card,
  streamingText,
  isStale,
  isActive,
  citation,
  onFocus,
  onToggleCollapse,
  onRetranslate,
  onDelete,
  onAddGlossaryTerm,
}: {
  card: TranslationCard;
  streamingText?: string;
  isStale: boolean;
  isActive: boolean;
  /** ج/ص for the card's anchor, shown on the collapsed header row. */
  citation?: string;
  onFocus: () => void;
  onToggleCollapse: () => void;
  onRetranslate: (options?: { providerId?: ProviderId; model?: string }) => void;
  onDelete: () => void;
  onAddGlossaryTerm: (term: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showRetranslateMenu, setShowRetranslateMenu] = useState(false);

  const englishText = card.segments
    .map((segment) => segment.english)
    .filter(Boolean)
    .join('\n\n');

  const copyEnglish = async () => {
    try {
      await navigator.clipboard.writeText(englishText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const uncertainTerms = [
    ...new Set(card.segments.flatMap((segment) => segment.uncertainTerms ?? [])),
  ];

  const frame = `ltr-isolate rounded-lg border bg-white transition ${
    isActive ? 'border-accent shadow-md' : 'border-rule shadow-sm hover:border-accent/40'
  }`;

  // Collapsed cards stay visible as a compact row rather than disappearing.
  // The row carries enough to identify the card — the opening words of the
  // Arabic, its ج/ص, and which provider produced it — so the panel remains a
  // usable navigation surface without expanding anything.
  if (card.collapsed) {
    return (
      <article dir="ltr" className={`${frame} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
            aria-label="Expand card"
            title="Expand"
          >
            ▸
          </button>
          <button onClick={onFocus} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              dir="rtl"
              lang="ar"
              className="arabic min-w-0 flex-1 truncate text-right text-[14px]"
            >
              {card.sourceText}
            </span>
          </button>
          {citation && (
            <span className="arabic shrink-0 text-[10px] text-muted" dir="rtl">
              {citation}
            </span>
          )}
          <CompactBadge card={card} />
        </div>
      </article>
    );
  }

  return (
    // The whole card is English UI. Direction is set explicitly here rather
    // than inherited — the reader pane around it is dir="rtl".
    <article dir="ltr" onClick={onFocus} className={`${frame} p-4`}>
      <div className="mb-1 flex items-start gap-2">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse();
          }}
          className="shrink-0 rounded px-1 text-xs text-muted hover:bg-rule"
          aria-label="Collapse card"
          title="Collapse"
        >
          ▾
        </button>
        <div className="min-w-0 flex-1">
          <ProviderBadge card={card} />
        </div>
      </div>

      {/* Arabic source: its own RTL island. */}
      <p
        dir="rtl"
        lang="ar"
        className="arabic mt-2 mb-3 max-h-28 overflow-hidden text-[15px] leading-loose text-muted"
        style={{ ['--reader-line-height' as string]: '1.9' }}
      >
        {card.sourceText}
      </p>

      {card.status === 'loading' && (
        <div className="rounded-md border border-rule bg-parchment p-3">
          <Spinner label="Translating…" />
          {streamingText && (
            <pre className="mt-2 max-h-40 overflow-auto text-[11px] leading-snug whitespace-pre-wrap text-muted">
              {streamingText.slice(-800)}
            </pre>
          )}
        </div>
      )}

      {card.status === 'error' && (
        <ErrorPanel card={card} onRetry={() => onRetranslate()} />
      )}

      {card.status === 'complete' && (
        <div className="space-y-3">
          {card.segments.map((segment, index) => (
            <SegmentView key={index} segment={segment} />
          ))}
        </div>
      )}

      {uncertainTerms.length > 0 && (
        <div className="mt-3 border-t border-rule pt-3">
          <p className="mb-1.5 text-[11px] text-muted">
            Terms the model flagged as candidates for the glossary:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {uncertainTerms.map((term) => (
              <button
                key={term}
                onClick={() => onAddGlossaryTerm(term)}
                className="rounded-full border border-accent/40 bg-accent/5 px-2.5 py-1 text-sm hover:bg-accent/15"
                title="Add to glossary"
              >
                <BidiText>{term}</BidiText>
                <span className="ml-1 text-muted">+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isStale && card.status === 'complete' && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
          The profile or glossary has changed since this was translated. It is left as it
          is — retranslate when you want it refreshed.
        </p>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3 text-[11px]">
        <div className="relative">
          <button
            onClick={() => setShowRetranslateMenu((open) => !open)}
            className="rounded px-2 py-1 text-muted hover:bg-rule"
          >
            Retranslate ▾
          </button>
          {showRetranslateMenu && (
            <RetranslateMenu
              onPick={(options) => {
                setShowRetranslateMenu(false);
                onRetranslate(options);
              }}
              onClose={() => setShowRetranslateMenu(false)}
            />
          )}
        </div>
        {/* "Dig deeper" used to live here and re-translated the passage over
            the top of work the user already had. It is now Explain, on a text
            selection, because the question is about a specific phrase and the
            answer belongs in its own card. */}
        <button
          onClick={() => void copyEnglish()}
          disabled={!englishText}
          className="rounded px-2 py-1 text-muted hover:bg-rule disabled:opacity-40"
        >
          {copied ? 'Copied' : 'Copy English'}
        </button>
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

/**
 * Which service and model produced this card.
 *
 * Not decoration: the user teaches from these, and needs to know at a glance
 * whether a passage was checked quickly on the free tier or translated on
 * Sonnet before he relies on it.
 */
/** Provider identity at collapsed-row scale. */
function CompactBadge({ card }: { card: TranslationCard }) {
  const badge = badgeFor(card.providerId);
  const tone =
    card.providerId === 'offline'
      ? 'border-slate-400 bg-slate-100 text-slate-700'
      : badge.isFree
        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
        : 'border-accent/40 bg-accent/10 text-accent';

  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${tone}`}
      title={`${badge.displayName} · ${card.model}`}
    >
      {badge.displayName}
    </span>
  );
}

function ProviderBadge({ card }: { card: TranslationCard }) {
  const offline = card.providerId === 'offline';
  const badge = badgeFor(card.providerId);
  const option = offline
    ? OFFLINE_MODELS.find((entry) => entry.id === card.model)
    : modelsFor(card.providerId).find((entry) => entry.id === card.model);
  const modelName = option ? option.label.split(' — ')[0] : card.model;

  // An offline card must never be mistaken for a Sonnet card when preparing a
  // lesson from it, so it gets its own colour rather than sharing the free tier's.
  const tone = offline
    ? 'border-slate-400 bg-slate-100 text-slate-700'
    : badge.isFree
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : 'border-accent/40 bg-accent/10 text-accent';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>
        {badge.displayName} · {modelName}
      </span>
      {offline && (
        <span
          className="text-[10px] text-slate-600"
          title="Translated on this device by a machine-translation model. Good for the gist; not for a passage you will teach from."
        >
          on-device — for the gist
        </span>
      )}
      {!offline && badge.isFree && <span className="text-[10px] text-muted">free tier</span>}
      <CostLabel card={card} />
      {card.usedExternalLookup && (
        <span className="text-[10px] text-muted">· web search</span>
      )}
    </div>
  );
}

function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(3)}`;
}

function CostLabel({ card }: { card: TranslationCard }) {
  if (card.status !== 'complete' || !card.usage) return null;

  const cached = card.usage.cacheReadTokens > 0;

  return (
    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted">
      {card.costUsd !== null && card.costUsd !== undefined && (
        <span title="Estimated from the token counts the API reported">
          {formatUsd(card.costUsd)}
        </span>
      )}
      {cached && (
        <span
          className="rounded bg-emerald-50 px-1 text-emerald-800"
          title={`${card.usage.cacheReadTokens.toLocaleString()} tokens served from the prompt cache instead of being re-billed as fresh input`}
        >
          cached ×{card.usage.cacheReadTokens.toLocaleString()}
        </span>
      )}
    </span>
  );
}

/**
 * Errors are separated by kind. "Your key is wrong" and "wait a minute" send the
 * user to entirely different places, and a generic message sends him to the
 * wrong one.
 */
/**
 * A failed translation.
 *
 * The user has already been billed for this response, so it is never thrown
 * away: whatever came back is shown in a readable form, the reason is stated
 * specifically rather than as a generic failure, and the raw text is persisted
 * so it survives navigating away.
 */
function ErrorPanel({ card, onRetry }: { card: TranslationCard; onRetry: () => void }) {
  const kind = card.errorKind;
  const soft = kind === 'rate-limit' || kind === 'truncated' || kind === 'parse';

  const tone = soft
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-red-200 bg-red-50 text-red-900';

  const heading =
    kind === 'rate-limit'
      ? 'Rate limited — not a key problem'
      : kind === 'auth'
        ? 'API key rejected'
        : kind === 'network'
          ? 'Network problem'
          : kind === 'truncated'
            ? 'The answer was cut off'
            : kind === 'parse'
              ? 'No structured output returned'
              : kind === 'refusal'
                ? 'The model declined'
                : 'Translation failed';

  return (
    <div className={`rounded-md border p-3 text-sm ${tone}`}>
      <p className="mb-1 font-medium">{heading}</p>
      <p className="mb-2">{card.error}</p>

      {kind === 'auth' && (
        <p className="text-xs opacity-80">
          Open Settings and check the key for {providerFor(card.providerId).displayName}.
        </p>
      )}
      {kind === 'rate-limit' && (
        <p className="text-xs opacity-80">Your key is valid. Wait a moment, then retry.</p>
      )}

      <button
        onClick={(event) => {
          event.stopPropagation();
          onRetry();
        }}
        className="mt-1 rounded-md border border-current/30 bg-white/70 px-3 py-1 text-xs font-medium hover:bg-white"
      >
        Retry
      </button>

      {card.rawResponse && card.rawResponse.trim() !== '' && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs opacity-80">
            What the model did return — kept so this response is not wasted
          </summary>
          <div
            dir="ltr"
            className="ltr-isolate mt-2 max-h-56 overflow-auto rounded bg-white/70 p-2 text-[12px] leading-relaxed whitespace-pre-wrap"
          >
            <BidiText>{card.rawResponse}</BidiText>
          </div>
        </details>
      )}
    </div>
  );
}

/** "Retranslate with…" — upgrade a quick free-tier check to Sonnet. */
function RetranslateMenu({
  onPick,
  onClose,
}: {
  onPick: (options?: { providerId?: ProviderId; model?: string }) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button className="fixed inset-0 z-10 cursor-default" onClick={onClose} aria-hidden />
      <div className="absolute bottom-full left-0 z-20 mb-1 w-64 rounded-lg border border-rule bg-white p-1 shadow-lg">
        <button
          onClick={() => onPick()}
          className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-parchment"
        >
          Same provider and model
        </button>
        {/* Upgrading a rough on-device rendering once connectivity returns is
            the main reason this menu exists. */}
        {allProviders().map((provider) => (
          <div key={provider.id} className="mt-1 border-t border-rule/60 pt-1">
            <p className="px-2 py-0.5 text-[10px] text-muted">
              {provider.displayName}
              {provider.isFree ? ' · free' : ' · paid'}
            </p>
            {provider.availableModels.map((model) => (
              <button
                key={model.id}
                onClick={() => onPick({ providerId: provider.id, model: model.id })}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-parchment"
              >
                {model.label}
              </button>
            ))}
          </div>
        ))}
        <div className="mt-1 border-t border-rule/60 pt-1">
          <p className="px-2 py-0.5 text-[10px] text-muted">On device · no key</p>
          {OFFLINE_MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => onPick({ providerId: 'offline', model: model.id })}
              className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-parchment"
            >
              {model.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function SegmentView({ segment }: { segment: TranslatedSegment }) {
  const style = SEGMENT_STYLE[segment.type];
  const unavailable = segment.english.trim() === '';

  return (
    <div className={`rounded-md ${style.frame} ${style.frame ? 'px-3 py-2.5' : ''}`}>
      {(style.label || segment.reference) && (
        <div className="mb-1.5 flex items-baseline gap-2 text-[11px] text-muted">
          {style.label && <span className="font-medium">{style.label}</span>}
          {segment.reference && <span>{segment.reference}</span>}
          {segment.source && segment.source !== 'model' && (
            <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] text-verse">
              {segment.source}
            </span>
          )}
        </div>
      )}

      {segment.arabic && (
        <p
          dir="rtl"
          lang="ar"
          className="arabic mb-2 text-[17px] leading-loose"
          style={{ ['--reader-line-height' as string]: '2.0' }}
        >
          {segment.arabic}
        </p>
      )}

      {unavailable ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
          Translation unavailable
        </p>
      ) : (
        // The primary case for <bdi>: English prose with Arabic terms and their
        // parenthetical glosses embedded in it.
        <p dir="ltr" className="ltr-isolate text-[14px] leading-relaxed">
          <BidiText>{segment.english}</BidiText>
        </p>
      )}

      {segment.note && (
        <p dir="ltr" className="ltr-isolate mt-1.5 text-[11px] text-muted italic">
          <BidiText>{segment.note}</BidiText>
        </p>
      )}
    </div>
  );
}
