// A transfer file handed to the installed app through Android's share sheet.
//
// The share sheet POSTs the file to the app; a POST cannot be answered by a
// static host, so the service worker catches it (public/share-target.js),
// parks the file in this cache and redirects to the receive screen, which
// picks it up from here. The cache name and key must match that script.

const INCOMING_CACHE = 'incoming-transfer';

function incomingKey(): string {
  return new URL(`${import.meta.env.BASE_URL}incoming-transfer-file`, window.location.origin).href;
}

/** The parked file, or null if there is none. */
export async function takeIncomingTransfer(): Promise<File | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(INCOMING_CACHE);
  const response = await cache.match(incomingKey());
  if (!response) return null;
  const name = decodeURIComponent(response.headers.get('x-file-name') ?? 'transfer');
  return new File([await response.blob()], name, {
    type: response.headers.get('content-type') ?? 'application/octet-stream',
  });
}

/** Drop the parked file — after a restore, or when the user turns it down. */
export async function discardIncomingTransfer(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(INCOMING_CACHE);
}
