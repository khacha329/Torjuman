import type { HttpClient, HttpRequestOptions, HttpResponse } from './HttpClient';

/**
 * Upstreams rewritten onto proxy paths. The prefixes are declared twice — in
 * vite.config.ts for the dev server, and in proxy/worker.js for the deployed
 * app — and are deliberately identical in both, so this one table serves both
 * environments and only the host in front of the prefix changes. The rest of
 * the app only ever deals in real upstream URLs.
 *
 * shamela.ws sends no CORS headers at all; api.sunnah.com does not advertise
 * them either. `needsProxy` marks a host that cannot be reached from a browser
 * without one. That distinction only starts to matter in a static deployment —
 * see below.
 */
export const PROXIED_ORIGINS: [origin: string, prefix: string, needsProxy: boolean][] = [
  ['https://shamela.ws', '/shamela', true],
  ['https://api.sunnah.com', '/sunnah', true],
  // quran.com does send CORS headers. It is proxied in development so that a
  // browser extension or strict privacy setting cannot break it, but it is the
  // one upstream here that works perfectly well without a proxy.
  // Not "/quran" — that path serves the bundled muṣḥaf from public/quran/.
  ['https://api.quran.com', '/quran-api', false],
  // dorar.net answers with JSONP rather than CORS headers, and 403s anything
  // that does not look like a browser. Proxy-only.
  ['https://dorar.net', '/dorar', true],
];

/**
 * A host that needs the dev proxy, asked for where there is no dev proxy.
 *
 * ---------------------------------------------------------------------------
 * Why this is an explicit error rather than a failed fetch
 *
 * The proxy paths are declared in vite.config.ts and exist only while the Vite
 * dev server is running. On a static host — GitHub Pages — `/shamela/...` is
 * just a path that is not there, and because the service worker answers
 * navigations with index.html, a request to it can come back as *200 with a
 * page of HTML*. The parser then reports that Shamela returned no content,
 * which sends the reader looking at the parser for a fault that is nowhere near
 * it.
 *
 * So the impossible request is refused with the reason. Importing a book stays
 * a desktop-with-dev-server operation, and books reach the phone through
 * Library transfer, which is what that feature is for.
 * ---------------------------------------------------------------------------
 */
export class ProxyUnavailableError extends Error {
  readonly origin: string;

  constructor(origin: string) {
    super(
      `${origin} cannot be reached from this deployment. It sends no CORS headers, ` +
        `so a browser needs a proxy in front of it, and this build was made without ` +
        `one. Either deploy proxy/worker.js and set the PROXY_URL repository ` +
        `variable, or import on a desktop with "npm run dev" and move the book ` +
        `across with Library transfer.`,
    );
    this.name = 'ProxyUnavailableError';
    this.origin = origin;
  }
}

/**
 * The deployed proxy, if this build was given one.
 *
 * Set at build time from the PROXY_URL repository variable (see
 * vite.config.ts), and empty otherwise, which is the honest default: a static
 * host cannot forward a request, so without this the proxy-only upstreams are
 * genuinely unreachable and say so rather than failing obscurely.
 *
 * In development it stays empty regardless — the Vite dev server is already
 * serving these prefixes same-origin, and routing a local request out to
 * Cloudflare and back would only add a network hop and a CORS preflight to
 * every page fetch while scraping a book.
 */
const PROXY_BASE: string = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_PROXY_URL ?? '').replace(/\/+$/, '');

/**
 * Whether the proxy-only upstreams can be reached at all: same-origin paths
 * under the dev server, a deployed Worker otherwise.
 *
 * Read by ImportScreen and CatalogScreen, which say so before the attempt
 * rather than after it fails.
 */
export const PROXY_AVAILABLE = import.meta.env.DEV || PROXY_BASE !== '';

/**
 * Browser HttpClient for the web phase.
 *
 * Under Capacitor this is replaced by a NativeHttpClient that calls the same
 * upstream URLs directly — native HTTP is not subject to CORS — and the dev
 * proxy is dropped.
 */
export class WebHttpClient implements HttpClient {
  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    let target = url;
    for (const [origin, prefix, needsProxy] of PROXIED_ORIGINS) {
      if (!url.startsWith(origin)) continue;

      if (import.meta.env.DEV) {
        // Same-origin path; the Vite dev server forwards it.
        target = prefix + url.slice(origin.length);
      } else if (PROXY_BASE) {
        // Same prefix, absolute this time. quran.com goes through it too even
        // though it does not need to, so that one code path is exercised in
        // production rather than two.
        target = PROXY_BASE + prefix + url.slice(origin.length);
      } else if (needsProxy) {
        // Refuse rather than fetch a path that is not there and get index.html
        // back with a 200.
        throw new ProxyUnavailableError(origin);
      }
      break;
    }

    const response = await fetch(target, {
      method: 'GET',
      signal: options.signal,
      headers: options.headers,
      redirect: 'follow',
    });

    return {
      status: response.status,
      ok: response.ok,
      body: await response.text(),
    };
  }
}
