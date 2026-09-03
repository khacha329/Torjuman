import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { importItqanFile } from '../../biography/narratorService';
import { isItqanShard } from '../../biography/itqan';
import { Button } from '../common';

// Installing narrator data.
//
// ---------------------------------------------------------------------------
// Pointers, not content — again
//
// The same arrangement as the licensed QUL resources, for the same reason. The
// Itqan repository has no LICENSE file, and the licence section of its README
// covers the code and two lexicons while saying nothing about the narrator
// database; it also aggregates third-party datasets whose terms its author does
// not hold. So this app ships the knowledge of what to install and how to read
// it, and the reader installs the file. Nothing is redistributed here.
//
// Without any of it the card still works. Taqrīb at-Tahdhīb is imported through
// the ordinary catalog path and read from its body, and it supplies Ibn Ḥajar's
// verdict and the ṭabaqa — the two fields the reference layout attributes to
// him. Itqan fills lineage, residence, birth and the scholars' statements for
// the narrators it has.
// ---------------------------------------------------------------------------

const SHARDS = [
  ['profiles_companion.json', '10,880 Companions', '13 MB'],
  ['profiles_reliable.json', '26,467 narrators graded reliable', '33 MB'],
];

export function NarratorSources() {
  const { storage } = useApp();
  const [shards, setShards] = useState<{ shard: string; count: number }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    void storage.listNarratorShards().then(setShards);
  }, [storage]);

  useEffect(refresh, [refresh]);

  const installed = new Map(shards.map((entry) => [entry.shard, entry.count]));
  const fromTaqrib = shards.filter((entry) => entry.shard.startsWith('taqrib:'));

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      setNotice(null);

      for (const file of Array.from(files)) {
        setBusy(file.name);
        try {
          if (!isItqanShard(file.name)) {
            throw new Error(
              `${file.name} is not one of Itqan's profiles_*.json shards.`,
            );
          }
          // Parsed by the platform once. A 33 MB shard is large but this runs
          // on an explicit import, not at boot.
          const payload = JSON.parse(await file.text());
          const { imported, skipped } = await importItqanFile(storage, file.name, payload);
          setNotice(
            `${file.name}: ${imported.toLocaleString()} profiles installed` +
              (skipped > 0 ? `, ${skipped} rows had no usable name` : '') +
              '.',
          );
        } catch (error) {
          setNotice(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy(null);
        }
      }

      refresh();
      if (input.current) input.current.value = '';
    },
    [storage, refresh],
  );

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Narrator profiles</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        What fills the structured card when you tap a name. Taqrīb at-Tahdhīb is read
        from the book itself once you import it; the rest is optional.
      </p>

      {fromTaqrib.length > 0 && (
        <p className="mb-3 rounded-md border border-rule bg-parchment px-3 py-2 text-[12px]">
          <span dir="rtl" lang="ar" className="arabic">
            تقريب التهذيب
          </span>{' '}
          — {fromTaqrib.reduce((total, entry) => total + entry.count, 0).toLocaleString()}{' '}
          entries read from the imported book. Ibn Ḥajar's verdict and the ṭabaqa come
          from here.
        </p>
      )}

      <table className="w-full text-[12px]">
        <tbody>
          {SHARDS.map(([name, what, size]) => (
            <tr key={name} className="border-t border-rule/60">
              <td className="py-2 font-mono text-[11px]">{name}</td>
              <td className="py-2 text-muted">
                {what} · {size}
              </td>
              <td className="py-2 text-end">
                {installed.has(name) ? (
                  <span className="text-muted">
                    {installed.get(name)!.toLocaleString()} installed
                  </span>
                ) : (
                  <span className="text-muted">not installed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          multiple
          className="hidden"
          onChange={(event) => void onFiles(event.target.files)}
        />
        <Button onClick={() => input.current?.click()} disabled={busy !== null}>
          {busy ? `Reading ${busy}…` : 'Install a shard…'}
        </Button>
        {shards.some((entry) => !entry.shard.startsWith('taqrib:')) && (
          <Button
            variant="ghost"
            onClick={() => {
              void (async () => {
                for (const entry of shards) {
                  if (!entry.shard.startsWith('taqrib:')) {
                    await storage.deleteNarratorShard(entry.shard);
                  }
                }
                refresh();
                setNotice('Installed shards removed.');
              })();
            }}
          >
            Remove installed shards
          </Button>
        )}
      </div>

      {notice && <p className="mt-3 text-[12px]">{notice}</p>}

      <p className="mt-3 text-[11px] text-muted">
        Download these yourself from the Itqan repository, under{' '}
        <code>app/data/rijal/</code> on the <code>master</code> branch. They are not
        distributed with this app — see docs/RESOURCES.md for why.
      </p>
    </section>
  );
}
