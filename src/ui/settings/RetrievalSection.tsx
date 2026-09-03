import { useEffect, useState } from 'react';
import {
  clearRetrievalLog,
  OUTCOME_LABEL,
  OUTCOME_MEANING,
  subscribeRetrieval,
  type RetrievalKind,
  type RetrievalOutcome,
  type RetrievalRecord,
} from '../../app/retrievalLog';
import { Button } from '../common';

// What retrieval did, on the device it did it on.
//
// This panel exists because the tablet is where the failures happen and the
// console is not reachable there. Everything below is already in memory; this
// only makes it readable without a cable.
//
// The outcome chip is the whole point. "Nothing appeared" is the same picture
// for a missing resource, a broken request and an honest empty answer, and only
// one of those three is a bug worth chasing.

const KIND_LABEL: Record<RetrievalKind, string> = {
  quran: 'Qurʾān',
  hadith: 'Ḥadīth',
  biography: 'Biography',
  seed: 'Resources',
};

/**
 * Outcome colours.
 *
 * Deliberately three signals rather than a red/green pair: `no-match` is a
 * correct result and must not be painted as a failure, or the panel teaches the
 * reader to chase the one outcome that never needs chasing.
 */
const OUTCOME_STYLE: Record<RetrievalOutcome, string> = {
  hit: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'no-match': 'bg-slate-50 text-slate-700 border-slate-200',
  'data-absent': 'bg-amber-50 text-amber-900 border-amber-200',
  'lookup-failed': 'bg-rose-50 text-rose-900 border-rose-200',
};

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function Attempt({ record }: { record: RetrievalRecord }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="border-t border-rule first:border-t-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 px-2.5 py-2 text-start transition hover:bg-rule/30"
      >
        <span className="shrink-0 font-mono text-[10px] text-muted">{timeOf(record.at)}</span>
        <span className="shrink-0 text-[11px] font-medium">{KIND_LABEL[record.kind]}</span>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] ${
            OUTCOME_STYLE[record.outcome]
          }`}
        >
          {OUTCOME_LABEL[record.outcome]}
        </span>
        <span dir="auto" className="min-w-0 flex-1 truncate text-[12px]">
          {record.query}
        </span>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5">
          <p className="mb-1 text-[11px] text-muted">{OUTCOME_MEANING[record.outcome]}</p>
          <p dir="auto" className="mb-2 text-[12px]">
            {record.summary}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {record.detail.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-[10px] text-muted">{label}</dt>
                {/* dir="auto" throughout: a value here can be a URL, an HTTP
                    body, or a line of Arabic, and forcing either direction
                    mangles the other. */}
                <dd dir="auto" className="font-mono text-[10px] break-words">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}

export function RetrievalSection() {
  const [records, setRecords] = useState<readonly RetrievalRecord[]>([]);

  useEffect(() => subscribeRetrieval(setRecords), []);

  const faults = records.filter((record) => record.outcome === 'lookup-failed').length;
  const absent = records.filter((record) => record.outcome === 'data-absent').length;

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Retrieval</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        The last {records.length === 0 ? 'few' : records.length} lookups this session.
        Tap one to see the request, what came back, and what it was matched against.
        Cleared on reload.
      </p>

      {records.length === 0 ? (
        <p className="text-[12px] text-muted">
          Nothing looked up yet. Open a verse, a ḥadīth or a name in the reader and
          it appears here.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[12px]">
            {faults === 0 && absent === 0
              ? 'No faults recorded this session.'
              : [
                  faults > 0 ? `${faults} fault${faults === 1 ? '' : 's'}` : null,
                  absent > 0 ? `${absent} with the source not installed` : null,
                ]
                  .filter(Boolean)
                  .join(', ') + '.'}
          </p>

          <ul className="max-h-96 overflow-y-auto rounded-md border border-rule">
            {records.map((record) => (
              <Attempt key={record.id} record={record} />
            ))}
          </ul>

          <div className="mt-3">
            <Button onClick={clearRetrievalLog}>Clear</Button>
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] text-muted">
        Contains no API keys — request headers are never recorded. Short quotations
        from an imported book may appear, because seeing the wrong passage is
        usually the only way to recognise it.
      </p>
    </section>
  );
}
