import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useReadOnly } from '../../app/readOnly';
import { navigate } from '../../app/router';
import { BidiText } from '../../components/BidiText';
import { fetchVerse } from '../../retrieval/quran';
import { loadQuranEnglish, loadQuranIndex } from '../../quran/quranIndex';
import {
  firstAyahOf,
  similarFor,
  surahInfoFor,
  tafsirFor,
  topicsFor,
} from '../../qul/service';
import type {
  Book,
  Entity,
} from '../../types';
import { AnchoredPanel } from './AnchoredPanel';
import {
  ArabicVerse,
  MissingResource,
  SimilarTab,
  SurahTab,
  TafsirTab,
  TopicsTab,
} from './QuranTabs';
import { Button, Spinner } from '../kit';
import { HadithSheet } from './HadithSheet';
import type { QuranSheetData } from './quranSheetData';
import { CompileTab } from './CompileTab';

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
  const readOnly = useReadOnly();
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
      // The verse itself, its translation, its tafsīr and the topics all come
      // from data every install already has — which is exactly why none of it
      // travels in a bundle. Only this footer spends a key, so only it goes.
      footer={
        readOnly ? undefined : (
          <Button
            onClick={() => {
              onTranslateSurrounding();
              onClose();
            }}
          >
            Translate the surrounding passage
          </Button>
        )
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
          {/* Absent in a shared view: it invites the reader to import a
              resource into a library that is not theirs, to enrich a chapter
              they were merely sent. */}
          {data.resourceIds.length === 0 && !readOnly && (
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
