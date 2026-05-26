const CACHE = 'couple-asset-v39';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './css/apple.css',
  './css/desktop.css',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
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
  './js/views/assets.js',
  './js/views/goals.js',
  './js/app-update.js',
  './js/views/budget.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/modals.js',
  './js/validators.js',
  './js/budget-engine.js',
  './js/icons.js',
  './js/views/setup.js',
  './js/sync.js',
  './js/sync-config.js',
  './js/sync-service.js',
  './js/link-wizard.js',
  './js/sync-privacy.js',
  './js/sync-crypto.js',
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

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
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
