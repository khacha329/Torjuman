import { useSyncExternalStore } from 'react';

// A hash router in forty lines, rather than a routing dependency for four
// screens. Hash routing also means the app keeps working when opened from the
// file system or served without a history-API fallback.

export type Route =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'catalog' }
  | { name: 'reader'; bookId: string }
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
