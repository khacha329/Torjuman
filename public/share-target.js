// Receives a tablet transfer file shared to the installed app.
//
// Pulled into the generated service worker with workbox's importScripts (see
// vite.config.ts), so it runs before workbox's own routes. The manifest's
// share_target tells Android to POST the shared file to ./receive-transfer; a
// static host cannot answer a POST, so this catches it, parks the file in a
// cache, and redirects to the receive screen, which takes it from there
// (src/library/incomingTransfer.ts — the cache name and key must match).

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;
  if (!new URL(request.url).pathname.endsWith('/receive-transfer')) return;

  event.respondWith(
    (async () => {
      const scope = self.registration.scope;
      try {
        const form = await request.formData();
        const file = form.get('transfer');
        if (!(file instanceof File)) return Response.redirect(`${scope}#/receive`, 303);

        const cache = await caches.open('incoming-transfer');
        await cache.put(
          `${scope}incoming-transfer-file`,
          new Response(file, {
            headers: {
              'content-type': file.type || 'application/octet-stream',
              'x-file-name': encodeURIComponent(file.name),
            },
          }),
        );
        return Response.redirect(`${scope}#/receive/shared`, 303);
      } catch {
        // Better the plain receive screen than an error page: the file can
        // still be opened from there.
        return Response.redirect(`${scope}#/receive`, 303);
      }
    })(),
  );
});
