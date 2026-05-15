const CACHE = 'couple-asset-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json',
  './icons/icon.svg',
  './js/app.js',
  './js/merge.js',
  './js/format.js',
  './js/store.js',
  './js/state.js',
  './js/ui.js',
  './js/charts.js',
  './js/views/index.js',
  './js/views/auth.js',
  './js/views/lock.js',
  './js/views/dashboard.js',
  './js/views/goals.js',
  './js/views/budget.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/modals.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => cached)
    )
  );
});
