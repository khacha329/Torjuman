import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { secrets } from '../../app/secrets';
import { useOnline } from '../../app/useOnline';
import { BidiText } from '../../components/BidiText';
import { fetchVerse } from '../../retrieval/quran';
import { lookupHadith } from '../../retrieval/HadithSource';
import type { DorarDiagnostics } from '../../retrieval/dorar';
import { loadQuranEnglish, loadQuranIndex, type QuranEnglish, type QuranIndex } from '../../quran/quranIndex';
import {
  compileAyah,
  compileCacheKey,
  type CompileSource,
} from '../../qul/compile';
import {
  firstAyahOf,
  similarFor,
  surahInfoFor,
  tafsirFor,
  topicsFor,
  type RelatedAyah,
  type SurahInfoResult,
  type TafsirResult,
  type TopicResult,
} from '../../qul/service';
import { isCloudProvider } from '../../translation/TranslationProvider';
import type {
  Book,
  Entity,
  HadithRecord,
  ProviderId,
  QulCompilation,
  QuranVerse,
} from '../../types';
import { commentaryWorks } from '../../retrieval/sharh';
import { AnchoredPanel } from './AnchoredPanel';
import {
  ArabicVerse,
  MissingResource,
  SimilarTab,
  SurahTab,
  TafsirTab,
  TopicsTab,
} from './QuranTabs';
import { Button, Spinner } from '../common';

// The sheet that opens when a verse or ḥadīth is tapped.
//
// ---------------------------------------------------------------------------
// A verse sheet is a tabbed reference view
//
// The reference is already known — it was resolved against the bundled muṣḥaf
// at import time — and every QUL resource is keyed by exactly that. So each tab
// is a keyed read: no search, no inference, no model, no network. What the user
// has installed decides which tabs exist, and a tab with nothing behind it is
// not shown at all rather than shown empty.
//
// The panel starts as a popover, because a verse and its translation are a
// glance. Opening a heavier tab promotes it to a bottom sheet: a tafsīr passage
// on al-Baqarah 255 is not a glance, and reading it in a 400px popover is
// worse than the transition.
// ---------------------------------------------------------------------------

type TabId = 'translation' | 'tafsir' | 'similar' | 'topics' | 'surah' | 'compile';

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

export function EntitySheet(props: {
  entity: Entity;
  anchor: HTMLElement;
  /** The Arabic this entity covers, read out of the blocks. */
  sourceText: string;
  /** The passage around it, where the isnād names the narrator. */
  contextText: string;
  onClose: () => void;
  onTranslateSurrounding: () => void;
  /** Look this ḥadīth up in one imported commentary. */
  onSharh: (book: Book) => void;
  /** Propose translating this ḥadīth's whole commentary. */
  onTranslateAll: () => void;
}) {
  return props.entity.type === 'quran' ? (
    <QuranSheet {...props} />
  ) : (
    <HadithSheet {...props} />
  );
}

// ------------------------------------------------------------------ Qurʾān

interface QuranSheetData {
  verse: QuranVerse | null;
  bundledEnglish: string;
  bundledName: string;
  tafsir: TafsirResult[];
  similar: RelatedAyah[];
  topics: TopicResult[];
  surah: SurahInfoResult | null;
  quran: QuranIndex;
  english: QuranEnglish;
  resourceIds: string[];
}

