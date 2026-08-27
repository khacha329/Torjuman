# The proxy

`npm run dev` runs a server, so Vite forwards `/shamela/…` to shamela.ws from
Node, where the same-origin policy does not apply. GitHub Pages is a file host:
there is no process there to forward anything, and shamela.ws sends no
`Access-Control-Allow-Origin`, so the browser fetches the page and then refuses
to let the script read it.

`worker.js` is that missing forwarder, deployed to Cloudflare Workers. With it,
importing works on the tablet. Without it, importing is a desktop operation and
books reach the tablet through **Settings → Library transfer**, which is what
that feature is for. Both are supported; nothing else in the app depends on
this.

Free tier is 100,000 requests a day and needs no card. A book import is roughly
one request per page fetched.

---

## Deploy it

**1. Install wrangler and log in.**

```bash
cd proxy
npm install --global wrangler
wrangler login
```

That opens a browser to authorise. If you have no Cloudflare account it offers
to make one.

**2. Check `ALLOWED_ORIGINS` in `wrangler.toml`.**

It is pre-filled with `https://khacha329.github.io`. An origin is scheme + host
with **no path** — the site lives at `https://khacha329.github.io/Torjuman/`,
but its origin is just the host part. Getting this wrong is the most likely
cause of a 403 from the Worker.

**3. Deploy.**

```bash
wrangler deploy
```

It prints the URL, of the form
`https://hashiya-proxy.<your-subdomain>.workers.dev`. Copy it.

**4. Check it before wiring it in.**

```powershell
.\check.ps1 -WorkerUrl https://hashiya-proxy.<your-subdomain>.workers.dev
```

This step matters, and `npm run verify` cannot do it for you: that checks the
Worker's own logic against a stubbed upstream, but not whether the real services
answer *Cloudflare*. shamela.ws and dorar.net both treat unfamiliar clients
differently and dorar 403s aggressively, so a perfectly correct Worker can still
be refused. Better to learn that here than from a failed import on the tablet.

Note that a nonexistent book id still returns **200 with a generic page**, so
"Arabic HTML came back" is not on its own evidence that anything works — the
script looks for a book-page marker instead. Real ids to hand: 9260, 21812,
1673, 1711, 11244, 12145, 147927.

**5. Tell the build about it.**

On GitHub: **Settings → Secrets and variables → Actions → Variables → New
repository variable**.

- Name: `PROXY_URL`
- Value: the URL from step 3, no trailing slash

A *variable*, not a secret. It is a public URL that ends up in the built
JavaScript regardless, and marking it secret would only mean Actions redacts it
from the logs of whoever is debugging it later.

**6. Re-run the deploy workflow.** Actions → Deploy to GitHub Pages → Run
workflow. The amber "importing is not available" notice on the Import and
Catalog screens disappears when the build picked the variable up — that notice
is the indicator, so if it is still there, `PROXY_URL` did not arrive.

---

## What it will and will not do

It forwards **GET only**, to **four hosts only** (shamela.ws, dorar.net,
api.quran.com, and api.sunnah.com if you enable it). The allowlist is the point:
the Worker URL is inside a public build, so anyone can read it, and an open
forwarder backed by your quota is not a thing to publish.

`ALLOWED_ORIGINS` stops another *website* from using it. It is not a defence
against curl — an `Origin` header is trivially set by hand — so the host
allowlist is what actually bounds the damage. If the request count ever looks
wrong, Cloudflare's dashboard has per-Worker rate limiting.

**It never logs.** No URL, no header, no query. `[observability] enabled =
false` in `wrangler.toml` for the same reason. Turn it on deliberately while
debugging and off again after.

### sunnah.com is off by default

The `/sunnah` route is commented out in `worker.js`. `api.sunnah.com`
authenticates with an `X-API-Key` header, so enabling it means your sunnah.com
key travels through this Worker on the way to sunnah.com. The standing rule
here is that a key goes nowhere but its own provider's endpoint, and this
Worker — your account or not — is a hop in between.

Nothing breaks while it stays off: a hadith with no retrieved translation
already renders as Arabic with an explicit note, which is the correct output. It
is never machine-translated. Uncomment the route only if you decide the extra
hop is acceptable.

Your **Anthropic** key never touches this Worker at all. `api.anthropic.com`
sends CORS headers, so the app calls it directly and it is not in the routing
table.

---

## Changing it later

```bash
cd proxy
wrangler deploy          # after editing worker.js
wrangler tail            # live logs, while debugging — see the note above
wrangler delete          # remove it entirely
```

Deleting the Worker without clearing `PROXY_URL` leaves a build pointing at a
URL that 404s. Clear the variable and re-run the deploy workflow, and the app
returns to saying importing is unavailable, which is at least true.

## Keeping the two proxies in step

The path prefixes are declared in three places and must agree:

| Where | What it is for |
| --- | --- |
| `vite.config.ts` → `server.proxy` | the dev server |
| `proxy/worker.js` → `ROUTES` | the deployed app |
| `src/platform/http/WebHttpClient.ts` → `PROXIED_ORIGINS` | the client, both |

Adding an upstream means adding it to all three. The client table is the one
that decides whether a host is proxy-only (`needsProxy`), which is what turns
importing on and off in the UI.
