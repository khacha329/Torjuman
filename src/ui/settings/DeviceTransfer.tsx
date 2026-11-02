import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { exportDevice, type DeviceTransferProgress } from '../../library/deviceTransfer';
import { needsDataUrl, saveFile } from '../../lib/saveFile';
import {
  formatRelayCode,
  RELAY_AVAILABLE,
  sendViaRelay,
  type RelayProgress,
} from '../../library/relayTransfer';
import { Button } from '../common';

// The sending half of moving to another tablet: everything on this one, as a
// single file, saved to Downloads or sent through the proxy. The receiving
// half is ReceiveTransferScreen.

/**
 * WebView-based browsers (DuckDuckGo on Android) cannot save a large file: it
 * comes out empty, or the tab crashes. There the proxy is the way out.
 */
const SAVING_IS_UNRELIABLE = needsDataUrl(navigator.userAgent);

export function DeviceTransfer() {
  const { storage } = useApp();
  const [includeApiKeys, setIncludeApiKeys] = useState(true);
  const [progress, setProgress] = useState<DeviceTransferProgress | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [relayProgress, setRelayProgress] = useState<RelayProgress | null>(null);
  const [relayCode, setRelayCode] = useState<string | null>(null);

  const create = async () => {
    setFile(null);
    setStatus(null);
    setRelayCode(null);
    try {
      const made = (await exportDevice(storage, {
        includeApiKeys,
        onProgress: setProgress,
      })) as File;
      setFile(made);
      setStatus(`Ready: ${sizeOf(made.size)}.`);
    } catch (error) {
      setStatus(`Could not create the file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProgress(null);
    }
  };

  // Its own tap, not the end of `create`: the share sheet opens only in
  // direct response to a tap, and packing a library takes long enough that
  // the original one no longer counts.
  //
  // In practice Chrome says no today: the Web Share API sends only an
  // allowlist of file types (images, audio, video, PDF, text), and gzip is not
  // on it. So saving is the main path and the share sheet is reached from the
  // Files app. The button appears by itself wherever a browser does accept it.
  const canShare =
    file !== null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const send = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'Ḥāshiya — tablet transfer' });
    } catch (error) {
      // Closing the share sheet is not a failure worth reporting.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus(`Could not open the share sheet: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const relay = async () => {
    if (!file) return;
    setStatus(null);
    setRelayCode(null);
    try {
      setRelayCode(await sendViaRelay(file, { onProgress: setRelayProgress }));
    } catch (error) {
      setStatus(`Could not send it: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRelayProgress(null);
    }
  };

  const busy = progress !== null || relayProgress !== null;

  const save = async () => {
    if (!file) return;
    try {
      await saveFile(file, file.name);
    } catch (error) {
      setStatus(`Could not save the file: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <h2 className="text-base font-semibold">Move to another tablet</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Everything on this tablet in one file — books, QUL resources, narrator profiles,
        dictionaries, glossary, cards, marks, reading positions and settings — so the other
        tablet carries on exactly where this one is, with nothing to download or import
        again. The other tablet is <strong>replaced</strong> by it, not merged.
      </p>

      <label className="mb-1 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={includeApiKeys}
          onChange={(event) => setIncludeApiKeys(event.target.checked)}
          disabled={busy}
        />
        <span>Include my API keys</span>
      </label>
      <p className="mb-4 pl-6 text-xs text-muted">
        {includeApiKeys
          ? 'The file will contain your keys as plain text. Anyone who gets hold of it can use them, so delete it from Downloads or Drive once the other tablet has it.'
          : 'You will enter your keys again on the other tablet.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void create()} disabled={busy}>
          {file ? 'Create it again' : 'Create the transfer file'}
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
          <Button variant="primary" onClick={() => void send()} disabled={busy}>
            Send…
          </Button>
        )}
        {file && (
          <Button
            variant={canShare || SAVING_IS_UNRELIABLE ? 'default' : 'primary'}
            onClick={() => void save()}
            disabled={busy}
          >
            Save to Downloads
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate({ name: 'receive', shared: false })}>
          Receive on this tablet
        </Button>
      </div>

      {progress && (
        <div className="mt-4 rounded-md border border-rule bg-parchment p-3">
          <p className="mb-2 text-xs text-muted">{progress.message}</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {relayProgress && (
        <div className="mt-4 rounded-md border border-rule bg-parchment p-3">
          <p className="mb-2 text-xs text-muted">{relayProgress.message}</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${relayProgress.total > 0 ? Math.round((relayProgress.done / relayProgress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {relayCode && (
        <div className="mt-4 rounded-md border border-accent/40 bg-parchment p-4">
          <p className="mb-2 text-sm">
            On the other tablet, open <strong>Receive on this tablet</strong> and enter:
          </p>
          <p className="mb-2 font-mono text-2xl tracking-wider" data-testid="relay-code">
            {formatRelayCode(relayCode)}
          </p>
          <p className="text-xs text-muted">
            Kept on your proxy for an hour, encrypted with this code, then deleted. Nobody
            without the code can read it.
          </p>
        </div>
      )}

      {file && SAVING_IS_UNRELIABLE && !relayCode && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          This browser cannot save a file this size to Downloads — it comes out empty.{' '}
          {RELAY_AVAILABLE
            ? 'Use Send through the proxy instead.'
            : 'This build has no proxy configured, so open the app in Chrome to move it.'}
        </p>
      )}

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}

      <p className="mt-3 text-xs text-muted">
        Saved to Downloads, send it from the <strong>Files</strong> app with Quick Share (or
        upload it to Drive); on the other tablet, share it to this app or open it under{' '}
        <strong>Receive on this tablet</strong>. Sent through the proxy, just enter the code
        there instead. Both
        tablets need the same version of the app; update both first if one is behind. The
        offline translation model is not included — download it again there if you use it.
      </p>
    </section>
  );
}

function sizeOf(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
