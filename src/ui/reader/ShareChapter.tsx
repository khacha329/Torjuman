import { useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { Block, TocNode } from '../../types';
import { statsFor, type ShareBundle } from '../../share/bundle';
import { buildBundle, chapterRange, orderRange, tocSubtree } from '../../share/buildBundle';
import { generateShareKey, InsecureContextError, sealBundle, toBase64Url } from '../../share/crypto';
import { shareFileName, shareLinkFor } from '../../share/shareLink';
import { AnchoredPanel } from './AnchoredPanel';
import { Button, Spinner } from '../common';

// Export a chapter — or a run of them — as a link.
//
// ---------------------------------------------------------------------------
// Three steps, because the middle one is the point
//
//   choose   the range, defaulting to the chapter on screen
//   preview  the actual counts and the actual file size
//   publish  download the file, record the share, show the link
//
// The preview is not an estimate. It builds the bundle and seals it, and the
// bytes it measures are the bytes that get downloaded — resealing would produce
// a different file, since the key and the IV are fresh each time. A size that
// might be wrong would be worse than none: the whole premise of sharing a bāb
// rather than a volume is that the result is small, and that claim should be
// checkable before anything is committed.
//
// ---------------------------------------------------------------------------
// The app cannot publish, and says so
//
// A browser cannot commit to a git repository, so this downloads a file and
// says where to put it. That is not a gap to paper over: it is the step where a
// person decides to make a chapter fetchable, and Amendment 18 is explicit that
// this should be deliberate. The link is shown immediately and is dead until
// the file is pushed, which the panel states in as many words.
// ---------------------------------------------------------------------------

/** How many following chapters to offer as the end of a range. */
const RANGE_CHOICES = 40;

/**
 * Bundles are expected to be "a few hundred kilobytes or less". Past this the
 * panel says so — not as a refusal, but because a share that turns out to be
 * multiple megabytes usually means the range is wider than intended.
 */
const LARGE_BUNDLE = 700 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function download(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoked on a delay rather than immediately: some Android browsers have not
  // started reading the blob by the time click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface Sealed {
  bundle: ShareBundle;
  key: Uint8Array;
  bytes: Uint8Array;
}

type State =
  | { status: 'choosing' }
  | { status: 'working' }
  | { status: 'preview'; sealed: Sealed }
  | { status: 'published'; sealed: Sealed; link: string }
  | { status: 'error'; message: string };

export function ShareChapter({
  bookId,
  blocks,
  tocNodes,
  tocNodeId,
  anchor,
  onClose,
}: {
  bookId: string;
  blocks: Block[];
  tocNodes: TocNode[];
  /** The chapter currently on screen, or null when nothing is resolved yet. */
  tocNodeId: string | null;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const { storage } = useApp();
  const [state, setState] = useState<State>({ status: 'choosing' });
  const [endNodeId, setEndNodeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ordered = useMemo(() => [...tocNodes].sort((a, b) => a.order - b.order), [tocNodes]);
  const start = tocNodeId ? ordered.find((node) => node.id === tocNodeId) : undefined;

  /**
   * Chapters offered as the end of the range.
   *
   * Only those at or above the starting chapter's level, and only those after
   * it — a range runs forwards through the book, and offering a sub-heading of
   * the chapter you already selected would mean "part of this chapter", which
   * is not what a range picker is for. Capped, because a six-volume commentary
   * has thousands of nodes and a select that long is unusable on a tablet.
   */
  const endChoices = useMemo(() => {
    if (!start) return [];
    return ordered
      .filter((node) => node.order > start.order && node.depth <= start.depth)
      .slice(0, RANGE_CHOICES);
  }, [ordered, start]);

  const end = endNodeId ? ordered.find((node) => node.id === endNodeId) : undefined;

  const buildRange = () => {
    if (!start) return null;
    // A single chapter is selected by its own subtree, which is exact. A span
    // is selected by block order between the two subtrees' bounds, which is the
    // only thing that can express "from here through there".
    if (!end) return chapterRange(blocks, ordered, start.id);

    const within = (nodeId: string) => {
      const subtree = tocSubtree(ordered, nodeId);
      return blocks.filter((block) => block.tocNodeId !== null && subtree.has(block.tocNodeId));
    };
    const first = within(start.id);
    const last = within(end.id);
    if (first.length === 0 || last.length === 0) return null;

    const range = orderRange(
      blocks,
      Math.min(...first.map((block) => block.order)),
      Math.max(...last.map((block) => block.order)),
    );
    return { ...range, label: `${start.title} — ${end.title}` };
  };

  const preview = async () => {
    const range = buildRange();
    if (!range) return;
    setState({ status: 'working' });
    try {
      const bundle = await buildBundle(storage, { bookId, range });
      const key = generateShareKey();
      const bytes = await sealBundle(bundle, key);
      setState({ status: 'preview', sealed: { bundle, key, bytes } });
    } catch (cause) {
      setState({
        status: 'error',
        message:
          cause instanceof InsecureContextError || cause instanceof Error
            ? cause.message
            : String(cause),
      });
    }
  };

  const publish = async (sealed: Sealed) => {
    const link = shareLinkFor({ id: sealed.bundle.id, key: sealed.key });
    download(sealed.bytes, shareFileName(sealed.bundle.id));

    const stats = statsFor(sealed.bundle);
    // Recorded before the link is shown, so a share can never exist in the
    // world with no local record of its key.
    await storage.putShareRecord({
      id: sealed.bundle.id,
      key: toBase64Url(sealed.key),
      title: sealed.bundle.title,
      bookId,
      bookTitle: sealed.bundle.sourceBook.title,
      rangeLabel: end ? `${start?.title ?? ''} — ${end.title}` : (start?.title ?? ''),
      createdAt: sealed.bundle.createdAt,
      bytes: sealed.bytes.length,
      blocks: stats.blocks,
      cards: stats.cards,
      marks: stats.marks,
    });

    setState({ status: 'published', sealed, link });
  };

  return (
    <AnchoredPanel
      anchor={anchor}
      onClose={onClose}
      preferSheet
      title={
        <>
          <span className="rounded-full bg-verse/15 px-2 py-0.5 text-[10px] font-medium">
            Share
          </span>
          <span className="text-[12px] font-medium">
            {state.status === 'published' ? 'Published' : 'Publish a chapter'}
          </span>
        </>
      }
    >
      <div dir="ltr" className="ltr-isolate space-y-3 text-[12px]">
        {state.status === 'published' ? (
          <Published
            sealed={state.sealed}
            link={state.link}
            copied={copied}
            onCopy={() => {
              void navigator.clipboard.writeText(state.link).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => setCopied(false),
              );
            }}
          />
        ) : state.status === 'preview' ? (
          <Preview
            sealed={state.sealed}
            onBack={() => setState({ status: 'choosing' })}
            onPublish={() => void publish(state.sealed)}
          />
        ) : (
          <>
            {start ? (
              <>
                <div>
                  <p className="mb-1 font-medium">From</p>
                  <p
                    dir="rtl"
                    lang="ar"
                    className="arabic rounded border border-rule bg-parchment px-2 py-1.5 text-[13px]"
                  >
                    {start.title}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    The chapter on screen, with its sub-headings.
                  </p>
                </div>

                {endChoices.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">Through</p>
                    <select
                      value={endNodeId ?? ''}
                      onChange={(event) => setEndNodeId(event.target.value || null)}
                      className="w-full rounded-md border border-rule bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">Just this chapter</option>
                      {endChoices.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted">
                Scroll to a chapter first. A share is one bāb or a run of them, not a whole
                work.
              </p>
            )}

            <Disclosure />

            {state.status === 'error' && (
              <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                {state.message}
              </p>
            )}

            {state.status === 'working' ? (
              <Spinner label="Building and sealing…" />
            ) : (
              <Button variant="primary" onClick={() => void preview()} disabled={!start}>
                Preview what will be published
              </Button>
            )}
          </>
        )}
      </div>
    </AnchoredPanel>
  );
}

/** Said before anything is generated, not after. */
function Disclosure() {
  return (
    <p className="rounded-md border border-rule bg-parchment px-2.5 py-2 text-[11px] text-muted">
      The bundle carries the Arabic of this range, your translations, notes and marks in
      it, and the narrator and ḥadīth records it refers to. It is encrypted before it
      leaves this device, and the key travels only in the link — so the published file is
      unreadable, and anyone you give the link to can read the chapter.
    </p>
  );
}

function Preview({
  sealed,
  onBack,
  onPublish,
}: {
  sealed: Sealed;
  onBack: () => void;
  onPublish: () => void;
}) {
  const stats = statsFor(sealed.bundle);
  const rows: [string, string][] = [
    ['Paragraphs', stats.blocks.toLocaleString()],
    ['Cards', stats.cards.toLocaleString()],
    ['Marks', stats.marks.toLocaleString()],
    ['Marked references', stats.entities.toLocaleString()],
    ['Narrator profiles', stats.narrators.toLocaleString()],
    ['Ḥadīth records', stats.hadiths.toLocaleString()],
    ['File size', formatBytes(sealed.bytes.length)],
  ];

  return (
    <>
      <p dir="rtl" lang="ar" className="arabic text-[13px] font-medium">
        {sealed.bundle.title}
      </p>

      <dl className="grid grid-cols-2 gap-x-3 text-[11px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-rule/60 py-0.5">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {sealed.bytes.length > LARGE_BUNDLE && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
          That is larger than a chapter usually comes to. Worth checking the range is what
          you meant before publishing it.
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={onBack}>Change the range</Button>
        <Button variant="primary" onClick={onPublish}>
          Download the file
        </Button>
      </div>
    </>
  );
}

function Published({
  sealed,
  link,
  copied,
  onCopy,
}: {
  sealed: Sealed;
  link: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <>
      <ol className="list-decimal space-y-1 pl-4 text-muted">
        <li>
          <code className="rounded bg-rule/40 px-1">{shareFileName(sealed.bundle.id)}</code> has
          been downloaded ({formatBytes(sealed.bytes.length)}).
        </li>
        <li>
          Move it into <code className="rounded bg-rule/40 px-1">public/shares/</code> in the
          repository.
        </li>
        <li>
          Commit and push to <code className="rounded bg-rule/40 px-1">main</code>. No release is
          needed — the link works as soon as GitHub has the file.
        </li>
      </ol>

      <div>
        <p className="mb-1 font-medium">The link</p>
        <p
          dir="ltr"
          className="mb-2 rounded border border-rule bg-parchment px-2 py-1.5 font-mono text-[10px] break-all"
        >
          {link}
        </p>
        <Button onClick={onCopy}>{copied ? 'Copied' : 'Copy link'}</Button>
      </div>

      <p className="text-[11px] text-muted">
        Saved under Settings → Published chapters, where you can copy this link again or
        withdraw the share.
      </p>
    </>
  );
}
