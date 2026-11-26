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
import {
  forgetRelay,
  parseRelayCode,
  RELAY_AVAILABLE,
  receiveViaRelay,
  type RelayProgress,
} from '../library/relayTransfer';
import { describeRestore, describeWorkBundle, readWorkBackup } from '../library/workBackup';
import type { WorkBundle } from '../platform/storage/StorageAdapter';
import { Button, inputClass, TopBar, ProgressBar } from './kit';
import { percentOf } from '../lib/format';

// The receiving half of moving to another tablet.
//
// Three steps, and the order is the safety: read the whole file and prove it
// is complete (nothing written), show what it holds and what it will replace,
// and only on an explicit yes empty this tablet and restore. See
// src/library/deviceTransfer.ts.
//
// A work backup arrives here too, since lane C gave it the proxy and the share
// sheet (Settings → Work backup). It is told apart by its bytes
// (library/workBackup.ts), shown with what it holds, and on a yes restored as
// Settings restores one: added to this tablet's work, nothing here emptied.

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

/** `relayCode` when the file came through the proxy, so the copy there can be removed. */
type State =
  | { step: 'choose' }
  | { step: 'fetching'; progress: RelayProgress | null }
  | { step: 'checking'; progress: DeviceTransferProgress | null }
  | { step: 'confirm'; file: File; summary: DeviceTransferSummary; relayCode?: string }
  | { step: 'confirm-work'; bundle: WorkBundle; relayCode?: string }
  | { step: 'restoring'; progress: DeviceTransferProgress | null }
  | { step: 'restored-work'; message: string }
  | { step: 'failed'; message: string };

export function ReceiveTransferScreen({ shared }: { shared: boolean }) {
  const { storage, reload } = useApp();
  const [state, setState] = useState<State>(
    shared ? { step: 'checking', progress: null } : { step: 'choose' },
  );
  const [booksHere, setBooksHere] = useState<number | null>(null);
  const [typedCode, setTypedCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void storage.listBooks().then((books) => setBooksHere(books.length));
  }, [storage]);

  const check = async (file: File, relayCode?: string) => {
    setState({ step: 'checking', progress: null });
    try {
      const bundle = await readWorkBackup(file);
      if (bundle) {
        setState({ step: 'confirm-work', bundle, relayCode });
        return;
      }
      const summary = await inspectDeviceFile(file, storage, (progress) =>
        setState({ step: 'checking', progress }),
      );
      const noRoom = await roomFor(summary);
      if (noRoom) throw new Error(noRoom);
      setState({ step: 'confirm', file, summary, relayCode });
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

  const fetchByCode = async () => {
    const code = parseRelayCode(typedCode);
    if (!code) {
      setCodeError('A code is 16 letters and digits, like 7KQ2-9XMD-4TPA-RW3H.');
      return;
    }
    setCodeError(null);
    setState({ step: 'fetching', progress: null });
    try {
      const file = await receiveViaRelay(code, {
        onProgress: (progress) => setState({ step: 'fetching', progress }),
      });
      await check(file, code);
    } catch (error) {
      setState({ step: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const restore = async (file: File, relayCode?: string) => {
    setState({ step: 'restoring', progress: null });
    try {
      await restoreDevice(file, storage, {
        onProgress: (progress) => setState({ step: 'restoring', progress }),
      });
      await discardIncomingTransfer();
      // The relayed copy has done its job; it would expire within the hour,
      // but there is no reason to leave it that long.
      if (relayCode) await forgetRelay(relayCode);
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

  const restoreWork = async (bundle: WorkBundle, relayCode?: string) => {
    setState({ step: 'restoring', progress: null });
    try {
      const report = await storage.importWork(bundle);
      await reload();
      await discardIncomingTransfer();
      if (relayCode) await forgetRelay(relayCode);
      setState({ step: 'restored-work', message: describeRestore(report) });
    } catch (error) {
      setState({
        step: 'failed',
        message:
          `The restore stopped part way: ${error instanceof Error ? error.message : String(error)} ` +
          'Nothing on this tablet was removed. Restoring the same backup again is safe.',
      });
    }
  };

  const cancel = async () => {
    await discardIncomingTransfer();
    navigate({ name: 'library' });
  };

  const progress =
    state.step === 'checking' || state.step === 'restoring' || state.step === 'fetching'
      ? state.progress
      : null;

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
            <p className="mb-4 text-sm text-muted">
              A work backup from <strong>Settings → Work backup</strong> is received the
              same way. It is added to this tablet's work rather than replacing it.
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

            {RELAY_AVAILABLE && (
              <form
                className="mt-5 border-t border-rule pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void fetchByCode();
                }}
              >
                <label className="mb-1 block text-sm font-medium" htmlFor="relay-code">
                  Sent through the proxy? Enter the code
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="relay-code"
                    className={`${inputClass} flex-1 font-mono uppercase tracking-wider`}
                    value={typedCode}
                    onChange={(event) => setTypedCode(event.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button type="submit">Fetch it</Button>
                </div>
                {codeError && <p className="mt-2 text-xs text-red-700">{codeError}</p>}
              </form>
            )}
          </section>
        )}

        {(state.step === 'fetching' || state.step === 'checking' || state.step === 'restoring') && (
          <section className="rounded-lg border border-rule bg-white p-5">
            <p className="mb-2 text-sm">
              {state.step === 'fetching'
                ? 'Fetching the transfer from your proxy. Nothing on this tablet is changed yet.'
                : state.step === 'checking'
                  ? 'Checking the file is complete. Nothing on this tablet is changed yet.'
                  : 'Restoring. Keep the app open until it finishes.'}
            </p>
            <p className="mb-2 text-xs text-muted">{progress?.message ?? 'Starting…'}</p>
            <ProgressBar
              percent={progress ? percentOf(progress.done, progress.total) : 0}
            />
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
              <Button variant="danger" onClick={() => void restore(state.file, state.relayCode)}>
                Replace this tablet
              </Button>
              <Button onClick={() => void cancel()}>Cancel</Button>
            </div>
          </section>
        )}

        {state.step === 'confirm-work' && (
          <section className="rounded-lg border border-rule bg-white p-5">
            <h2 className="mb-1 font-medium">A work backup</h2>
            <p className="mb-3 text-xs text-muted">
              Made {new Date(state.bundle.exportedAt).toLocaleString()}
            </p>
            <p className="mb-4 text-sm">{describeWorkBundle(state.bundle)}.</p>
            <p className="mb-4 rounded-md border border-rule bg-parchment p-3 text-sm">
              It is added to this tablet's work; nothing here is removed. Where both have the
              same card, mark or entry, the backup's copy is kept, and this tablet takes the
              backup's settings.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => void restoreWork(state.bundle, state.relayCode)}
              >
                Restore this work
              </Button>
              <Button onClick={() => void cancel()}>Cancel</Button>
            </div>
          </section>
        )}

        {state.step === 'restored-work' && (
          <section className="rounded-lg border border-rule bg-white p-5">
            <p className="mb-4 text-sm">{state.message}</p>
            <Button variant="primary" onClick={() => navigate({ name: 'library' })}>
              Back to the library
            </Button>
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
