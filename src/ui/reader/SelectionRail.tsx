import { useEffect, useRef, useState, type ReactNode } from 'react';

// Actions for the current selection, in a vertical rail on the left edge.
//
// ---------------------------------------------------------------------------
// Why the left edge, and why not the bottom
//
// Amendment 10 moved these actions to a bar pinned to the bottom, to get clear
// of the system selection toolbar that Android draws above the WebView. That
// worked until Chrome started rendering its own "search the selected text"
// suggestion chip near the bottom of the viewport — also above page content,
// also on top of the bar. Two pieces of browser chrome now compete for the
// bottom edge, and the app loses both times.
//
// Left is the right answer for three reasons, none of them about the chip:
//
//   1. The reading surface is RTL, so the left edge is the *trailing* margin —
//      the side least likely to hold the text just selected.
//   2. The right margin is already spoken for by mark bands and the
//      translated-range indicator from Amendments 3 and 5.
//   3. The system chip is a bottom-edge phenomenon; a vertical rail simply is
//      not in that space.
//
// Its width is reserved in the reader layout rather than floated over the text,
// so the Arabic column is exactly as wide with the rail showing as without it.
// Nothing reflows when a selection is made.
//
// This is built as the primary interaction surface, not as a workaround. The
// eventual Capacitor build can override `startActionMode` and suppress the
// system chip entirely — at which point the rail stays, because it is better.
// ---------------------------------------------------------------------------

/** Comfortable on a tablet with an S Pen, and above the 44px floor. */
export const RAIL_WIDTH = 52;

export interface SelectionRailProps {
  /** True when the selection is exactly one word — enables the word actions. */
  singleWord: boolean;
  busy: boolean;
  dictionaryAvailable: boolean;
  meaningAvailable: boolean;
  /**
   * Viewport y of the middle of the selection. The rail centres on it where
   * there is room and clamps to stay wholly on screen where there is not.
   */
  centerY: number | null;
  onTranslate: () => void;
  onExplain: () => void;
  onMeaning: () => void;
  onDictionary: () => void;
  onMarkRead: () => void;
  onMarkSkip: () => void;
  onClearMarks: () => void;
}

