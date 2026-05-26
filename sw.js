/* Fehu Mobile — Service Worker
   Strategy:
   - Cache-first for app shell (HTML, manifest, icons) — works offline.
   - Network-first for CDN scripts (fonts, libraries) — fall back to cache.
   - No caching for API calls (Supabase, Anthropic, Pendle, DefiLlama) — always live.
*/

const CACHE_VERSION = 'fehu-mobile-v2';
const APP_SHELL = [
  './mobile.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

const CDN_PREFIXES = [
  'https://cdn.jsdelivr.net/',
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/'
];

const API_PREFIXES = [
  'supabase.co',
  'api.anthropic.com',
  'api-v2.pendle.finance',
  'yields.llama.fi',
  'cloud-api.krystal.app',
  'api.coingecko.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Some shell items failed to cache', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;

  // Never cache API calls — always go live
  if (API_PREFIXES.some(p => url.includes(p))) {
    return; // let browser handle normally
  }

  // Network-first for the main HTML — ensures fresh shell when online,
  // falls back to cache only when offline
  if (url.endsWith('/mobile.html') || url.endsWith('/') ||
      url.endsWith('/index.html') || req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./mobile.html', copy));
        }
        return res;
      }).catch(() => caches.match('./mobile.html'))
    );
    return;
  }

  // Network-first for CDN (newer versions available)
  if (CDN_PREFIXES.some(p => url.startsWith(p))) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for everything else (icons, manifest)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
