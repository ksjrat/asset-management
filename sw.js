const CACHE = 'sej-ledger-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/state.js',
  './js/store.js',
  './js/format.js',
  './js/merge.js',
  './js/ui.js',
  './js/views.js',
  './js/charts.js',
  './js/backup.js',
  './js/csv-import.js',
  './js/sync.js',
  './js/list-editor.js',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).catch(() => caches.match('./index.html'));
    })
  );
});