function QuranSheet({
  entity,
  anchor,
  onClose,
  onTranslateSurrounding,
}: {
  entity: Entity;
  anchor: HTMLElement;
  onClose: () => void;
  onTranslateSurrounding: () => void;
}) {
  const { http, storage, settings, activeProfile } = useApp();
  const [data, setData] = useState<QuranSheetData | null>(null);
  const [tab, setTab] = useState<TabId>('translation');

  const ayahKey = firstAyahOf(entity.reference);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [quran, english, resources] = await Promise.all([
        loadQuranIndex(),
        loadQuranEnglish(),
        storage.listQulResources(),
      ]);
      if (cancelled) return;

      const [tafsir, similar, topics, surah] = await Promise.all([
        tafsirFor(storage, resources, entity.reference),
        similarFor(storage, resources, entity.reference, quran, english),
        topicsFor(storage, resources, entity.reference),
        surahInfoFor(storage, resources, entity.reference),
      ]);
      if (cancelled) return;

      // The bundled translation is always available; the online lookup only
      // upgrades it to whichever translation the user picked in Settings.
      const range = quran.flatRangeOf(entity.reference);
      const bundledEnglish = range ? english.range(range[0], range[1]) : '';

      setData({
        verse: null,
        bundledEnglish,
        bundledName: english.translation,
        tafsir,
        similar,
        topics,
        surah,
        quran,
        english,
        resourceIds: resources.map((resource) => resource.id),
      });

      const verse = await fetchVerse(http, storage, ayahKey, {
        translationId: settings.quranTranslationId,
        translationName: settings.quranTranslationName,
      });
      if (!cancelled && verse) {
        setData((previous) => (previous ? { ...previous, verse } : previous));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ayahKey,
    entity.reference,
    http,
    storage,
    settings.quranTranslationId,
    settings.quranTranslationName,
  ]);

  // Only tabs with something behind them. Translation is always one of them,
  // because both the Arabic and an English rendering are bundled.
  const tabs = useMemo(() => {
    const available: [TabId, string][] = [['translation', 'Translation']];
    if (!data) return available;
    if (data.tafsir.length > 0) available.push(['tafsir', 'Tafsīr']);
    if (data.similar.length > 0) available.push(['similar', 'Similar']);
    if (data.topics.length > 0) available.push(['topics', 'Topics']);
    if (data.surah) available.push(['surah', 'Surah']);
    if (settings.compileEnabled) available.push(['compile', 'Compiled']);
    return available;
  }, [data, settings.compileEnabled]);

  const active = tabs.some(([id]) => id === tab) ? tab : 'translation';

  return (
    <AnchoredPanel
      anchor={anchor}
      onClose={onClose}
      preferSheet={active !== 'translation'}
      title={
        <>
          <span className="rounded-full bg-verse/10 px-2 py-0.5 text-[10px] font-medium text-verse">
            Qurʾān
          </span>
          <span className="text-[12px] font-medium">{entity.label ?? entity.reference}</span>
          {entity.matchQuality === 'partial' && (
            <span
              className="text-[10px] text-muted"
              title="This wording appears in more than one place, so the reference is the first match"
            >
              ambiguous
            </span>
          )}
        </>
      }
      footer={
        <Button
          onClick={() => {
            onTranslateSurrounding();
            onClose();
          }}
        >
          Translate the surrounding passage
        </Button>
      }
    >
      {tabs.length > 1 && (
        <div className="no-select sticky top-0 z-10 -mx-3 -mt-3 mb-3 flex gap-1 overflow-x-auto border-b border-rule bg-white px-3 pt-2">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 border-b-2 px-2 pb-1.5 text-[12px] transition ${
                active === id
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!data && <Spinner label="Reading local resources…" />}

      {data && active === 'translation' && (
        <>
          {entity.textUthmani && <ArabicVerse text={entity.textUthmani} />}
          <p dir="ltr" className="ltr-isolate mt-3 text-[14px] leading-relaxed">
            <BidiText>{data.verse?.english || data.bundledEnglish}</BidiText>
          </p>
          <p className="mt-2 text-[10px] text-muted">
            {data.verse?.translationName ?? `${data.bundledName} (bundled)`}
          </p>
          {/* Without this the feature is invisible: one tab and no hint that
              tafsīr, similar āyāt and topics are a file import away. */}
          {data.resourceIds.length === 0 && (
            <div className="mt-3">
              <MissingResource
                what="QUL resource"
                onOpenSettings={() => navigate({ name: 'settings' })}
              />
            </div>
          )}
        </>
      )}

      {data && active === 'tafsir' && <TafsirTab passages={data.tafsir} />}
      {data && active === 'similar' && <SimilarTab ayat={data.similar} />}
      {data && active === 'topics' && (
        <TopicsTab
          topics={data.topics}
          ayahKey={ayahKey}
          quran={data.quran}
          english={data.english}
        />
      )}
      {data && active === 'surah' && data.surah && <SurahTab surah={data.surah} />}
      {data && active === 'compile' && (
        <CompileTab
          entity={entity}
          ayahKey={ayahKey}
          data={data}
          providerId={activeProfile.providerId}
          model={activeProfile.model}
        />
      )}
    </AnchoredPanel>
  );
}

// ----------------------------------------------------------------- compiled

/**
 * The compiled view.
 *
 * It is an additional tab and never a replacement: the source tabs stay exactly
 * where they were, individually readable, which is what makes a compiled
 * paragraph checkable. The badge says what it is on every render, not only the
 * first.
 */
function CompileTab({
  entity,
  ayahKey,
  data,
  providerId,
  model,
}: {
  entity: Entity;
  ayahKey: string;
  data: QuranSheetData;
  providerId: ProviderId;
  model: string;
}) {
  const { storage } = useApp();
  const online = useOnline();
  const [record, setRecord] = useState<QulCompilation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cloud = isCloudProvider(providerId) ? providerId : null;
  const apiKey = cloud ? secrets.getProviderKey(cloud) : '';
  const cacheKey = cloud
    ? compileCacheKey({ ayahKey, resourceIds: data.resourceIds, providerId: cloud, model })
    : '';

  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    void storage.getQulCompilation(cacheKey).then((found) => {
      if (!cancelled) setRecord(found ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, storage]);

  const run = async () => {
    if (!cloud) return;
    setBusy(true);
    setError(null);
    try {
      const source: CompileSource = {
        ayahKey,
        ayahLabel: entity.label ?? entity.reference,
        arabic: entity.textUthmani ?? '',
        english: data.verse?.english || data.bundledEnglish,
        englishAttribution: data.verse?.translationName ?? data.bundledName,
        tafsir: data.tafsir.map((passage) => ({
          name: passage.resource.name,
          coverage: passage.coverage,
          text: passage.text,
        })),
        similar: data.similar.map((ayah) => ({
          label: ayah.label,
          arabic: ayah.arabic,
          english: ayah.english,
        })),
        topics: data.topics.map((topic) => ({
          name: topic.name,
          description: topic.description,
        })),
        surah: data.surah
          ? { name: data.surah.info.surahName, text: data.surah.info.text }
          : null,
      };

      const result = await compileAyah({ providerId: cloud, model, apiKey, source });
      const next: QulCompilation = {
        cacheKey,
        ayahKey,
        resourceIds: data.resourceIds,
        providerId: cloud,
        model,
        text: result.text,
        createdAt: Date.now(),
        usage: result.usage,
        costUsd: result.costUsd,
      };
      await storage.putQulCompilation(next);
      setRecord(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const blocked = !cloud
    ? 'Compiling needs a cloud provider. The active profile is on the on-device model.'
    : !apiKey
      ? `No ${cloud} API key is set. Add one in Settings.`
      : !online
        ? 'Compiling needs a network. The tabs beside this one do not.'
        : null;

  return (
    <div>
      <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
        <strong>Generated.</strong> This paragraph is written by a model from the other tabs
        and from nothing else. The tabs remain the sources — read them when it matters.
      </p>

      {record && (
        <>
          <div dir="ltr" className="ltr-isolate space-y-2 text-[13px] leading-relaxed">
            {record.text.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index}>
                <BidiText>{paragraph}</BidiText>
              </p>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted">
            {record.model} · compiled from {record.resourceIds.length} installed resource
            {record.resourceIds.length === 1 ? '' : 's'}
          </p>
        </>
      )}

      {blocked && <p className="text-[12px] text-muted">{blocked}</p>}

      {!blocked && (
        <div className="mt-3">
          {busy ? (
            <Spinner label="Compiling…" />
          ) : (
            <Button onClick={() => void run()}>{record ? 'Compile again' : 'Compile'}</Button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-red-700">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ ḥadīth

/**
 * The ḥadīth sheet.
 *
 * Grading and attribution are shown prominently, because that is what a study
 * circle needs to know before the text is read out. The English is shown only
 * when a source that actually has one produced it: dorar.net returns Arabic
 * only, and the honest note stays in place rather than being filled in.
 */
function HadithSheet({
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
  const online = useOnline();
  const [record, setRecord] = useState<HadithRecord | null>(null);
  const [diagnostics, setDiagnostics] = useState<DorarDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loading, setLoading] = useState(true);

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

    void lookupHadith(
      http,
      storage,
      { reference: entity.reference, arabicText: sourceText, contextText },
      {
        sunnahApiKey: secrets.getSunnahKey(),
        preferred: settings.hadithSourceId,
        online,
      },
    ).then((found) => {
      if (cancelled) return;
      setRecord(found.record);
      setDiagnostics(found.diagnostics);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    contextText,
    entity.reference,
    http,
    online,
    settings.hadithSourceId,
    sourceText,
    storage,
  ]);

  const gradings = record?.gradings ?? [];

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
      footer={
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

      {loading && <Spinner label="Looking it up…" />}

      {!loading && record?.english && (
        <>
          <p dir="ltr" className="ltr-isolate text-[14px] leading-relaxed">
            <BidiText>{record.english}</BidiText>
          </p>
          <p className="mt-2 text-[10px] text-muted">sunnah.com</p>
        </>
      )}

      {!loading && !record?.english && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          No verified English translation is available for this ḥadīth, so none is shown. A
          machine translation is deliberately not produced for ḥadīth text.
          {!secrets.getSunnahKey() && (
            <>
              {' '}
              sunnah.com is the source that carries one, and it needs a key —{' '}
              <button
                className="underline"
                onClick={() => navigate({ name: 'settings' })}
              >
                add it in Settings
              </button>
              .
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
