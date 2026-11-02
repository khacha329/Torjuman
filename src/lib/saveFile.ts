// Saving a file the app made, in a way the Android browsers actually honour.
//
// Every export — the tablet transfer, the work backup, a book, the glossary, a
// shared chapter — builds its file in the page and then clicks a download link
// to it. Two things went wrong with that, and both produce a file that looks
// saved and is not:
//
//   1. WebView-based browsers (DuckDuckGo on Android among them) hand a link
//      to Android's download manager, which fetches it from outside the page.
//      A `blob:` URL exists only inside the page, so the download manager gets
//      nothing and writes a 0-byte file. A `data:` URL carries the bytes in
//      the link itself, which the download manager can read.
//   2. Android Chrome ignores `download` on a link that is not in the document,
//      and a blob revoked straight after click() can be gone before the
//      browser reads it. So the link is attached for the click, and a blob is
//      revoked only later.
//
// `data:` is used only where it is needed. It holds the whole file again as
// base64 — a third larger, in memory, as one string — which ordinary Chrome
// does not need and a large library would notice.

/**
 * Whether this browser needs the file inside the link.
 *
 * Matched on the user agent, since there is no feature to detect: a WebView
 * creates blob URLs perfectly well and fails only when the download manager
 * tries to read one. `; wv)` is WebView's own marker, `Version/4.0` appears in
 * every WebView user agent and never in Chrome's, and DuckDuckGo names itself.
 */
export function needsDataUrl(userAgent: string): boolean {
  return /DuckDuckGo\/|; wv\)|Version\/4\.0 /.test(userAgent);
}

export async function saveFile(
  blob: Blob,
  filename: string,
  userAgent: string = navigator.userAgent,
): Promise<void> {
  const inline = needsDataUrl(userAgent);
  const href = inline ? await toDataUrl(blob) : URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // A minute, not ten seconds: a large transfer file can take a while to be
  // read on a slow tablet, and an unrevoked blob costs nothing meanwhile.
  if (!inline) setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/** The blob as a base64 `data:` URL, read natively rather than in a JS loop. */
function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file to save it.'));
    reader.readAsDataURL(blob.type ? blob : new Blob([blob], { type: 'application/octet-stream' }));
  });
}
