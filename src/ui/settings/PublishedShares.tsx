import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { ShareRecord } from '../../types';
import { shareFileName, shareLinkFromKeyText } from '../../share/shareLink';
import { Button } from '../common';

// Chapters this device has published, and the honest limits of that list.
//
// ---------------------------------------------------------------------------
// This is a record, not a registry
//
// The files live in a git repository. Nothing here can read that repository, so
// this list says what this device published — not what is currently fetchable.
// A share published from another device is absent; one whose file was deleted
// by hand still shows. That gap is stated on screen rather than papered over,
// because a list that quietly implied otherwise would be worse than no list.
//
// What it does hold is the thing that exists nowhere else: each share's
// decryption key. A bundle's key lives in its link and in this record, so this
// is the only way to recover a link that was lost — and the only reason the
// record is worth keeping at all.
//
// ---------------------------------------------------------------------------
// Withdrawing
//
// "Withdraw" cannot unpublish. It removes the local record and tells you which
// file to delete and push. Saying "Delete" would claim an effect the app does
// not have, and the failure would be silent: the author would believe a chapter
// was withdrawn while its link kept working.
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PublishedShares() {
  const { storage } = useApp();
  const [records, setRecords] = useState<ShareRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<ShareRecord | null>(null);

  const refresh = useCallback(async () => {
    setRecords(await storage.listShareRecords());
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copy = (record: ShareRecord) => {
    const link = shareLinkFromKeyText(record.id, record.key);
    void navigator.clipboard.writeText(link).then(
      () => {
        setCopiedId(record.id);
        setTimeout(() => setCopiedId(null), 1500);
      },
      () => setCopiedId(null),
    );
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Published chapters</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Shared links made on this device. Each one carries its own key — the only copy, so
        a link that is lost cannot be rebuilt from anywhere else.
      </p>

      {records.length === 0 ? (
        <div className="rounded-md border border-dashed border-rule p-4 text-sm">
          <p className="mb-1 font-medium">Nothing published yet</p>
          <p className="text-muted">
            In the reader, open a chapter and use <strong>Share</strong>. It produces a file
            to commit to <code className="rounded bg-rule/50 px-1">public/shares/</code> and a
            link to hand out.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <div key={record.id} className="rounded-md border border-rule px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span
                  className="arabic min-w-0 flex-1 truncate text-right text-[13px]"
                  dir="rtl"
                  lang="ar"
                >
                  {record.rangeLabel || record.title}
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  {new Date(record.createdAt).toLocaleDateString()} ·{' '}
                  {formatBytes(record.bytes)}
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="arabic min-w-0 truncate text-[11px] text-muted" dir="rtl" lang="ar">
                  {record.bookTitle}
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  {record.blocks.toLocaleString()} paragraphs · {record.cards.toLocaleString()}{' '}
                  cards · {record.marks.toLocaleString()} marks
                </span>
                <span className="ms-auto flex shrink-0 gap-2">
                  <Button onClick={() => copy(record)}>
                    {copiedId === record.id ? 'Copied' : 'Copy link'}
                  </Button>
                  <Button variant="danger" onClick={() => setWithdrawing(record)}>
                    Withdraw
                  </Button>
                </span>
              </div>

              {withdrawing?.id === record.id && (
                <Withdraw
                  record={record}
                  onCancel={() => setWithdrawing(null)}
                  onForget={async () => {
                    await storage.deleteShareRecord(record.id);
                    setWithdrawing(null);
                    await refresh();
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted">
        This list is what this device published, not what is currently online. A chapter
        shared from another device will not appear here, and one whose file has been
        deleted from the repository will.
      </p>
    </section>
  );
}

function Withdraw({
  record,
  onCancel,
  onForget,
}: {
  record: ShareRecord;
  onCancel: () => void;
  onForget: () => Promise<void>;
}) {
  return (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
      <p className="mb-1 font-medium">Withdrawing takes two steps, and only one is here.</p>
      <ol className="mb-2 list-decimal space-y-0.5 pl-4">
        <li>
          Delete{' '}
          <code className="rounded bg-amber-100 px-1">
            public/shares/{shareFileName(record.id)}
          </code>{' '}
          and push. The link stops working then, not before.
        </li>
        <li>Forget the local record here, so it leaves this list.</li>
      </ol>
      {/* Stated because "deleted and pushed" is not the same as "gone", and
          somebody withdrawing a chapter for a reason needs to know which one
          they got. */}
      <p className="mb-2">
        Git keeps history, so the encrypted file remains in earlier commits. It stays
        unreadable without the link — but if the link itself has gone somewhere you did not
        intend, removing the file is not enough.
      </p>
      <div className="flex gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={() => void onForget()}>
          Forget this record
        </Button>
      </div>
    </div>
  );
}
