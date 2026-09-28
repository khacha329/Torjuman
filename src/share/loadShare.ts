import { SHARE_VERSION, type ShareBundle } from './bundle';
import { openBundle } from './crypto';
import { shareUrls, type ShareRef } from './shareLink';

// Fetching and opening a shared chapter.
//
// A visitor arriving on one of these links has no account, no key, no imported
// books and quite possibly no idea what this app is. Every failure therefore
// has to say what went wrong in a sentence they could act on or forward — the
// one outcome that must never happen is a blank page, which is what an
// unhandled rejection in the loader would produce.

export class ShareLoadError extends Error {
  /** Shown under the message, when there is something more concrete to add. */
  readonly detail: string | null;

  constructor(message: string, detail: string | null = null) {
    super(message);
    this.name = 'ShareLoadError';
    this.detail = detail;
  }
}

/**
 * Fetch the bundle's bytes, trying each candidate URL in turn.
 *
 * Two places hold a copy — the repository branch, which is current the moment a
 * share is committed, and the deployed build, which is only as new as the last
 * release. The branch is tried first for that reason. A 404 there is completely
 * normal for a share published before the URL scheme existed, so it falls
 * through rather than failing.
 */
async function fetchBundle(id: string): Promise<Uint8Array> {
  const urls = shareUrls(id);
  const failures: string[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        failures.push(`${response.status} from ${new URL(url).host}`);
        continue;
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (cause) {
      failures.push(`${new URL(url).host}: ${(cause as Error).message}`);
    }
  }

  throw new ShareLoadError(
    'This shared chapter could not be found.',
    failures.length > 0
      ? `Tried ${urls.length} location(s) — ${failures.join('; ')}.`
      : null,
  );
}

/**
 * The whole path: fetch, decrypt, decompress, validate, version-check.
 *
 * The version check is last and is deliberately strict. A bundle is a file
 * somebody may open years after it was made, and rendering a format this build
 * only half understands would show them a chapter with pieces silently missing
 * — which, for material somebody is teaching from, is worse than an error.
 */
export async function loadShare(ref: ShareRef): Promise<ShareBundle> {
  const bytes = await fetchBundle(ref.id);

  let bundle: ShareBundle;
  try {
    bundle = await openBundle(bytes, ref.key);
  } catch (cause) {
    throw new ShareLoadError((cause as Error).message);
  }

  if (bundle.version > SHARE_VERSION) {
    throw new ShareLoadError(
      'This link was made by a newer version of the app.',
      `The chapter is in format ${bundle.version}; this build reads up to ${SHARE_VERSION}. Reload the page to pick up the latest version.`,
    );
  }
  if (bundle.version < SHARE_VERSION) {
    throw new ShareLoadError(
      'This link is in a format this build no longer reads.',
      `The chapter is in format ${bundle.version}; this build reads ${SHARE_VERSION}. Ask whoever sent it to publish it again.`,
    );
  }

  return bundle;
}
