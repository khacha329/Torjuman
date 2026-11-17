import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { secrets } from '../../services/secrets';
import { useOnline } from '../../app/useOnline';
import { BidiText } from '../../components/BidiText';
import {
  compileAyah,
  compileCacheKey,
  type CompileSource,
} from '../../qul/compile';
import { isCloudProvider } from '../../lib/providers';
import type {
  Entity,
  ProviderId,
  QulCompilation,
} from '../../types';
import { Button, Spinner } from '../kit';
import type { QuranSheetData } from './quranSheetData';

// The verse sheet's "Compiled" tab, offered by QuranSheet when Settings turns
// compiling on: a model's paragraph written from the other tabs, cached by
// āyah, resources, provider and model. Moved verbatim from EntitySheet.tsx in
// restructure Phase 5 step 5e3 (docs/refactor/plans/phase5-big-ui-files.md).

// ----------------------------------------------------------------- compiled

/**
 * The compiled view.
 *
 * It is an additional tab and never a replacement: the source tabs stay exactly
 * where they were, individually readable, which is what makes a compiled
 * paragraph checkable. The badge says what it is on every render, not only the
 * first.
 */
export function CompileTab({
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
