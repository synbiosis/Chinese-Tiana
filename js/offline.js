// Offline support: registers the service worker, asks the browser not to evict
// saved progress, and downloads stroke-order data for all characters in the background.
(function () {
  const STROKE_URL = (c) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(c)}.json`;
  const DONE_KEY = 'hanzi1000.strokesCached';

  async function cacheStrokes() {
    if (!('caches' in window) || localStorage.getItem(DONE_KEY) === String(window.HANZI.length)) return;
    const cache = await caches.open('hanzi1000-cdn');
    let ok = 0;
    for (let i = 0; i < window.HANZI.length; i += 20) {
      if (!navigator.onLine) return; // try again next launch
      const batch = window.HANZI.slice(i, i + 20).map((h) => STROKE_URL(h.c));
      await Promise.all(batch.map(async (url) => {
        try {
          if (!(await cache.match(url))) {
            const res = await fetch(url);
            if (!res.ok) return;
            await cache.put(url, res);
          }
          ok += 1;
        } catch (e) { /* offline or blocked; retried next launch */ }
      }));
      await new Promise((r) => setTimeout(r, 300)); // stay out of the way of the lesson
    }
    if (ok === window.HANZI.length) localStorage.setItem(DONE_KEY, String(ok));
  }

  const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && isSecure) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      setTimeout(() => cacheStrokes().catch(() => {}), 3000);
    });
  }
})();
