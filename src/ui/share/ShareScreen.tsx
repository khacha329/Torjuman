import { useEffect, useMemo, useState } from 'react';
import { StorageOverride, useApp } from '../../app/AppContext';
import { ReadOnlyContext } from '../../app/readOnly';
import { navigate } from '../../app/router';
import { fromBase64Url } from '../../share/crypto';
import { loadShare, ShareLoadError } from '../../share/loadShare';
import { ShareStorageAdapter } from '../../share/ShareStorageAdapter';
import type { ShareBundle } from '../../share/bundle';
import { Button, LinkButton, Spinner } from '../common';
import { ReaderScreen } from '../reader/ReaderScreen';

// A shared chapter, opened from a link.
//
// ---------------------------------------------------------------------------
// The visitor arriving here has nothing
//
// No account, no key, no imported books, and quite possibly no idea what this
// app is — they were sent a link by someone in a study circle. So this screen
// carries the whole burden of explaining itself: what they are looking at,
// which work it is from, that it is one chapter and not the book, and how to
// leave. Everything below the banner is the ordinary reader, which is the
// point; only the framing is new.
//
// And every failure must land as a sentence, never as a blank page. A link
// that has gone stale is the normal end state of a share — the file was
// removed, or the format moved on — and it has to read as that rather than as
// the app being broken.
// ---------------------------------------------------------------------------

/**
 * Keep shared chapters out of search results.
 *
 * `robots.txt` disallows the bundle files themselves, but the chapter is
 * *rendered* at the app's own URL, which must stay indexable — so the rule
 * cannot live in a static file and is applied to the document only while a
 * share is on screen. Removed on unmount, or leaving a share would leave the
 * whole app hidden from search for the rest of the session.
 *
 * This is politeness toward crawlers that read it, not a control. What actually
 * keeps a bundle private is that it is encrypted and the key is in the
 * fragment, which no crawler ever sees.
 */
function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; bundle: ShareBundle }
  | { status: 'error'; message: string; detail: string | null };

export function ShareScreen({ id, keyText }: { id: string; keyText: string }) {
  const { storage } = useApp();
  const [state, setState] = useState<State>({ status: 'loading' });

  useNoIndex();

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      // The key is decoded here rather than in the router: a link truncated by
      // a chat client is a broken link with a reason, not an unmatched route
      // that silently drops the visitor on an empty library.
      let key: Uint8Array;
      try {
        key = fromBase64Url(keyText);
      } catch {
        key = new Uint8Array();
      }
      if (key.length !== 32) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'This link is incomplete.',
            detail:
              'The part after the last slash carries the key that unlocks the chapter, and it is missing or truncated. Messaging apps sometimes cut long links — ask for it again, as a plain link rather than a preview.',
          });
        }
        return;
      }

      try {
        const bundle = await loadShare({ id, key });
        if (!cancelled) setState({ status: 'ready', bundle });
      } catch (cause) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
          detail: cause instanceof ShareLoadError ? cause.detail : null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, keyText]);

  // Rebuilt only when the bundle changes, never on every render: the adapter
  // indexes the bundle's narrators and blocks in its constructor, and handing
  // the reader a new adapter identity would re-run every load effect it has.
  const shareStorage = useMemo(
    () => (state.status === 'ready' ? new ShareStorageAdapter(state.bundle, storage) : null),
    [state, storage],
  );

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Opening the shared chapter…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ShareError message={state.message} detail={state.detail} />;
  }

  return (
    <ReadOnlyContext.Provider value={true}>
      <StorageOverride storage={shareStorage!}>
        <div dir="ltr" className="ltr-isolate flex h-full flex-col">
          <ShareBanner bundle={state.bundle} />
          <div className="min-h-0 flex-1">
            <ReaderScreen bookId={state.bundle.sourceBook.bookId} />
          </div>
        </div>
      </StorageOverride>
    </ReadOnlyContext.Provider>
  );
}

/**
 * Always on screen, never dismissable.
 *
 * A visitor who scrolls past a one-time notice and then forgets they are in
 * somebody else's chapter is the failure this prevents — they would read a
 * missing Translate button as a bug, and an empty contents drawer as a broken
 * import. It names the work, says plainly that this is an extract, and offers
 * the way out.
 */
function ShareBanner({ bundle }: { bundle: ShareBundle }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-verse/40 bg-verse/[0.07] px-3 py-1.5 text-[11px]">
      <span className="shrink-0 rounded-full bg-verse/15 px-2 py-0.5 font-medium text-[10px]">
        Shared extract
      </span>
      <span className="arabic min-w-0 truncate text-[13px]" dir="rtl" lang="ar">
        {bundle.sourceBook.title}
      </span>
      <span className="min-w-0 truncate text-muted">
        {bundle.sourceBook.author}
        {bundle.sourceBook.publisher ? ` · ${bundle.sourceBook.publisher}` : ''}
      </span>
      {/* The "Read-only — one chapter, not the whole work" line used to sit
          here and has been removed deliberately.
          It was explaining the app to the reader rather than telling them
          anything about the text. The absence of a Translate button is not a
          state a visitor needs narrating, and the "Shared extract" chip beside
          the title already says what this is. What stays is the part that is
          about the material — which work, whose edition — and the way out. */}
      <span className="ms-auto shrink-0">
        <LinkButton to={{ name: 'library' }} variant="ghost">
          Leave shared view
        </LinkButton>
      </span>
    </div>
  );
}

function ShareError({ message, detail }: { message: string; detail: string | null }) {
  return (
    <div dir="ltr" className="ltr-isolate flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-lg border border-rule bg-white p-6">
        <p className="mb-2 text-base font-semibold">{message}</p>
        {detail && <p className="mb-3 text-sm text-muted">{detail}</p>}
        <p className="mb-4 text-sm text-muted">
          Shared chapters are published one at a time and can be withdrawn, so a link
          that worked before may simply be gone. Whoever sent it can publish it again.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <Button variant="primary" onClick={() => navigate({ name: 'library' })}>
            Go to the library
          </Button>
        </div>
      </div>
    </div>
  );
}
