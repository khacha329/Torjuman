import { isShareBundle, type ShareBundle } from './bundle';

// Encrypting a shared chapter, and why a static site still needs to.
//
// ---------------------------------------------------------------------------
// The problem the unguessable id does not solve
//
// Amendment 18 gives each share a random slug so links cannot be enumerated.
// That reasoning holds for the link and fails for the file: this repository is
// public, so anyone can open its tree and read every bundle in
// `public/shares/` without holding a link at all. The slug defends against
// guessing a URL; nothing defends against the directory listing. And git keeps
// history, so a share deleted later is still there.
//
// So the bytes committed are ciphertext. The key never goes near the repository
// or the server: it rides in the link's fragment, which browsers do not send in
// the HTTP request. What is public is an opaque blob; what makes it readable is
// the link, which is exactly the property the amendment wanted.
//
// This is not a claim of security against a determined adversary — the holder
// of a link can always redistribute what they read, and that is true of a
// printed handout too. It is the difference between publishing a chapter and
// handing one to a study circle, made real in the file rather than asserted in
// a README.
//
// ---------------------------------------------------------------------------
// Layout
//
//   magic   4 bytes  "HSH1", so a truncated or wrong file fails immediately
//                    and legibly rather than as a decryption error
//   flags   1 byte   bit 0: the plaintext is gzipped
//   iv     12 bytes  random per file, as AES-GCM requires
//   body    …        AES-GCM ciphertext with its tag
//
// Compress first, then encrypt. The other order is a common mistake and a
// pointless one: ciphertext is indistinguishable from noise and does not
// compress.
// ---------------------------------------------------------------------------

const MAGIC = new Uint8Array([0x48, 0x53, 0x48, 0x31]); // "HSH1"
const IV_BYTES = 12;
const KEY_BYTES = 32;
const FLAG_GZIP = 0x01;

/**
 * `crypto.subtle` exists only in a secure context.
 *
 * This matters here more than it usually would: the tablet loads the dev server
 * over plain http on the LAN, which is not a secure context, so on that one
 * deployment WebCrypto is simply absent. `crypto.getRandomValues` is not —
 * it lives on `crypto` itself — so ids still generate and only the encrypting
 * half is affected. The deployed site is https and localhost counts as secure,
 * so this is a development-only gap, and it is reported as one rather than
 * surfacing as "undefined is not an object".
 */
export class InsecureContextError extends Error {
  constructor() {
    super(
      'Sharing needs a secure connection. Open the app over https, or on ' +
        'localhost — a LAN address over plain http cannot use WebCrypto.',
    );
    this.name = 'InsecureContextError';
  }
}

function subtle(): SubtleCrypto {
  const available = globalThis.crypto?.subtle;
  if (!available) throw new InsecureContextError();
  return available;
}

/** Raw random bytes. Available in any context, secure or not. */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// ------------------------------------------------------------- base64url
//
// The key travels in a URL fragment, so standard base64's `+`, `/` and `=` are
// all wrong there. Done by hand rather than pulled in: it is eight lines.

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ------------------------------------------------------------------ keys

/** A fresh 256-bit key, for exactly one share. */
export function generateShareKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

async function importKey(raw: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return subtle().importKey('raw', raw as BufferSource, 'AES-GCM', false, [usage]);
}

// ----------------------------------------------------------- compression

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Gzip, where the platform has it.
 *
 * `CompressionStream` is on every browser this app targets, but it is not
 * universal and it is absent in some SSR and test contexts. Rather than making
 * the whole feature conditional on it, absence is recorded in the header flag
 * and the file is simply larger — a bundle that works and is 400 KB beats a
 * share button that throws.
 */
async function gzip(input: Uint8Array): Promise<{ bytes: Uint8Array; compressed: boolean }> {
  if (typeof CompressionStream === 'undefined') return { bytes: input, compressed: false };
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return { bytes: await collect(stream), compressed: true };
}

async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot read compressed shares.');
  }
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return collect(stream);
}

// ------------------------------------------------------------ the format

/** Serialise, compress, encrypt. Returns the exact bytes of the published file. */
export async function sealBundle(bundle: ShareBundle, key: Uint8Array): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify(bundle));
  const { bytes: body, compressed } = await gzip(json);

  const iv = randomBytes(IV_BYTES);
  const cipher = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      await importKey(key, 'encrypt'),
      body as BufferSource,
    ),
  );

  const out = new Uint8Array(MAGIC.length + 1 + IV_BYTES + cipher.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = compressed ? FLAG_GZIP : 0;
  out.set(iv, MAGIC.length + 1);
  out.set(cipher, MAGIC.length + 1 + IV_BYTES);
  return out;
}

/** The inverse, with every failure mode turned into something a reader can act on. */
export async function openBundle(file: Uint8Array, key: Uint8Array): Promise<ShareBundle> {
  if (file.length < MAGIC.length + 1 + IV_BYTES) {
    throw new Error('This shared file is incomplete.');
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (file[i] !== MAGIC[i]) {
      // Overwhelmingly the common case is a 404 page served as the file, so say
      // the thing that is actually true rather than talking about magic bytes.
      throw new Error('That link does not point at a shared chapter.');
    }
  }

  const flags = file[MAGIC.length];
  const iv = file.subarray(MAGIC.length + 1, MAGIC.length + 1 + IV_BYTES);
  const body = file.subarray(MAGIC.length + 1 + IV_BYTES);

  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        await importKey(key, 'decrypt'),
        body as BufferSource,
      ),
    );
  } catch (cause) {
    if (cause instanceof InsecureContextError) throw cause;
    // AES-GCM authenticates, so this is either the wrong key or a damaged
    // file, and the two are genuinely indistinguishable from here.
    throw new Error('This link could not be opened — it may be incomplete or out of date.');
  }

  if ((flags & FLAG_GZIP) !== 0) plain = await gunzip(plain);

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('This shared chapter could not be read.');
  }

  if (!isShareBundle(parsed)) {
    throw new Error('This shared chapter is not in a format this app recognises.');
  }
  return parsed;
}
