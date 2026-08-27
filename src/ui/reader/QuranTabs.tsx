import { useState } from 'react';
import { BidiText } from '../../components/BidiText';
import type { QulResource } from '../../types';
import {
  labelForAyah,
  qulTextBlocks,
  renderAyah,
  type RelatedAyah,
  type SurahInfoResult,
  type TafsirResult,
  type TopicResult,
} from '../../qul/service';
import type { QuranEnglish, QuranIndex } from '../../quran/quranIndex';

// The bodies of the Qurʾān entity sheet's tabs.
//
// Everything rendered here was retrieved, not generated: the Arabic is the
// bundled muṣḥaf, the English is the bundled translation, the commentary is
// what the mufassir wrote, the topics are QUL's own editorial grouping. Only
// the Compile tab generates, and it lives in its own component with its own
// badge so the distinction is visible rather than remembered.

export function ArabicVerse({ text, size = 19 }: { text: string; size?: number }) {
  return (
    <p
      dir="rtl"
      lang="ar"
      className="arabic text-verse leading-loose"
      style={{ fontSize: size, ['--reader-line-height' as string]: '2.1' }}
    >
      {text}
    </p>
  );
}

/** A related āyah, shown whole. There is no reader view to link to. */
export function RelatedAyahView({ ayah }: { ayah: RelatedAyah }) {
  return (
    <div className="border-t border-rule pt-2 first:border-t-0 first:pt-0">
      <p className="mb-1 text-[10px] font-medium tracking-wide text-muted uppercase">
        {ayah.label}
        {ayah.match && (
          <span className="ml-2 normal-case">
            {ayah.match.matchedWords} word{ayah.match.matchedWords === 1 ? '' : 's'} ·{' '}
            {ayah.match.coverage}% coverage
          </span>
        )}
      </p>
      {ayah.arabic && <ArabicVerse text={ayah.arabic} size={17} />}
      {ayah.english && (
        <p dir="ltr" className="ltr-isolate mt-1 text-[13px] leading-relaxed">
          <BidiText>{ayah.english}</BidiText>
        </p>
      )}
    </div>
  );
}

export function TafsirTab({ passages }: { passages: TafsirResult[] }) {
  return (
    <div className="space-y-4">
      {passages.map((passage) => (
        <section key={passage.resource.id}>
          <p className="mb-1.5 flex flex-wrap items-baseline gap-2 text-[10px] text-muted">
            <span className="font-medium">{passage.resource.name}</span>
            {/* A grouped passage is written about the whole range, so saying
                so is the difference between a citation and a misquotation. */}
            <span>covers {passage.coverage}</span>
          </p>
          {qulTextBlocks(passage.text).map((block, index) =>
            block.kind === 'heading' ? (
              <h4
                key={index}
                dir="rtl"
                lang="ar"
                className="arabic mt-3 mb-1 text-[15px] font-semibold"
              >
                {block.text}
              </h4>
            ) : (
              <p
                key={index}
                dir="rtl"
                lang="ar"
                className="arabic mb-2 text-[16px] leading-loose"
                style={{ ['--reader-line-height' as string]: '2.0' }}
              >
                {block.text}
              </p>
            ),
          )}
        </section>
      ))}
    </div>
  );
}

export function SimilarTab({ ayat }: { ayat: RelatedAyah[] }) {
  return (
    <div className="space-y-3">
      {ayat.map((ayah) => (
        <RelatedAyahView key={ayah.ayahKey} ayah={ayah} />
      ))}
    </div>
  );
}

const TOPIC_AYAH_LIMIT = 20;

export function TopicsTab({
  topics,
  ayahKey,
  quran,
  english,
}: {
  topics: TopicResult[];
  ayahKey: string;
  quran: QuranIndex;
  english: QuranEnglish;
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {topics.map((topic) => {
        const others = topic.ayahKeys.filter((key) => key !== ayahKey);
        const expanded = open === topic.topicId;

        return (
          <div key={topic.topicId} className="rounded-md border border-rule">
            <button
              className="flex w-full items-baseline gap-2 px-2.5 py-2 text-left"
              onClick={() => setOpen(expanded ? null : topic.topicId)}
            >
              <span className="text-[13px] font-medium">{topic.name}</span>
              {topic.arabicName && (
                <span dir="rtl" lang="ar" className="arabic text-[13px] text-muted">
                  {topic.arabicName}
                </span>
              )}
              <span className="ml-auto shrink-0 text-[10px] text-muted">
                {others.length} other āya{others.length === 1 ? 'h' : 't'}
              </span>
            </button>

            {expanded && (
              <div className="border-t border-rule px-2.5 py-2">
                {topic.description && (
                  <div className="mb-3">
                    {qulTextBlocks(topic.description).map((block, index) => (
                      <p key={index} dir="ltr" className="ltr-isolate text-[12px] text-muted">
                        <BidiText>{block.text}</BidiText>
                      </p>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  {others.slice(0, TOPIC_AYAH_LIMIT).map((key) => (
                    <RelatedAyahView key={key} ayah={renderAyah(key, quran, english)} />
                  ))}
                </div>

                {others.length > TOPIC_AYAH_LIMIT && (
                  <p className="mt-2 text-[10px] text-muted">
                    Showing the first {TOPIC_AYAH_LIMIT} of {others.length}. Wide topics
                    carry hundreds of āyāt and are more use as a label than as a list.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SurahTab({ surah }: { surah: SurahInfoResult }) {
  return (
    <div>
      <p className="mb-2 text-[10px] text-muted">
        {surah.info.surahName} · {surah.resource.name}
      </p>
      {qulTextBlocks(surah.info.text).map((block, index) =>
        block.kind === 'heading' ? (
          <h4 key={index} dir="ltr" className="ltr-isolate mt-3 mb-1 text-[13px] font-semibold">
            {block.text}
          </h4>
        ) : (
          <p key={index} dir="ltr" className="ltr-isolate mb-2 text-[13px] leading-relaxed">
            <BidiText>{block.text}</BidiText>
          </p>
        ),
      )}
    </div>
  );
}

/** The list shown when a tab exists but the resource behind it is not installed. */
export function MissingResource({
  what,
  onOpenSettings,
}: {
  what: string;
  onOpenSettings: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-rule p-3 text-[12px]">
      <p className="mb-2 text-muted">
        No {what} is installed. Download one from QUL in a browser and import it in
        Settings → Reference works.
      </p>
      <button className="text-accent underline" onClick={onOpenSettings}>
        Open Settings
      </button>
    </div>
  );
}

export { labelForAyah };
export type { QulResource };
