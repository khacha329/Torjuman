// Gzip through the platform's CompressionStream, which every browser this app
// targets has, but which is not guaranteed. Three formats use it — a book
// transfer (library/transfer.ts), a whole-tablet transfer
// (library/deviceTransfer.ts) and a shared chapter (share/crypto.ts) — and
// each keeps its own fallback, error message and way of telling a compressed
// file from a plain one; this holds only the availability test and the call,
// so the format and the test are named in one place (restructure Phase 2 step
// 2e).
//
// The globals are looked up on every call, never captured when this module
// loads: scripts/verify-markup.mjs replaces CompressionStream after the page
// has loaded, to hold an export in its "Compressing…" state.

export function canGzip(): boolean {
  return typeof CompressionStream !== 'undefined';
}

export function canGunzip(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

export function gzipStream(stream: ReadableStream<BufferSource>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return stream.pipeThrough(new CompressionStream('gzip'));
}

export function gunzipStream(stream: ReadableStream<BufferSource>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return stream.pipeThrough(new DecompressionStream('gzip'));
}