export function SelectionRail({
  singleWord,
  busy,
  dictionaryAvailable,
  meaningAvailable,
  centerY,
  onTranslate,
  onExplain,
  onMeaning,
  onDictionary,
  onMarkRead,
  onMarkSkip,
  onClearMarks,
}: SelectionRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  // Centred on the selection, clamped so the whole rail stays on screen — the
  // case that matters is a selection in the first or last line of the viewport,
  // where centring alone would put half the actions out of reach.
  useEffect(() => {
    const place = () => {
      const height = railRef.current?.offsetHeight ?? 0;
      const margin = 12;
      const wanted = (centerY ?? window.innerHeight / 2) - height / 2;
      const highest = margin;
      const lowest = Math.max(margin, window.innerHeight - height - margin);
      setTop(Math.min(Math.max(wanted, highest), lowest));
    };

    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [centerY, singleWord]);

  return (
    <div
      ref={railRef}
      dir="ltr"
      role="toolbar"
      aria-label="Actions for the selected text"
      // Above the card bottom sheet, which sits at z-50.
      className="ltr-isolate no-select selection-rail fixed z-[60] flex flex-col items-center gap-1 rounded-r-xl border border-l-0 border-rule bg-white/95 py-2 shadow-[2px_0_12px_rgba(0,0,0,0.10)] backdrop-blur"
      style={{
        top: top ?? -9999,
        left: 'env(safe-area-inset-left, 0px)',
        width: RAIL_WIDTH,
        visibility: top === null ? 'hidden' : 'visible',
      }}
      // Tapping the rail must not alter or clear the selection, which is what
      // every action is about to read.
      onMouseDown={(event) => event.preventDefault()}
      onTouchStart={(event) => event.preventDefault()}
    >
      <RailAction label={busy ? 'Translating…' : 'Translate'} onClick={onTranslate} disabled={busy} primary>
        {busy ? <SpinnerIcon /> : <TranslateIcon />}
      </RailAction>

      <RailAction label="Explain — what this phrase means as a concept" onClick={onExplain} disabled={busy}>
        <ExplainIcon />
      </RailAction>

      {singleWord && (
        <>
          <Divider />
          <RailAction
            label={
              meaningAvailable
                ? 'Meaning — English, as used in this sentence'
                : 'Meaning — offline and not cached; Dictionary works offline'
            }
            onClick={onMeaning}
            disabled={!meaningAvailable}
          >
            <MeaningIcon />
          </RailAction>
          <RailAction
            label={
              dictionaryAvailable
                ? 'Dictionary — the classical entry for this word’s root'
                : 'Dictionary — none imported; Settings → Reference works'
            }
            onClick={onDictionary}
            disabled={!dictionaryAvailable}
          >
            <DictionaryIcon />
          </RailAction>
        </>
      )}

      <Divider />

      <RailAction label="Mark to be read out in the session" onClick={onMarkRead}>
        <ReadIcon />
      </RailAction>
      <RailAction label="Mark to be passed over" onClick={onMarkSkip}>
        <SkipIcon />
      </RailAction>
      <RailAction label="Clear any marks touching this selection" onClick={onClearMarks} muted>
        <ClearIcon />
      </RailAction>
    </div>
  );
}

function Divider() {
  return <span className="my-0.5 h-px w-6 bg-rule" aria-hidden />;
}

/**
 * One icon button.
 *
 * Icons only, because seven labelled buttons stacked vertically would be a
 * column of text down the side of the page. The label is the accessible name,
 * the hover title, and — since neither exists on a touchscreen — a flyout on
 * long press.
 */
function RailAction({
  children,
  label,
  onClick,
  disabled,
  primary,
  muted,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  muted?: boolean;
}) {
  const [showLabel, setShowLabel] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);

  const startHold = () => {
    holdTimer.current = window.setTimeout(() => setShowLabel(true), 450);
  };
  const endHold = () => {
    window.clearTimeout(holdTimer.current);
    setShowLabel(false);
  };

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const tone = primary
    ? 'bg-accent text-white hover:opacity-90'
    : muted
      ? 'text-muted hover:bg-rule'
      : 'text-ink hover:bg-rule';

  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-label={label}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onContextMenu={(event) => event.preventDefault()}
        // 44px is the floor for a tap target and this is the app's primary
        // interaction surface, so it gets more than the floor.
        className={`flex h-11 w-11 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
      >
        {children}
      </button>

      {showLabel && (
        <span className="pointer-events-none absolute top-1/2 left-full z-10 ms-2 -translate-y-1/2 rounded-md bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-lg">
          {label}
        </span>
      )}
    </div>
  );
}

// Inline SVG rather than an icon dependency: seven glyphs is not a reason to
// add a package, and these inherit `currentColor` so the tones above just work.

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function TranslateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
      <path d="M4 5h8M8 5v2c0 3-1.8 5.5-4 6.5" />
      <path d="M5.5 9c1 2.2 2.9 3.8 5.5 4.5" />
      <path d="m12.5 20 3.75-9 3.75 9M14 17.2h4.5" />
    </svg>
  );
}

function ExplainIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
      <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.9-.9 1.5v.7" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

function MeaningIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
      <path d="M4 17V7a1 1 0 0 1 1-1h5.5a2.5 2.5 0 0 1 2.5 2.5V18" />
      <path d="M13 8.5A2.5 2.5 0 0 1 15.5 6H20a1 1 0 0 1 1 1v10" />
      <path d="M4 17h7.5M13 17H21" />
    </svg>
  );
}

function DictionaryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H6a1.5 1.5 0 0 1 0-3h12" />
      <path d="M9 8h6M9 11.5h4" />
    </svg>
  );
}

function ReadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
      <path d="M4 8h16M4 12h11" />
      <path d="M4 18h16" strokeWidth="2.6" className="text-accent" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <rect x="3.5" y="8" width="17" height="8" rx="1.5" fill="#d9a441" opacity="0.45" />
      <path d="M6 12h12" {...stroke} />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
      <path d="m8.5 15.5 7-7M8.5 8.5l7 7" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}
