import { fromBase64Url, randomBytes, toBase64Url } from './crypto';

// The link, and why the whole of it lives after the `#`.
//
// ---------------------------------------------------------------------------
// Amendment 18 specifies `?share=<id>`. This uses `#/share/<id>/<key>`, for two
// reasons that both had to be true before deviating:
//
//   1. The key must not reach a server. A query string is sent in the HTTP
//      request and lands in GitHub's logs; a fragment never leaves the browser.
//      Once the bundle is encrypted — see crypto.ts — the fragment is the only
//      correct place for the key, and having the id follow it there costs
//      nothing and keeps the id out of those logs too.
//   2. The app already routes on the hash. A `?share=` parameter would need a
//      second, parallel way of deciding what screen is showing, and the two
//      would have to be kept in agreement forever.
//
// So a share link is an ordinary route in the existing router, and nothing
// about which chapter is being read is observable to the host.
// ---------------------------------------------------------------------------

/**
 * Bytes of randomness in a share id.
 *
 * 16 bytes is 2^128 possibilities, which makes enumeration hopeless. The id is
 * not the secret — the key is — but an id that could be guessed would let
 * somebody learn which shares exist, and there is no reason to allow that.
 */
const ID_BYTES = 16;

export function generateShareId(): string {
  return toBase64Url(randomBytes(ID_BYTES));
}

/** The published file's name, inside `public/shares/`. */
export function shareFileName(id: string): string {
  return `${id}.bin`;
}

export interface ShareRef {
  id: string;
  key: Uint8Array;
}

/**
 * The full link to hand somebody.
 *
 * Built from `location` rather than a configured origin so that a link made on
 * the deployed site points at the deployed site, and one made against a local
 * build points at the local build — testing a share flow that always emits a
 * production URL is testing nothing.
 */
export function shareLinkFor(ref: ShareRef): string {
  return shareLinkFromKeyText(ref.id, toBase64Url(ref.key));
}

/**
 * The same link, from a key already in its base64url form.
 *
 * Settings rebuilds links from stored records, where the key was saved as text
 * — decoding it to bytes only to re-encode it would be two conversions that
 * can each fail for no gain.
 */
export function shareLinkFromKeyText(id: string, keyText: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/share/${id}/${keyText}`;
}

/**
 * Pull a share out of a hash route, or null.
 *
 * Returns null on anything malformed rather than throwing: this runs on every
 * navigation, and a stray `#/share/` typed by hand is a wrong route, not a
 * crash.
 */
export function parseShareRoute(path: string): ShareRef | null {
  const match = /^\/share\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(path);
  if (!match) return null;
  try {
    const key = fromBase64Url(match[2]);
    if (key.length !== 32) return null;
    return { id: match[1], key };
  } catch {
    return null;
  }
}

/**
 * Where published bundles are fetched from.
 *
 * Set at build time to raw.githubusercontent on the default branch, exactly as
 * the catalog is, and for the same reason: deploys are cut from tags, so a
 * bundle that had to wait for a release would make "here is what we covered
 * this week" a release-engineering task. Reading from the branch means
 * publishing a share is one commit.
 *
 * Empty in a local build, where the same-origin copy below is the only copy.
 */
const REMOTE_BASE: string = import.meta.env.VITE_SHARE_BASE_URL || '';

/**
 * The app's own copy, from `public/shares/` via Vite's base.
 *
 * As fresh as the last deploy rather than as fresh as the last commit, so it is
 * the fallback and not the first choice — but it is what makes the flow
 * testable with no network and no push.
 */
function localUrl(id: string): string {
  return `${import.meta.env.BASE_URL}shares/${shareFileName(id)}`;
}

/** Candidate URLs for a share, in the order they should be tried. */
export function shareUrls(id: string): string[] {
  const urls: string[] = [];
  if (REMOTE_BASE) urls.push(`${REMOTE_BASE.replace(/\/+$/, '')}/${shareFileName(id)}`);
  urls.push(localUrl(id));
  return urls;
}
