import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The path the app is served from.
 *
 * On GitHub Pages a project site lives at `https://<user>.github.io/<repo>/`,
 * so every asset URL has to carry `/<repo>/` or the page loads and then 404s
 * on its own JavaScript. Rather than hard-coding a repo name that has to be
 * kept in step with whatever the repository is actually called, this reads it
 * from `GITHUB_REPOSITORY` — which Actions always sets to `owner/repo` — and
 * falls back to `/` everywhere else, so `npm run dev` and `npm run preview`
 * are unaffected.
 *
 * `BASE_PATH` overrides both, for a custom domain or a subdirectory host.
 * A user or org site (`<user>.github.io`) is served from the root, so it is
 * detected and left alone.
 */
function resolveBase(): string {
  if (process.env.BASE_PATH) return process.env.BASE_PATH;

  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo || repo.endsWith('.github.io')) return '/';
  return `/${repo}/`;
}

const base = resolveBase();

/**
 * Where the refreshable catalog lives.
 *
 * Same reasoning as the base path: derived from `GITHUB_REPOSITORY` rather than
 * hard-coded, so the recommended set can be corrected by editing one file in
 * the repository without shipping a build, and renaming the repo does not break
 * it. Absent locally, where the bundled copy is the only copy.
 *
 * raw.githubusercontent.com sends `access-control-allow-origin: *`, so — unlike
 * shamela.ws — this one is reachable from the deployed PWA with no proxy.
 */
function resolveCatalogUrl(): string {
  if (process.env.VITE_CATALOG_URL) return process.env.VITE_CATALOG_URL;

  const repository = process.env.GITHUB_REPOSITORY;
  const ref = process.env.GITHUB_REF_NAME ?? 'main';
  return repository
    ? `https://raw.githubusercontent.com/${repository}/${ref}/public/catalog.json`
    : '';
}

// The Shamela proxy exists only for the web phase.
//
// shamela.ws sends no CORS headers, so a browser fetch() to it fails. Every
// scraper request therefore goes to a same-origin path (/shamela/...) which the
// Vite dev server forwards to https://shamela.ws/... server-side, where CORS
// does not apply.
//
// When the app is packaged with Capacitor, NativeHttpClient talks to shamela.ws
// directly (native HTTP is not subject to CORS) and this proxy is dropped.
export default defineConfig({
  base,
  define: {
    // Read by src/catalog/catalogService.ts. Serialised rather than passed
    // through an .env file so there is one place the deployment identity is
    // derived, next to `base`.
    'import.meta.env.VITE_CATALOG_URL': JSON.stringify(resolveCatalogUrl()),
  },
  plugins: [
    react(),
    tailwindcss(),
    // Offline shell.
    //
    // Everything the reader needs is precached: the JS and CSS, the Arabic
    // webfonts, and the bundled muṣḥaf with its translation. Nothing is
    // fetched from a CDN at runtime — a remote font in particular does not fail
    // loudly, it silently falls back to a face that clips harakāt.
    //
    // Note this only takes effect in a production build served over HTTPS (or
    // localhost). Service workers do not register over plain HTTP, which is
    // also why the LAN dev-server address is a development convenience and not
    // the way to run this on the tablet long-term.
    VitePWA({
      registerType: 'autoUpdate',
      // These three must agree with Vite's `base`, and the failure when they
      // do not is quiet: a service worker whose scope does not cover the page
      // registers successfully and then controls nothing, so the app looks
      // installed and simply never works offline, with no error anywhere.
      base,
      scope: base,
      includeAssets: ['fonts/*.woff2', 'quran/*.json'],
      workbox: {
        // The muṣḥaf and its translation are ~2.2 MB together and must be
        // precached, so the default 2 MB per-file cap is lifted.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // wasm is on the list because sql.js reads an imported QUL resource.
        // A user who imports a tafsīr on the tablet and then loses the network
        // must not find that the import step itself needed one.
        globPatterns: ['**/*.{js,css,html,woff2,json,svg,png,wasm}'],
        // …but not the ONNX runtime, which is 23 MB and is fetched only when
        // the user chooses to download an on-device translation model. Putting
        // that in the precache would make every cold install pay for a feature
        // most installs never turn on.
        globIgnores: ['**/ort-wasm*'],
        // A cold launch with no network renders the library, not the browser's
        // error page. Base-prefixed for the same reason as `scope` above.
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Model weights are large and immutable; once fetched they stay.
            urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs[^/]*\.hf\.co)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'offline-models',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Ḥāshiya — Shamela Reader',
        short_name: 'Ḥāshiya',
        description:
          'Read Arabic texts from the Shamela library, with on-demand translation and offline reference works.',
        theme_color: '#fbf9f4',
        background_color: '#fbf9f4',
        display: 'standalone',
        orientation: 'any',
        // Relative to the manifest, which is itself served from `base` — so
        // installing from a project page opens the app rather than the user's
        // github.io root.
        id: base,
        scope: base,
        start_url: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/shamela': {
        target: 'https://shamela.ws',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/shamela/, ''),
        headers: {
          // Shamela serves a lighter response to unknown agents; identify as a
          // normal browser so the markup matches what the parser was written
          // against.
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
      },
      // api.sunnah.com does not advertise CORS, so hadith lookups are proxied
      // the same way. quran.com does send CORS headers but is proxied too so
      // that a browser extension or strict privacy setting cannot break it.
      '/sunnah': {
        target: 'https://api.sunnah.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sunnah/, ''),
      },
      // Deliberately NOT "/quran": that path serves the bundled muṣḥaf from
      // public/quran/, and a proxy there would swallow the static asset and
      // forward it to api.quran.com.
      '/quran-api': {
        target: 'https://api.quran.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/quran-api/, ''),
      },
      // dorar.net answers with JSONP rather than CORS headers, so the body is
      // unreadable from a browser fetch. Proxying it server-side sidesteps that
      // entirely, exactly as it does for Shamela. It also identifies as a
      // browser: the service refuses unknown agents outright.
      '/dorar': {
        target: 'https://dorar.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dorar/, ''),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Referer: 'https://dorar.net/',
        },
      },
    },
  },
});
