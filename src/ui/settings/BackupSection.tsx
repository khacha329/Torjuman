import { useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { navigate } from '../../app/router';
import {
  describeRestore,
  describeWorkBundle,
  readWorkBackup,
  workBackupFile,
} from '../../library/workBackup';
import {
  formatRelayCode,
  RELAY_AVAILABLE,
  sendViaRelay,
  type RelayProgress,
} from '../../library/relayTransfer';
import { formatBytes, percentOf } from '../../lib/format';
import { needsDataUrl, saveFile } from '../../lib/saveFile';
import { Button, ProgressBar } from '../kit';
import { Section } from './Section';

// Settings → work backup: export and restore the user's work as one file.
// Moved verbatim from SettingsScreen.tsx in restructure Phase 5 step 5d8
// (docs/refactor/plans/phase5-big-ui-files.md).
//
// Since lane C the export leaves by the same three routes as the whole-tablet
// transfer (DeviceTransfer.tsx): saved to Downloads, sent through the proxy,
// or handed to the share sheet. Saving was the only one, and on the owner's
// tablet it produced nothing (CLAUDE.md trap 8). The other tablet takes a
// relayed or shared backup on the receive screen, which tells it from a
// tablet transfer file (library/workBackup.ts) and restores it as this
// section's Restore does.

/**
 * WebView-based browsers (DuckDuckGo on Android) hand a download to Android's
 * download manager, which can come out with an empty file. There the proxy is
 * the dependable way out, as it is for the tablet transfer.
 */
const SAVING_IS_UNRELIABLE = needsDataUrl(navigator.userAgent);

/**
 * Two exports, deliberately separate.
 *
 * One monolithic file is impractical: book 9260's stored HTML alone runs to
 * tens of megabytes. So the user's own work — small, precious, irreplaceable —
 * travels on its own, and book content travels per book. Because block IDs are
 * deterministic, a work backup restores cleanly onto a device where the books
 * were imported separately, which is the normal path to a new device.
 */
export function BackupSection() {
  const { storage, reload } = useApp();
  const [status, setStatus] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [relayProgress, setRelayProgress] = useState<RelayProgress | null>(null);
  const [relayCode, setRelayCode] = useState<string | null>(null);
  const workFileRef = useRef<HTMLInputElement>(null);

  // Making the file is its own tap, and each route another, as in the tablet
  // transfer: the share sheet opens only in direct response to a tap.
  //
  // Every failure ends in a message. Without the `try` (FOUND_ISSUES 32) a
  // quota error left "Preparing…" on screen for good, and nothing said the
  // backup had not been made.
  const exportWork = async () => {
    setFile(null);
    setRelayCode(null);
    setPreparing(true);
    setStatus('Preparing…');
    try {
      const bundle = await storage.exportWork();
      const made = workBackupFile(bundle);
      setFile(made);
      setStatus(`Ready, ${formatBytes(made.size)}: ${describeWorkBundle(bundle)}.`);
    } catch (caught) {
      setStatus(`Export failed, so no backup was made: ${messageOf(caught)}`);
    } finally {
      setPreparing(false);
    }
  };

  const save = async () => {
    if (!file) return;
    try {
      await saveFile(file, file.name);
      setStatus(`Saving ${file.name} to Downloads.`);
    } catch (caught) {
      setStatus(`Could not save the file: ${messageOf(caught)}`);
    }
  };

  // Chrome's Web Share takes an allowlist of file types, and JSON may not be
  // on it; the button appears only where the browser says it will accept the
  // file, exactly as the tablet transfer's does.
  const canShare =
    file !== null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const send = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'Ḥāshiya — work backup' });
    } catch (caught) {
      // Closing the share sheet is not a failure worth reporting.
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setStatus(`Could not open the share sheet: ${messageOf(caught)}`);
    }
  };

  const relay = async () => {
    if (!file) return;
    setRelayCode(null);
    try {
      setRelayCode(await sendViaRelay(file, { onProgress: setRelayProgress }));
    } catch (caught) {
      setStatus(`Could not send it: ${messageOf(caught)}`);
    } finally {
      setRelayProgress(null);
    }
  };

  const busy = preparing || relayProgress !== null;

  const importWork = async (chosen: File) => {
    setStatus('Restoring…');
    try {
      const bundle = await readWorkBackup(chosen);
      if (!bundle) {
        setStatus('That file is not a work backup.');
        return;
      }
      const report = await storage.importWork(bundle);
      await reload();
      setStatus(describeRestore(report));
    } catch (caught) {
      setStatus(`Restore failed: ${messageOf(caught)}`);
    }
  };

  return (
    <Section
      title="Work backup"
      description="Your translation cards, explanations, marks, notes, glossary and profiles. Small and irreplaceable — export it regularly."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void exportWork()} disabled={busy}>
          {file ? 'Export it again' : 'Export my work'}
        </Button>
        {file && RELAY_AVAILABLE && (
          <Button
            variant={SAVING_IS_UNRELIABLE ? 'primary' : 'default'}
            onClick={() => void relay()}
            disabled={busy}
          >
            Send through the proxy
          </Button>
        )}
        {file && canShare && (
          <Button onClick={() => void send()} disabled={busy}>
            Send…
          </Button>
        )}
        {file && (
          <Button onClick={() => void save()} disabled={busy}>
            Save to Downloads
          </Button>
        )}
        <Button onClick={() => workFileRef.current?.click()} disabled={busy}>
          Restore from a work backup
        </Button>
        {RELAY_AVAILABLE && (
          <Button variant="ghost" onClick={() => navigate({ name: 'receive', shared: false })}>
            Receive on this tablet
          </Button>
        )}
        <input
          ref={workFileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) void importWork(chosen);
            event.target.value = '';
          }}
        />
      </div>

      {relayProgress && (
        <div className="mt-4 rounded-md border border-rule bg-parchment p-3">
          <p className="mb-2 text-xs text-muted">{relayProgress.message}</p>
          <ProgressBar percent={percentOf(relayProgress.done, relayProgress.total)} />
        </div>
      )}

      {relayCode && (
        <div className="mt-4 rounded-md border border-accent/40 bg-parchment p-4">
          <p className="mb-2 text-sm">
            On the other tablet, open <strong>Receive on this tablet</strong> and enter:
          </p>
          <p className="mb-2 font-mono text-2xl tracking-wider" data-testid="work-relay-code">
            {formatRelayCode(relayCode)}
          </p>
          <p className="text-xs text-muted">
            Kept on your proxy for an hour, encrypted with this code, then deleted. Nobody
            without the code can read it. The other tablet adds it to its own work.
          </p>
        </div>
      )}

      {file && SAVING_IS_UNRELIABLE && !relayCode && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          This browser can save a file empty.{' '}
          {RELAY_AVAILABLE
            ? 'If Downloads has nothing, use Send through the proxy instead.'
            : 'If Downloads has nothing, open the app in Chrome to export it.'}
        </p>
      )}

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}

      <p className="mt-3 text-xs text-muted">
        Book content is <strong>not</strong> in this file — it moves separately, per book,
        under Library transfer below. Because block IDs are derived from the book rather
        than allocated, work restored here binds correctly to books imported independently
        on this device. API keys are never in this file. Sent through the proxy, the other
        tablet enters the code under <strong>Receive on this tablet</strong>; saved or
        shared, restore it there from the file. To move everything, keys included if you
        choose, use Move to another tablet above.
      </p>
    </Section>
  );
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
