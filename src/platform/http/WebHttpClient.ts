import type { HttpClient, HttpRequestOptions, HttpResponse } from './HttpClient';

/**
 * Upstreams rewritten onto the same-origin proxy paths declared in
 * vite.config.ts. shamela.ws sends no CORS headers at all; api.sunnah.com does
 * not advertise them either. Keeping the mapping here means the rest of the app
 * only ever deals in real upstream URLs.
 *
 * `needsProxy` marks a host that cannot be reached from a browser without one.
 * That distinction only starts to matter in a static deployment — see below.
 */
const PROXIED_ORIGINS: [origin: string, prefix: string, needsProxy: boolean][] = [
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
        `so the browser can only reach it through the development proxy. Import books ` +
        `on a desktop with "npm run dev" and move them across with Library transfer.`,
    );
    this.name = 'ProxyUnavailableError';
    this.origin = origin;
  }
}

/** Whether same-origin proxy paths exist — true only under the dev server. */
export const PROXY_AVAILABLE = import.meta.env.DEV;

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

      if (PROXY_AVAILABLE) {
        target = prefix + url.slice(origin.length);
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
