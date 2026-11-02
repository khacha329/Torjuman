import { InsecureContextError, randomBytes } from '../share/crypto';

// Moving a tablet through the proxy instead of through a saved file.
//
// The transfer file (deviceTransfer.ts) normally travels as a download. In
// WebView-based browsers — DuckDuckGo on Android — a large download cannot be
// saved at all: the download manager cannot read the page's blob, and a data:
// link the size of a library crashes the tab. Plain fetch() works in those
// browsers, so this sends the same file to the proxy Worker in pieces and the
// other tablet fetches them back. Nothing here changes what the file is or how
// it is checked and restored; it only replaces "save, carry, open".
//
// Everything the Worker stores is ciphertext. One code, shown on the sending
// tablet and typed on the receiving one, yields both:
//
//   the storage id  a hash of the code, so the Worker never sees the code
//   the key         HKDF of the code, AES-GCM-256, per-piece IVs
//
// The code is 16 characters of Crockford base32 — 80 random bits, which is
// beyond guessing — and is written in four groups of four so it can be read
// off one screen and typed on another.

/** Where the relay lives: the same Worker as the import proxy. */
export const RELAY_BASE: string = (import.meta.env.VITE_PROXY_URL ?? '').replace(/\/+$/, '');
export const RELAY_AVAILABLE = RELAY_BASE !== '';

/** Pieces of 8 MiB: well under the Worker's limits, few enough to stay quick. */
const PIECE_BYTES = 8 * 1024 * 1024;
const IV_BYTES = 12;
const ATTEMPTS = 3;

// Crockford's alphabet: no I, L, O or U, so nothing reads as something else.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface RelayProgress {
  done: number;
  total: number;
  message: string;
}

type OnProgress = (progress: RelayProgress) => void;

/** The parts of the environment this needs, so it can be tested without a network. */
export interface RelayOptions {
  base?: string;
  fetch?: typeof fetch;
  onProgress?: OnProgress;
}

interface Manifest {
  version: 1;
  pieces: number;
  bytes: number;
  name: string;
}

// -------------------------------------------------------------------- code

export function newRelayCode(): string {
  const bytes = randomBytes(10); // 80 bits, exactly 16 base32 characters
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1; // only the unread bits matter
  }
  return out;
}

/** XXXX-XXXX-XXXX-XXXX, for reading off a screen. */
export function formatRelayCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/**
 * What the user typed, as a code — or null if it cannot be one.
 *
 * Forgiving in the ways people mistype: case, spaces and dashes are ignored,
 * and O, I and L — which the alphabet leaves out because they look like 0 and
 * 1 — are read as those digits.
 */
export function parseRelayCode(typed: string): string | null {
  const cleaned = typed
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== 16) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return cleaned;
}

// ------------------------------------------------------------------ crypto

function subtle(): SubtleCrypto {
  const available = globalThis.crypto?.subtle;
  if (!available) throw new InsecureContextError();
  return available;
}

async function idFor(code: string): Promise<string> {
  const digest = await subtle().digest(
    'SHA-256',
    new TextEncoder().encode(`hashiya-relay-id:${code}`),
  );
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function keyFor(code: string): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(code), 'HKDF', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('hashiya-relay'),
      info: new TextEncoder().encode('transfer-key'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Each piece is bound to its position, so the Worker cannot reorder, repeat
 * or swap pieces without decryption failing.
 */
function boundTo(id: string, piece: string): Uint8Array {
  return new TextEncoder().encode(`${id}/${piece}`);
}

async function seal(key: CryptoKey, id: string, piece: string, plain: BufferSource): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: boundTo(id, piece) as BufferSource },
      key,
      plain,
    ),
  );
  const out = new Uint8Array(IV_BYTES + sealed.length);
  out.set(iv, 0);
  out.set(sealed, IV_BYTES);
  return out;
}

async function open(key: CryptoKey, id: string, piece: string, sealed: Uint8Array): Promise<ArrayBuffer> {
  try {
    return await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: sealed.slice(0, IV_BYTES) as BufferSource,
        additionalData: boundTo(id, piece) as BufferSource,
      },
      key,
      sealed.slice(IV_BYTES) as BufferSource,
    );
  } catch {
    throw new Error('The transfer could not be decrypted — it is damaged, or the code does not match it.');
  }
}

// --------------------------------------------------------------- transport

