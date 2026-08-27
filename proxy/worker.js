/**
 * Ḥāshiya proxy — the one piece of server the deployed app needs.
 *
 * ---------------------------------------------------------------------------
 * What this is for
 *
 * `npm run dev` runs a server, so Vite can forward /shamela/... to shamela.ws
 * from Node, where the same-origin policy does not apply. GitHub Pages is a
 * file host: there is no process there to forward anything, and shamela.ws
 * sends no Access-Control-Allow-Origin, so a direct fetch from the page is
 * fetched and then withheld from the script by the browser.
 *
 * This Worker is that missing forwarder. Its path prefixes are deliberately
 * identical to the ones in vite.config.ts, so the client mapping in
 * WebHttpClient.ts is the same table in both environments — only the host in
 * front of the prefix changes.
 *
 * ---------------------------------------------------------------------------
 * What it deliberately does NOT do
 *
 * - It never logs. Not the URL, not a header, not a query. A `console.log` here
 *   would end up in `wrangler tail` and in the Cloudflare dashboard, and the
 *   sunnah.com route (if you enable it) carries an API key.
 * - It forwards no credentials of its own and copies no Cookie or Authorization
 *   header from the caller. The outbound header set is built from scratch below
 *   rather than cloned, so nothing can leak through by omission.
 * - It proxies GET only. Nothing here needs to write to anything.
 * - It answers only for the four hosts named in ROUTES. An open forwarder with
 *   your Cloudflare quota behind it and your Worker URL published in a public
 *   repository is a bad combination; the allowlist is what keeps this a
 *   Ḥāshiya proxy rather than a proxy.
 * ---------------------------------------------------------------------------
 */

/**
 * Shamela serves a lighter page to unrecognised agents, and dorar.net refuses
 * them outright with a 403. Both were checked against the live services; this
 * is the same string vite.config.ts sends for the same reason.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * `send`    headers this Worker adds on the way out.
 * `forward` headers copied from the caller, lowercase. Keep this list as short
 *           as it can possibly be — anything on it travels through Cloudflare.
 */
const ROUTES = [
  {
    prefix: '/shamela',
    origin: 'https://shamela.ws',
    send: { 'User-Agent': BROWSER_UA },
    forward: [],
  },
  {
    prefix: '/dorar',
    origin: 'https://dorar.net',
    send: { 'User-Agent': BROWSER_UA, Referer: 'https://dorar.net/' },
    forward: [],
  },
  {
    prefix: '/quran-api',
    origin: 'https://api.quran.com',
    send: {},
    forward: [],
  },

  // ---------------------------------------------------------------------
  // sunnah.com is commented out ON PURPOSE. Uncomment only if you accept
  // the trade-off described here.
  //
  // api.sunnah.com authenticates with an X-API-Key header, so enabling this
  // route means your sunnah.com key travels through this Worker on its way to
  // sunnah.com. The standing rule for this project is that a key goes nowhere
  // but its own provider's endpoint, and this Worker — even though the account
  // is yours — is a hop in between.
  //
  // Nothing breaks while it stays off. A hadith with no retrieved translation
  // already renders as Arabic plus an explicit note, which is the correct
  // output; it is never machine-translated. Turn it on only if you decide the
  // extra hop is acceptable, and know that this file never logs headers.
  // ---------------------------------------------------------------------
  // {
  //   prefix: '/sunnah',
  //   origin: 'https://api.sunnah.com',
  //   send: {},
  //   forward: ['x-api-key'],
  // },
]
  // Longest prefix first, so a future '/quran-api-v2' could never be swallowed
  // by '/quran-api'.
  .sort((a, b) => b.prefix.length - a.prefix.length);

/** Client headers that are always safe to pass along. */
const ALWAYS_FORWARD = ['accept', 'accept-language'];

/** Upstreams occasionally hang. Fail with a readable message instead. */
const UPSTREAM_TIMEOUT_MS = 25_000;

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get('Origin');
    const allow = allowedOrigin(requestOrigin, env);

    // Error responses always carry CORS headers, even when the origin is
    // rejected. Otherwise a misconfigured ALLOWED_ORIGINS surfaces in the
    // browser as an opaque "CORS error" with the explanation sitting in a body
    // the page is not permitted to read — which is exactly the kind of
    // misleading failure this proxy exists to avoid. The bodies are fixed
    // strings and disclose nothing.
    const echo = requestOrigin ?? '*';

    if (request.method === 'OPTIONS') {
      return allow ? preflight(allow) : fail(403, originRejected(requestOrigin), echo);
    }

    if (request.method !== 'GET') {
      return fail(405, 'This proxy forwards GET requests only.', echo);
    }

    if (!allow) {
      return fail(403, originRejected(requestOrigin), echo);
    }

    const url = new URL(request.url);
    const route = ROUTES.find(
      (candidate) =>
        url.pathname === candidate.prefix || url.pathname.startsWith(`${candidate.prefix}/`),
    );

    if (!route) {
      return fail(
        404,
        `No route for ${url.pathname}. This proxy serves only: ` +
          `${ROUTES.map((r) => r.prefix).join(', ')}.`,
        echo,
      );
    }

    // pathname is already percent-encoded, and search is taken verbatim, so an
    // Arabic search term survives the hop unchanged. Do not re-encode either.
    const target = route.origin + url.pathname.slice(route.prefix.length) + url.search;

    // Built from scratch, never cloned from the incoming request: a Cookie or
    // Authorization header cannot reach the upstream by accident.
    const outbound = new Headers(route.send);
    for (const name of [...ALWAYS_FORWARD, ...route.forward]) {
      const value = request.headers.get(name);
      if (value) outbound.set(name, value);
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        method: 'GET',
        headers: outbound,
        redirect: 'follow',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      return fail(502, `Could not reach ${route.origin}: ${reason}`, echo);
    }

    // A fresh header set again, for the same reason: no Set-Cookie, no upstream
    // caching directives that would confuse the service worker.
    const headers = new Headers();
    const contentType = upstream.headers.get('Content-Type');
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', allow);
    headers.set('Vary', 'Origin');

    // Streamed rather than buffered, so a large book page does not sit in
    // Worker memory in full.
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

/**
 * The value for Access-Control-Allow-Origin, or null to refuse.
 *
 * With ALLOWED_ORIGINS unset this answers anyone, which is convenient for the
 * first deploy and is not where you want to leave it: the Worker URL is baked
 * into a public build. With it set, a request must carry a matching Origin —
 * which a browser always sends cross-origin, and curl does not.
 *
 * The matched origin is echoed rather than '*' so that credentials-mode
 * requests behave, and Vary: Origin is set at the call site so a shared cache
 * cannot serve one site's answer to another.
 */
function allowedOrigin(requestOrigin, env) {
  const configured = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (configured.length === 0) return requestOrigin ?? '*';
  if (!requestOrigin) return null;
  return configured.includes(requestOrigin) ? requestOrigin : null;
}

function originRejected(requestOrigin) {
  return (
    `Origin ${requestOrigin ?? '(none sent)'} is not in this proxy's ALLOWED_ORIGINS. ` +
    `Set that variable to the origin the app is served from — for a GitHub Pages ` +
    `project site that is https://<user>.github.io, with no repository path.`
  );
}

function preflight(allow) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      // Only what a route actually forwards, plus the two standard ones.
      'Access-Control-Allow-Headers': 'Accept, Accept-Language, X-API-Key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

function fail(status, message, allow) {
  return new Response(JSON.stringify({ error: message }, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': allow,
      Vary: 'Origin',
    },
  });
}
