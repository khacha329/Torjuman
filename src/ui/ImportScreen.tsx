import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { navigate } from '../app/router';
import { createBookFromPreview, fetchBookPreview, type BookPreview } from '../ingest/importer';
import { parseBookInput } from '../shamela/urls';
import { PROXY_AVAILABLE } from '../platform/http/WebHttpClient';
import { Button, Field, inputClass, LinkButton, Spinner, TopBar } from './common';
import { useCrawlProgress } from './useCrawlProgress';

/** The three roles a book can be imported into, and how they are described. */
const ROLES: [role: 'reading' | 'dictionary' | 'reference', label: string][] = [
  ['reading', 'Reading — appears in the library'],
  ['dictionary', 'Dictionary — word lookup by root'],
  ['reference', 'Reference work — searched by Explain'],
];

type Stage =
  | { name: 'input' }
  | { name: 'loading' }
  | { name: 'preview'; preview: BookPreview }
  | { name: 'crawling'; bookId: string };

export function ImportScreen() {
  const { http, storage, crawler } = useApp();
  const [stage, setStage] = useState<Stage>(
    crawler.current && crawler.isRunning
      ? { name: 'crawling', bookId: crawler.current.bookId }
      : { name: 'input' },
  );
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lookUp = async () => {
    const shamelaId = parseBookInput(input);
    if (!shamelaId) {
      setError('Enter a Shamela book ID (e.g. 9260) or a URL like https://shamela.ws/book/9260');
      return;
    }

    setError(null);
    setStage({ name: 'loading' });
    try {
      const preview = await fetchBookPreview(http, shamelaId);
      if (preview.totalPages === 0) {
        setError('Found the book, but could not determine its page count. It may not have any pages.');
        setStage({ name: 'input' });
        return;
      }
      setStage({ name: 'preview', preview });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStage({ name: 'input' });
    }
  };

  const confirm = async (preview: BookPreview) => {
    const book = await createBookFromPreview(storage, preview);
    setStage({ name: 'crawling', bookId: book.id });
    void crawler.start(book.id);
  };

  return (
    <div dir="ltr" className="ltr-isolate flex h-full flex-col">
      <TopBar title="Add book" subtitle="Import a book from the Shamela digital library">
        <LinkButton to={{ name: 'library' }} variant="ghost">
          Back to library
        </LinkButton>
      </TopBar>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl">
          {(stage.name === 'input' || stage.name === 'loading') && (
            <div className="rounded-lg border border-rule bg-white p-6">
              <Field
                label="Shamela URL or book ID"
                hint="For example 9260, or https://shamela.ws/book/9260"
              >
                <input
                  className={inputClass}
                  dir="ltr"
                  value={input}
                  autoFocus
                  placeholder="9260"
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void lookUp();
                  }}
                />
              </Field>

              {error && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </p>
              )}

              {/* Said before the attempt rather than after it fails. Shamela
                  sends no CORS headers, so a browser can only reach it through
                  the dev proxy — which does not exist on a static host. */}
              {!PROXY_AVAILABLE && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <strong>Importing is not available in this deployment.</strong> shamela.ws
                  cannot be reached from a browser without the development proxy. Import on a
                  desktop with <code className="rounded bg-amber-100 px-1">npm run dev</code>,
                  then move the book across with <strong>Library transfer</strong> in
                  Settings — which is what that feature is for. Everything else here works
                  offline.
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => void lookUp()}
                  disabled={stage.name === 'loading' || !PROXY_AVAILABLE}
                >
                  Look up book
                </Button>
                {stage.name === 'loading' && <Spinner label="Reading the book page and index…" />}
              </div>
            </div>
          )}

          {stage.name === 'preview' && (
            <PreviewCard
              preview={stage.preview}
              onCancel={() => setStage({ name: 'input' })}
              onConfirm={(confirmed) => void confirm(confirmed)}
            />
          )}

          {stage.name === 'crawling' && <CrawlPanel bookId={stage.bookId} />}
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  preview: initial,
  onConfirm,
  onCancel,
}: {
  preview: BookPreview;
  onConfirm: (preview: BookPreview) => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState(initial);
  const minutes = Math.round((preview.totalPages * 0.9) / 60);

  return (
    <div className="rounded-lg border border-rule bg-white p-6">
      <h2 className="arabic mb-1 text-2xl font-semibold" dir="rtl">
        {preview.title}
      </h2>
      <p className="arabic mb-5 text-muted" dir="rtl">
        {preview.author}
      </p>

      <dl className="mb-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <Row label="Publisher" value={preview.publisher} arabic />
        <Row label="Edition" value={preview.edition} arabic />
        <Row label="Category" value={preview.category} arabic />
        <Row label="Volumes" value={String(preview.volumeCount)} />
        <Row label="Pages" value={preview.totalPages.toLocaleString()} />
        <Row label="Index entries" value={preview.toc.length.toLocaleString()} />
        <Row
          label="Structure profile"
          value={
            preview.structureProfile === 'hadith-commentary'
              ? 'Hadith commentary (hadith text styled apart from the commentary)'
              : 'Generic'
          }
        />
      </dl>

      {/* The same pipeline, three roles afterwards. A dictionary is looked up
          by root; a reference work — Fatḥ al-Bārī, an-Nawawī's sharḥ — is
          searched by Explain rather than read through; a reading book is read. */}
      <div className="mb-5 rounded-md border border-rule p-3">
        <p className="mb-2 text-sm font-medium">What is this book for?</p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map(([role, label]) => (
            <button
              key={role}
              onClick={() => setPreview({ ...preview, role })}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                preview.role === role
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-rule hover:bg-parchment'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preview.role === 'dictionary' && (
          <p className="mt-2 text-xs text-muted">
            It will not appear in the library. A root index is built from its contents so
            words can be looked up offline while reading.
          </p>
        )}
        {preview.role === 'reference' && (
          <p className="mt-2 text-xs text-muted">
            It will not appear in the library. Its passages become search targets for
            Explain, cited to their own ج/ص — a local source, and a better one than
            anything from the web.
          </p>
        )}
      </div>

      <div className="mb-5 rounded-md border border-rule bg-parchment p-3 text-sm">
        <p className="mb-1 font-medium">About the import</p>
        <p className="text-muted">
          Pages are fetched one at a time with a short pause between each, so about{' '}
          <strong>{minutes} minutes</strong> for this book. Shamela is a free scholarly
          library and this deliberately does not hammer it. The import is resumable —
          closing this tab, losing the network, or the tablet sleeping will not lose
          progress.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="primary" onClick={() => onConfirm(preview)}>
          Import {preview.totalPages.toLocaleString()} pages
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function Row({ label, value, arabic }: { label: string; value: string; arabic?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-rule/60 py-1">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={arabic ? 'arabic text-right' : 'text-right'} dir={arabic ? 'rtl' : 'ltr'}>
        {value}
      </dd>
    </div>
  );
}

function CrawlPanel({ bookId }: { bookId: string }) {
  const { crawler, storage } = useApp();
  const progress = useCrawlProgress();
  const [blockCount, setBlockCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      void storage.countBlocks(bookId).then(setBlockCount);
    }, 2000);
    return () => clearInterval(timer);
  }, [storage, bookId]);

  if (!progress || progress.bookId !== bookId) {
    return (
      <div className="rounded-lg border border-rule bg-white p-6 text-sm text-muted">
        Starting import…
      </div>
    );
  }

  const percent =
    progress.totalPages > 0
      ? Math.round((progress.fetchedPages / progress.totalPages) * 100)
      : 0;
  const remaining = Math.max(0, progress.totalPages - progress.fetchedPages);
  const minutesLeft = Math.round((remaining * 0.9) / 60);
  const done = progress.status === 'complete';

  return (
    <div className="rounded-lg border border-rule bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold">
        {done ? 'Import complete' : 'Importing'}
      </h2>
      <p className="mb-4 text-sm text-muted">
        {done
          ? `${progress.fetchedPages.toLocaleString()} pages and ${blockCount.toLocaleString()} paragraphs stored.`
          : `Fetching page ${progress.currentPage.toLocaleString()} of ${progress.totalPages.toLocaleString()} — about ${minutesLeft} minutes left.`}
      </p>

      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-rule">
        <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mb-4 text-xs text-muted">
        {percent}% — {progress.fetchedPages.toLocaleString()} pages,{' '}
        {blockCount.toLocaleString()} paragraphs parsed
      </p>

      {progress.lastError && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Last problem: {progress.lastError}
        </p>
      )}

      {progress.failedPages.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="mb-2 text-amber-900">
            {progress.failedPages.length} page
            {progress.failedPages.length === 1 ? '' : 's'} could not be fetched after three
            attempts: {progress.failedPages.slice(0, 12).join(', ')}
            {progress.failedPages.length > 12 ? '…' : ''}
          </p>
          <Button onClick={() => void crawler.retryFailed(bookId)}>Retry failed pages</Button>
        </div>
      )}

      <div className="flex gap-2">
        {!done && progress.status === 'running' && (
          <Button onClick={() => crawler.pause()}>Pause</Button>
        )}
        {!done && progress.status !== 'running' && (
          <Button variant="primary" onClick={() => void crawler.start(bookId)}>
            Resume
          </Button>
        )}
        <Button variant="primary" onClick={() => navigate({ name: 'reader', bookId })}>
          {done ? 'Open book' : 'Read what has arrived'}
        </Button>
        <LinkButton to={{ name: 'library' }}>Library</LinkButton>
      </div>

      {!done && (
        <p className="mt-4 text-xs text-muted">
          You can leave this screen — the import keeps running while the tab is open, and
          resumes from where it stopped if you close it.
        </p>
      )}
    </div>
  );
}