async function request(
  options: RelayOptions,
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
  body?: Uint8Array,
): Promise<Response> {
  const base = options.base ?? RELAY_BASE;
  if (!base) throw new Error('This build has no proxy, so it cannot relay a transfer.');
  const doFetch = options.fetch ?? fetch;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await doFetch(`${base}${path}`, {
        method,
        body: body as BodyInit | undefined,
        headers: body ? { 'Content-Type': 'application/octet-stream' } : undefined,
      });
      // A 4xx will not change on a retry; a 5xx or a dropped connection might.
      if (response.ok || (response.status >= 400 && response.status < 500)) return response;
      lastError = new Error(await describe(response));
    } catch (error) {
      lastError = error;
    }
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function describe(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Not the Worker's JSON — fall through to the status.
  }
  return `The proxy answered ${response.status}.`;
}

// -------------------------------------------------------------------- send

/**
 * Upload a transfer file and return the code that fetches it back.
 *
 * The manifest goes last, so a receiver can never see a transfer whose pieces
 * are not all there yet.
 */
export async function sendViaRelay(file: Blob, options: RelayOptions = {}): Promise<string> {
  const onProgress = options.onProgress ?? (() => {});
  const code = newRelayCode();
  const [id, key] = await Promise.all([idFor(code), keyFor(code)]);
  const pieces = Math.max(1, Math.ceil(file.size / PIECE_BYTES));

  for (let index = 0; index < pieces; index++) {
    onProgress({
      done: index,
      total: pieces,
      message: `Sending piece ${index + 1} of ${pieces}…`,
    });
    const plain = await file.slice(index * PIECE_BYTES, (index + 1) * PIECE_BYTES).arrayBuffer();
    const sealed = await seal(key, id, String(index), plain);
    const response = await request(options, 'PUT', `/transfer/${id}/${index}`, sealed);
    if (!response.ok) throw new Error(await describe(response));
  }

  const manifest: Manifest = {
    version: 1,
    pieces,
    bytes: file.size,
    name: file instanceof File ? file.name : 'transfer.hashiya-device.gz',
  };
  const sealed = await seal(key, id, 'manifest', new TextEncoder().encode(JSON.stringify(manifest)));
  const response = await request(options, 'PUT', `/transfer/${id}/manifest`, sealed);
  if (!response.ok) throw new Error(await describe(response));

  onProgress({ done: pieces, total: pieces, message: 'Sent.' });
  return code;
}

// ----------------------------------------------------------------- receive

/** Fetch and decrypt a relayed transfer, as the same file that was sent. */
export async function receiveViaRelay(code: string, options: RelayOptions = {}): Promise<File> {
  const onProgress = options.onProgress ?? (() => {});
  const [id, key] = await Promise.all([idFor(code), keyFor(code)]);

  onProgress({ done: 0, total: 1, message: 'Looking for the transfer…' });
  const manifestResponse = await request(options, 'GET', `/transfer/${id}/manifest`);
  if (!manifestResponse.ok) throw new Error(await describe(manifestResponse));
  const manifest = JSON.parse(
    new TextDecoder().decode(
      await open(key, id, 'manifest', new Uint8Array(await manifestResponse.arrayBuffer())),
    ),
  ) as Manifest;

  const parts: ArrayBuffer[] = [];
  for (let index = 0; index < manifest.pieces; index++) {
    onProgress({
      done: index,
      total: manifest.pieces,
      message: `Receiving piece ${index + 1} of ${manifest.pieces}…`,
    });
    const response = await request(options, 'GET', `/transfer/${id}/${index}`);
    if (!response.ok) throw new Error(await describe(response));
    parts.push(await open(key, id, String(index), new Uint8Array(await response.arrayBuffer())));
  }

  const file = new File(parts, manifest.name, { type: 'application/gzip' });
  if (file.size !== manifest.bytes) {
    throw new Error('The transfer arrived incomplete. Send it again from the other tablet.');
  }
  onProgress({ done: manifest.pieces, total: manifest.pieces, message: 'Received.' });
  return file;
}

/** Remove the relayed copy once it has been restored. Best effort: it expires anyway. */
export async function forgetRelay(code: string, options: RelayOptions = {}): Promise<void> {
  try {
    await request(options, 'DELETE', `/transfer/${await idFor(code)}`);
  } catch {
    // It is gone within the hour regardless.
  }
}
