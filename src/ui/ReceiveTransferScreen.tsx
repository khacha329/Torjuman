import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { navigate } from '../app/router';
import {
  inspectDeviceFile,
  restoreDevice,
  roomFor,
  type DeviceTransferProgress,
  type DeviceTransferSummary,
} from '../library/deviceTransfer';
import { discardIncomingTransfer, takeIncomingTransfer } from '../library/incomingTransfer';
import { Button, TopBar } from './common';

// The receiving half of moving to another tablet.
//
// Three steps, and the order is the safety: read the whole file and prove it
// is complete (nothing written), show what it holds and what it will replace,
// and only on an explicit yes empty this tablet and restore. See
// src/library/deviceTransfer.ts.

/** The stores worth naming in the summary, in the order a reader thinks of them. */
const LABELS: [store: string, one: string, many: string][] = [
  ['books', 'book', 'books'],
  ['blocks', 'paragraph of text', 'paragraphs of text'],
  ['cards', 'translation card', 'translation cards'],
  ['explanationCards', 'explanation', 'explanations'],
  ['sharhCards', 'commentary card', 'commentary cards'],
  ['marks', 'mark or note', 'marks and notes'],
  ['glossary', 'glossary entry', 'glossary entries'],
  ['qulResources', 'QUL resource', 'QUL resources'],
  ['qulEntries', 'QUL entry', 'QUL entries'],
  ['narratorProfiles', 'narrator profile', 'narrator profiles'],
  ['biographyEntries', 'biography entry', 'biography entries'],
  ['dictionaryEntries', 'dictionary entry', 'dictionary entries'],
  ['positions', 'reading position', 'reading positions'],
];

type State =
  | { step: 'choose' }
  | { step: 'checking'; progress: DeviceTransferProgress | null }
  | { step: 'confirm'; file: File; summary: DeviceTransferSummary }
  | { step: 'restoring'; progress: DeviceTransferProgress | null }
  | { step: 'failed'; message: string };

export function ReceiveTransferScreen({ shared }: { shared: boolean }) {
  const { storage } = useApp();
  const [state, setState] = useState<State>(
    shared ? { step: 'checking', progress: null } : { step: 'choose' },
  );
  const [booksHere, setBooksHere] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void storage.listBooks().then((books) => setBooksHere(books.length));
  }, [storage]);

  const check = async (file: File) => {
    setState({ step: 'checking', progress: null });
    try {
      const summary = await inspectDeviceFile(file, storage, (progress) =>
        setState({ step: 'checking', progress }),
      );
      const noRoom = await roomFor(summary);
      if (noRoom) throw new Error(noRoom);
      setState({ step: 'confirm', file, summary });
    } catch (error) {
      setState({ step: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  // A file shared into the app is waiting in the cache; pick it up once.
  const sharedTaken = useRef(false);
  useEffect(() => {
    if (!shared || sharedTaken.current) return;
    sharedTaken.current = true;
    void takeIncomingTransfer().then((file) => {
      if (file) void check(file);
      else
        setState({
          step: 'failed',
          message: 'The shared file did not reach the app. Open it from here instead.',
        });
    });
  }, [shared]);

  const restore = async (file: File) => {
    setState({ step: 'restoring', progress: null });
    try {
      await restoreDevice(file, storage, {
        onProgress: (progress) => setState({ step: 'restoring', progress }),
      });
      await discardIncomingTransfer();
      // A full reload, not a re-render: every screen holds state read from the
      // database that was just replaced, and the setup flags have changed.
      window.location.replace(import.meta.env.BASE_URL);
    } catch (error) {
      setState({
        step: 'failed',
        message:
          `The restore stopped part way: ${error instanceof Error ? error.message : String(error)} ` +
          'This tablet is now incomplete. The other tablet still has everything — try again with the same file.',
      });
    }
  };

  const cancel = async () => {
    await discardIncomingTransfer();
    navigate({ name: 'library' });
  };

  const progress =
    state.step === 'checking' || state.step === 'restoring' ? state.progress : null;

  return (
    <div dir="ltr" className="ltr-isolate flex h-full flex-col">
      <TopBar title="Receive from another tablet">
        {state.step !== 'restoring' && (
          <Button variant="ghost" onClick={() => void cancel()}>
            Cancel
          </Button>
        )}
      </TopBar>

      <main className="mx-auto w-full max-w-lg flex-1 overflow-auto p-6">
        {state.step === 'choose' && (
          <section className="rounded-lg border border-rule bg-white p-5">
            <p className="mb-4 text-sm text-muted">
              On the other tablet, open <strong>Settings → Move to another tablet</strong>,
              create the transfer file and send it here — with Quick Share, a cable or
              Drive. Then open it below, or share it straight to this app.
            </p>
            <Button variant="primary" onClick={() => fileRef.current?.click()}>
              Open the transfer file
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void check(file);
                event.target.value = '';
              }}
            />
          </section>
        )}

        {(state.step === 'checking' || state.step === 'restoring') && (
          <section className="rounded-lg border border-rule bg-white p-5">
            <p className="mb-2 text-sm">
              {state.step === 'checking'
                ? 'Checking the file is complete. Nothing on this tablet is changed yet.'
                : 'Restoring. Keep the app open until it finishes.'}
            </p>
            <p className="mb-2 text-xs text-muted">{progress?.message ?? 'Starting…'}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
          </section>
        )}

        {state.step === 'confirm' && (
          <section className="rounded-lg border border-rule bg-white p-5">
            <h2 className="mb-1 font-medium">The file is complete</h2>
            <p className="mb-3 text-xs text-muted">
              Made {new Date(state.summary.exportedAt).toLocaleString()}
            </p>
            <ul className="mb-4 space-y-0.5 text-sm">
              {LABELS.filter(([store]) => (state.summary.counts[store] ?? 0) > 0).map(
                ([store, one, many]) => (
                  <li key={store}>
                    {state.summary.counts[store].toLocaleString()}{' '}
                    {state.summary.counts[store] === 1 ? one : many}
                  </li>
                ),
              )}
              <li>
                {state.summary.includesApiKeys
                  ? 'Your API keys'
                  : 'No API keys — you will enter them again here'}
              </li>
            </ul>

            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {booksHere
                ? `Everything on this tablet — its ${booksHere.toLocaleString()} book(s) and all its work — will be replaced by the contents of this file.`
                : 'Everything on this tablet will be replaced by the contents of this file.'}{' '}
              This cannot be undone here.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => void restore(state.file)}>
                Replace this tablet
              </Button>
              <Button onClick={() => void cancel()}>Cancel</Button>
            </div>
          </section>
        )}

        {state.step === 'failed' && (
          <section className="rounded-lg border border-rule bg-white p-5">
            <p className="mb-4 text-sm text-red-700">{state.message}</p>
            <Button onClick={() => setState({ step: 'choose' })}>Choose a file</Button>
          </section>
        )}
      </main>
    </div>
  );
}
