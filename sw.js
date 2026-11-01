// Lottery Tally offline support: keeps a copy of the app so it opens without a connection.
// Counts are not stored here; they live in the browser's local storage, which updates never touch.
const CACHE = 'lottery-tally-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // fetch fresh copies (not the browser's HTTP cache) so a new version is picked up right away;
    // add files one by one so a missing optional file doesn't stop installation
    await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // only remove this app's old caches; other sites on the same github.io origin share cache storage
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('lottery-tally-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Serve the saved copy immediately, refresh it from the network in the background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // always check with the server (a 304 when nothing changed), so updates show on the next open
  const fromNetwork = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(async (res) => {
    if (res && res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  }).catch(() => null);
  event.waitUntil(fromNetwork);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;
    const res = await fromNetwork;
    if (res) return res;
    if (req.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    return Response.error();
  })());
});
