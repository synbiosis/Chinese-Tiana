// Service worker: keeps the app usable offline after the first visit.
// Bump VERSION when shipping changes so old caches are cleared.
const VERSION = 'v1';
const SHELL = `hanzi1000-shell-${VERSION}`;
const CDN = 'hanzi1000-cdn'; // stroke data and libraries; kept across versions

const SHELL_FILES = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg',
  'css/style.css',
  'data/hanzi.js',
  'js/store.js',
  'js/speech.js',
  'js/panda.js',
  'js/offline.js',
  'js/app.js',
];
const CDN_FILES = ['https://cdn.jsdelivr.net/npm/hanzi-writer@3.7.2/dist/hanzi-writer.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(SHELL_FILES);
    try { await (await caches.open(CDN)).addAll(CDN_FILES); } catch (e) { /* stroke order is optional */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('hanzi1000-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // App files: answer from cache straight away, refresh the cache in the background.
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      return (await network) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    })());
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // Versioned CDN files never change: cache first.
    event.respondWith((async () => {
      const cache = await caches.open(CDN);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
  }
});
