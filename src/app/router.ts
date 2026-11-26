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
  /**
   * Receiving a whole-tablet transfer. `shared` when the file arrived through
   * Android's share sheet (see public/share-target.js) rather than being picked.
   */
  | { name: 'receive'; shared: boolean }
  /**
   * Settings, open on one of its tabs. With no `tab` the screen opens on the
   * tab it was last left on, so a plain "Settings" button does not always
   * land on the first one; a pointer elsewhere in the app ("Settings → Data →
   * Library transfer") names its tab.
   */
  | { name: 'settings'; tab?: SettingsTab };

/**
 * The Settings tabs, in the order the tab bar shows them. Here rather than in
 * the screen because the router parses them and every pointer to a section
 * names one; their labels and contents are the screen's.
 */
export const SETTINGS_TABS = ['translation', 'reading', 'library', 'data', 'about'] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(value: string): value is SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value);
}

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
    case 'receive':
      return route.shared ? '#/receive/shared' : '#/receive';
    case 'settings':
      return route.tab ? `#/settings/${route.tab}` : '#/settings';
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route).slice(1);
}

/**
 * Go to `route` without adding a history entry. For moves inside one screen,
 * such as Settings' tabs: the Android back gesture then leaves the screen
 * instead of walking back through every tab that was looked at.
 */
export function replaceRoute(route: Route): void {
  window.location.replace(hrefFor(route));
}

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/import') return { name: 'import' };
  if (path === '/catalog') return { name: 'catalog' };
  if (path === '/settings') return { name: 'settings' };
  // An unknown tab still opens Settings, on the last tab, rather than
  // dropping the visitor on the library: a link from an older build that
  // named a tab since renamed should not look like a broken app.
  const settings = /^\/settings\/([a-z]+)$/.exec(path);
  if (settings) return isSettingsTab(settings[1]) ? { name: 'settings', tab: settings[1] } : { name: 'settings' };
  if (path === '/receive') return { name: 'receive', shared: false };
  if (path === '/receive/shared') return { name: 'receive', shared: true };

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
