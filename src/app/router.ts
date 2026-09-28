import { useSyncExternalStore } from 'react';

// A hash router in forty lines, rather than a routing dependency for four
// screens. Hash routing also means the app keeps working when opened from the
// file system or served without a history-API fallback.

export type Route =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'catalog' }
  | { name: 'reader'; bookId: string }
  /**
   * A shared chapter someone was sent a link to.
   *
   * Both halves ride in the hash rather than a query string, and `key` is the
   * reason: it decrypts the bundle, and a fragment is the only part of a URL
   * browsers never put in the HTTP request. Carried as the base64url text it
   * arrived as — decoding it is the share screen's job, so a malformed key is
   * an error on one screen rather than a router that can throw.
   */
  | { name: 'share'; id: string; key: string }
  | { name: 'settings' };

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'library':
      return '#/';
    case 'import':
      return '#/import';
    case 'catalog':
      return '#/catalog';
    case 'reader':
      return `#/read/${encodeURIComponent(route.bookId)}`;
    case 'share':
      return `#/share/${route.id}/${route.key}`;
    case 'settings':
      return '#/settings';
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route).slice(1);
}

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/import') return { name: 'import' };
  if (path === '/catalog') return { name: 'catalog' };
  if (path === '/settings') return { name: 'settings' };

  const reader = /^\/read\/(.+)$/.exec(path);
  if (reader) return { name: 'reader', bookId: decodeURIComponent(reader[1]) };

  // Matched loosely on purpose: whether the key is the right length is a
  // question for the screen that uses it, which can say so. A near-miss here
  // would silently drop the visitor on the library with no explanation.
  const share = /^\/share\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(path);
  if (share) return { name: 'share', id: share[1], key: share[2] };

  return { name: 'library' };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

let cachedHash = '';
let cachedRoute: Route = { name: 'library' };

function getSnapshot(): Route {
  if (window.location.hash !== cachedHash) {
    cachedHash = window.location.hash;
    cachedRoute = parseHash(cachedHash);
  }
  return cachedRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot);
}
