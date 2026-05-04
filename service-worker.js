/**
 * SCHULHELFER – Self-destructing service worker.
 *
 * The old app's SW lives in scope /schulhelfer-rittergasse/ on devices
 * that installed the PWA before the repo was renamed to /helferliste/.
 * Browsers re-fetch ./service-worker.js on navigations within scope and
 * install any byte-different replacement. This file is that replacement:
 * it nukes every cache under this scope, unregisters itself, and pushes
 * each open client to the new URL. After activation the page falls
 * through to the network, hits the redirect index.html, and the user
 * lands on https://ps-rittergasse.github.io/helferliste/.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));

    await self.clients.claim();

    try {
      await self.registration.unregister();
    } catch (e) {
      // Best-effort; ignore.
    }

    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => {
      try {
        client.navigate('https://ps-rittergasse.github.io/helferliste/');
      } catch (e) {
        // Some browsers reject cross-origin navigate(); the redirect
        // page will pick up where this leaves off.
      }
    });
  })());
});
