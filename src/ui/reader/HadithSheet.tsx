import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useReadOnly } from '../../app/readOnly';
import { navigate } from '../../app/router';
import { secrets } from '../../services/secrets';
import { useOnline } from '../../app/useOnline';
import { BidiText } from '../../components/BidiText';
import { lookupHadith, type TextLookup } from '../../retrieval/HadithSource';
import { HADITH_JSON_ATTRIBUTION, hadithJsonCollection } from '../../retrieval/hadithJson';
import type { IndexProgress } from '../../retrieval/hadithTextIndex';
import { hadithScopeFor } from './hadithScope';
import { HADITH_QUOTED_IN_PART } from '../../retrieval/enrich';
import type { DorarDiagnostics } from '../../retrieval/dorar';
import type {
  Book,
  Entity,
  HadithRecord,
} from '../../types';
import { commentaryWorks } from '../../retrieval/sharh';
import { AnchoredPanel } from './AnchoredPanel';
import { Button, Spinner } from '../kit';

// The ḥadīth sheet, which EntitySheet opens for a tapped ḥadīth: dorar.net's
// gradings, sunnah.com's English, a button per imported commentary,
// "Translate all…" and dorar's diagnostics. `Diagnostic` is its own part.
// Moved verbatim from EntitySheet.tsx in restructure Phase 5 step 5e1
// (docs/refactor/plans/phase5-big-ui-files.md).

function Diagnostic({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-medium">{label}</dt>
      <dd dir="auto" className="min-w-0 flex-1 break-all">
        {children}
      </dd>
    </div>
  );
}

// ------------------------------------------------------------------ ḥadīth

function collectionName(slug: string): string {
  return hadithJsonCollection(slug)?.displayName ?? slug;
}

/**
 * The ḥadīth sheet.
 *
 * Grading and attribution are shown prominently, because that is what a study
 * circle needs to know before the text is read out. The English is shown only
 * when a source that actually has one produced it: dorar.net returns Arabic
 * only, and the honest note stays in place rather than being filled in.
 */
