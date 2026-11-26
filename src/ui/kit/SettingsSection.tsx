import {
  Children,
  createContext,
  useContext,
  useId,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';

// The white card every Settings section sits in. Fifteen places — fourteen
// section files and SettingsScreen's local Section, which served seven more —
// wrote this <section> by hand; restructure Phase 2 step 2j made it one piece.
// That local Section is now ui/settings/Section.tsx and the seven sections it
// serves are files of their own (restructure Phase 5 steps 5d1–5d8), so
// fifteen section files (fourteen then, and Ḥadīth English since) wrap their
// content in this directly and seven do it through Section. It is the bare
// shell only: each section keeps its own heading, description and body inside
// it (the owner's answer to Phase 2 Q3), so a new section is one component
// that wraps its content in this and opens with its heading, plus its import
// and its line, inside a Collapsible, in its tab in SettingsScreen.
//
// Inside a Collapsible the shell can also fold its section away, which it does
// from the outside, without the section knowing: the section's first child is
// taken as its heading and stays in view with a chevron beside it, and the
// rest is hidden. Every section opens with its heading (an <h2>, or a row
// holding one), so that is all a folded section shows. Hidden, not unmounted:
// a folded section keeps what it holds, a half-typed field or an export under
// way. Outside a Collapsible the shell is the plain card it always was.

interface Fold {
  open: boolean;
  toggle: () => void;
}

const FoldContext = createContext<Fold | null>(null);

/**
 * Makes the Settings section inside it foldable. Open unless `defaultOpen` is
 * false; the state lives here, so it lasts while Settings is open and starts
 * again from `defaultOpen` the next time.
 */
export function Collapsible({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <FoldContext.Provider value={{ open, toggle: () => setOpen((was) => !was) }}>
      {children}
    </FoldContext.Provider>
  );
}

export function SettingsSection({ children }: { children: ReactNode }) {
  const fold = useContext(FoldContext);
  const bodyId = useId();

  if (!fold) {
    return (
      <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
        {children}
      </section>
    );
  }

  const [heading, ...body] = Children.toArray(children);

  // A tap on the heading folds the section as the chevron does — on a tablet
  // the title is the obvious place to tap. A tap on a control inside the
  // heading row stays that control's.
  const tapHeading = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('a, button, input, select, textarea, label')) return;
    fold.toggle();
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <div className="flex items-start gap-3">
        {/* Folded, the heading's own bottom margin (a heading row that sets
            one) would leave a gap under it with nothing below. */}
        <div
          className={fold.open ? 'min-w-0 flex-1 cursor-pointer' : 'min-w-0 flex-1 cursor-pointer [&>*]:mb-0'}
          onClick={tapHeading}
        >
          {heading}
        </div>
        {/* As tall as the heading's 24 px line, so the row is no taller than
            the heading alone; the ::after square widens what a finger can hit
            without moving anything. */}
        <button
          type="button"
          aria-expanded={fold.open}
          aria-controls={bodyId}
          aria-label={fold.open ? 'Fold this section' : 'Unfold this section'}
          onClick={fold.toggle}
          className="relative -my-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition after:absolute after:-inset-2 after:content-[''] hover:bg-rule/40 hover:text-ink"
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={`h-4 w-4 transition-transform ${fold.open ? 'rotate-180' : ''}`}
          >
            <path
              d="M5 7.5 10 12.5 15 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div id={bodyId} hidden={!fold.open}>
        {body}
      </div>
    </section>
  );
}
