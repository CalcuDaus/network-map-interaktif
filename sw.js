/**
 * SmartSchool NetMap — Progressive Web App Service Worker
 * Fast app-shell & static asset caching while bypassing live API and WebSocket routes.
 */

const CACHE_NAME = 'netmap-pwa-v28';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/layout.css',
  './css/components.css',
  './css/map.css',
  './js/bundle.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/maps/campus-map.jpg',
  './assets/vendor/konva.min.js',
  './assets/vendor/lucide.min.js',
  './assets/vendor/idb.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        CORE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Bypass cross-origin, live REST API, SSE streams, and WebSocket paths
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;

  const isNavOrCode =
    req.mode === 'navigate' ||
    /\.(html|css|js|json|webmanifest)$/i.test(url.pathname) ||
    url.pathname === '/';

  if (isNavOrCode) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first with background refresh for static binary assets (.glb, .png, .jpg, .svg, .woff2)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => null);

      return cached || fetchPromise;
    })
  );
});