export function HadithSheet({
  entity,
  anchor,
  sourceText,
  contextText,
  onClose,
  onTranslateSurrounding,
  onSharh,
  onTranslateAll,
}: {
  entity: Entity;
  anchor: HTMLElement;
  sourceText: string;
  contextText: string;
  onClose: () => void;
  onTranslateSurrounding: () => void;
  onSharh: (book: Book) => void;
  onTranslateAll: () => void;
}) {
  const { http, storage, settings } = useApp();
  const readOnly = useReadOnly();
  const online = useOnline();
  const [record, setRecord] = useState<HadithRecord | null>(null);
  const [diagnostics, setDiagnostics] = useState<DorarDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loading, setLoading] = useState(true);
  // The text search in the book's own collection (step T1 of the plan), and a
  // first-use index build while it runs.
  const [text, setText] = useState<TextLookup | undefined>(undefined);
  const [indexing, setIndexing] = useState<IndexProgress | null>(null);

  // Whichever commentaries happen to be imported. Not a fixed list, and no work
  // is named in code: a book qualifies by Shamela's own «شروح الحديث» category,
  // so Sharḥ an-Nawawī and Fatḥ al-Bārī appear as siblings and anything else
  // the reader adds joins them without a change here.
  const [commentaries, setCommentaries] = useState<Book[]>([]);
  useEffect(() => {
    let cancelled = false;
    void commentaryWorks(storage).then((works) => {
      if (!cancelled) setCommentaries(works);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setIndexing(null);

    void (async () => {
      // The scope comes from the book, read here rather than passed down, so
      // ReaderScreen and ReaderSheets do not change. The printed number — of a
      // book-scoped reference (`<bookId>#n`) or a collection's (`riyadussalihin:n`)
      // — is the hint for the text's candidates.
      const book = await storage.getBook(entity.bookId).catch(() => undefined);
      const collection = book ? hadithScopeFor(book) : null;
      const printed = /#(\d+)$/.exec(entity.reference ?? '')?.[1] ?? /:(\d+)$/.exec(entity.reference ?? '')?.[1];
      const found = await lookupHadith(
        http,
        storage,
        {
          reference: entity.reference,
          arabicText: sourceText,
          contextText,
          scope: collection
            ? { collection, numberHint: printed !== undefined ? Number(printed) : undefined }
            : undefined,
        },
        {
          sunnahApiKey: secrets.getSunnahKey(),
          preferred: settings.hadithSourceId,
          online,
          onIndexProgress: (progress) => {
            if (!cancelled) setIndexing(progress);
          },
        },
      );
      if (cancelled) return;
      setRecord(found.record);
      setDiagnostics(found.diagnostics);
      setText(found.text);
      setIndexing(null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    contextText,
    entity.bookId,
    entity.reference,
    http,
    online,
    settings.hadithSourceId,
    sourceText,
    storage,
  ]);

  const gradings = record?.gradings ?? [];
  // A miss in a sharḥ of one of the six main books gets its own wording. Riyāḍ
  // and the Forty keep the note below, key prompt included: their numbers are
  // citable, so sunnah.com is a real route for them.
  const scopedMiss =
    text !== undefined &&
    text.status !== 'matched' &&
    hadithJsonCollection(text.collection)?.citableNumbers === false;

  return (
    <AnchoredPanel
      anchor={anchor}
      onClose={onClose}
      title={
        <>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
            Ḥadīth
          </span>
          <span className="text-[12px] font-medium">{entity.label ?? entity.reference}</span>
        </>
      }
      // Matn, reference and gradings all render above; every control down here
      // either spends a key or searches a commentary the visitor has not
      // imported. In a shared view the sheet is the answer, not a menu.
      footer={
        readOnly ? undefined : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              onTranslateSurrounding();
              onClose();
            }}
          >
            Translate the surrounding passage
          </Button>

          {/* The whole commentary, not just the block. Opens a confirmation
              rather than starting: this is the most expensive action in the
              app and must not be one tap from a surprise. */}
          <Button
            variant="ghost"
            onClick={() => {
              onTranslateAll();
              onClose();
            }}
          >
            Translate all…
          </Button>

          {/* One button per imported commentary, labelled with the work itself.
              The amendment asks for a «شرح النووي» action; naming each button
              after the work it actually searches is the same affordance with no
              special case, and it stays correct the moment a second commentary
              is imported. Absent any, no button renders — the action is not
              offered where it could not work. */}
          {commentaries.map((work) => (
            <Button
              key={work.id}
              variant="ghost"
              onClick={() => {
                onSharh(work);
                onClose();
              }}
            >
              <span dir="rtl" lang="ar" className="arabic">
                {work.title}
              </span>
            </Button>
          ))}
        </div>
        )
      }
    >
      {/* Gradings first. They are the facts that decide how a ḥadīth is used.
          Shown as a list and never merged: several scholars grading the same
          narration differently is information to teach from, not noise. The
          block is visually set apart and labelled, with the narrator it was
          matched on shown alongside, so a bad match is visible to the user
          even when the matcher is the thing that got it wrong. */}
      {gradings.length > 0 && (
        <div className="mb-3 rounded-md border border-slate-300 bg-slate-50">
          <p className="flex flex-wrap items-baseline gap-x-2 border-b border-slate-200 px-2.5 py-1.5 text-[10px] text-slate-600">
            <span className="font-medium">dorar.net</span>
            <span>
              {gradings.length} grading{gradings.length === 1 ? '' : 's'} of this narration
            </span>
            {record?.narrator && (
              <span dir="rtl" lang="ar" className="arabic ms-auto">
                الراوي: {record.narrator}
              </span>
            )}
          </p>

          <ul className="divide-y divide-slate-200">
            {gradings.map((grading, index) => (
              <li key={index} className="px-2.5 py-2">
                <p dir="rtl" lang="ar" className="arabic text-[15px]">
                  {grading.grade ?? '—'}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-600">
                  {grading.mohdith && (
                    <span dir="rtl" lang="ar">
                      المحدث: {grading.mohdith}
                    </span>
                  )}
                  {grading.book && (
                    <span dir="rtl" lang="ar">
                      المصدر: {grading.book}
                    </span>
                  )}
                  {grading.numberOrPage && (
                    <span dir="rtl" lang="ar">
                      الصفحة أو الرقم: {grading.numberOrPage}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && diagnostics?.problem && (
        <p className="mb-3 rounded-md border border-rule bg-parchment px-2.5 py-1.5 text-[11px] text-muted">
          No grading found. {diagnostics.problem}
        </p>
      )}

      <p
        dir="rtl"
        lang="ar"
        className="arabic mb-3 text-[17px] leading-loose"
        style={{ ['--reader-line-height' as string]: '2.0' }}
      >
        {record?.arabic || sourceText}
      </p>

      {loading && (
        <Spinner
          label={
            indexing
              ? `Building the ḥadīth text index (first use): ${indexing.stage === 'reading' ? 'reading ' : ''}${indexing.done.toLocaleString()} of ${indexing.total.toLocaleString()}…`
              : 'Looking it up…'
          }
        />
      )}

      {!loading && record?.english && (
        <>
          <p dir="ltr" className="ltr-isolate text-[14px] leading-relaxed">
            <BidiText>{record.english}</BidiText>
          </p>
          <p className="mt-2 text-[10px] text-muted">
            {record.sourceId === 'hadith-json' ? HADITH_JSON_ATTRIBUTION : 'sunnah.com'}
            {text?.status === 'matched' && (
              <>
                {' · '}
                {collectionName(text.collection)},{' '}
                {text.short ? 'identified by a short quotation' : 'identified by its text'}
              </>
            )}
          </p>
          {text?.status === 'matched' && (text.partial || text.repetitions > 0) && (
            <p className="mt-1 text-[10px] text-muted">
              {text.partial && `${HADITH_QUOTED_IN_PART} `}
              {text.repetitions > 0 &&
                `The same matn appears ${text.repetitions} more time${text.repetitions === 1 ? '' : 's'} in this collection.`}
            </p>
          )}
        </>
      )}

      {!loading && !record?.english && scopedMiss && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          No verified English translation is available for this ḥadīth, so none is shown. A
          machine translation is deliberately not produced for ḥadīth text.
          {/* The book's own collection was searched by its text. sunnah.com is
              not offered: a non-citable book's numbers are never sent there.
              The import hint is the author's business, as below. */}
          {text.status === 'no-match' && (
            <> No ḥadīth in the imported {collectionName(text.collection)} matched this text.</>
          )}
          {text.status === 'ambiguous' && (
            <> This text matches more than one ḥadīth in {collectionName(text.collection)}, so none is shown.</>
          )}
          {text.status === 'too-short' && (
            <> The quotation is too short to identify by its text in the imported {collectionName(text.collection)}.</>
          )}
          {text.status === 'none-near' && (
            <>
              {' '}
              No ḥadīth of the imported {collectionName(text.collection)} near the number the book gives contains
              these words; the file’s numbering may differ from the book’s.
            </>
          )}
          {text.status === 'not-imported' && !readOnly && (
            <>
              {' '}
              Import <code>{hadithJsonCollection(text.collection)?.fileName ?? `${text.collection}.json`}</code>{' '}
              (hadith-json) in{' '}
              <button className="underline" onClick={() => navigate({ name: 'settings' })}>
                Settings
              </button>{' '}
              to find this ḥadīth by its text.
            </>
          )}
        </p>
      )}

      {!loading && !record?.english && !scopedMiss && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          No verified English translation is available for this ḥadīth, so none is shown. A
          machine translation is deliberately not produced for ḥadīth text.
          {/* The key prompt is the author's business. A visitor is told the
              translation is absent — which is the honest and important part —
              without being sent to configure a service to fix it. */}
          {!secrets.getSunnahKey() && !readOnly && (
            <>
              {' '}
              sunnah.com is the source that carries one, and it needs a key —{' '}
              <button
                className="underline"
                onClick={() => navigate({ name: 'settings' })}
              >
                add it in Settings
              </button>
              , or import there the hadith-json file for the collection this book comments on.
            </>
          )}
        </p>
      )}

      {gradings.find((grading) => grading.takhrij) && (
        <p dir="rtl" lang="ar" className="arabic mt-3 text-[12px] text-muted">
          التخريج: {gradings.find((grading) => grading.takhrij)!.takhrij}
        </p>
      )}

      {/* Diagnostics. This is scraped markup behind a JSON envelope, so it will
          break when dorar changes their page — and when it does, "what came
          back and what was it matched against" is the only useful question. */}
      {diagnostics && (
        <div className="mt-3 border-t border-rule pt-2">
          <button
            className="text-[10px] text-muted underline"
            onClick={() => setShowDiagnostics((previous) => !previous)}
          >
            {showDiagnostics ? 'Hide' : 'Show'} dorar diagnostics
          </button>

          {showDiagnostics && (
            <dl className="mt-2 space-y-1 text-[10px] text-muted">
              <Diagnostic label="Request">{diagnostics.url}</Diagnostic>
              <Diagnostic label="Status">{String(diagnostics.status)}</Diagnostic>
              <Diagnostic label="Narrator matched against">
                {diagnostics.narrator ?? '(none could be read from the passage)'}
              </Diagnostic>
              <Diagnostic label="Records returned">
                {`${diagnostics.parsed}, of which ${diagnostics.matched} passed the narrator filter`}
              </Diagnostic>
              <Diagnostic label="Narrators seen">
                {diagnostics.narratorsSeen.join(' · ') || '—'}
              </Diagnostic>
              {diagnostics.rawResponse && (
                <div>
                  <dt className="font-medium">Raw response</dt>
                  <dd>
                    <pre
                      dir="ltr"
                      className="mt-1 max-h-40 overflow-auto rounded border border-rule bg-parchment p-1.5 text-[9px] whitespace-pre-wrap"
                    >
                      {diagnostics.rawResponse}
                    </pre>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </AnchoredPanel>
  );
}
