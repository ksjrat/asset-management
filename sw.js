const CACHE = 'couple-asset-v74';
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
  './js/pwa-install.js',
  './js/views/budget.js',
  './js/views/memos.js',
  './js/views/settings.js',
  './js/views/modals.js',
  './js/validators.js',
  './js/budget-engine.js',
  './js/budget-data.js',
  './js/snapshot-engine.js',
  './js/savings-sync.js',
  './js/loan-sync.js',
  './js/loan-amort.js',
  './js/app-lock.js',
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

function isMutableAppRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return true;
  return /\.(js|css|html)$/.test(url.pathname);
}

/** HTML·JS·CSS는 네트워크 우선 — push 배포 후 최신 코드를 빨리 받음 */
function networkFirst(request) {
  return fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  }).catch(() => caches.match(request));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (isMutableAppRequest(e.request)) {
    e.respondWith(networkFirst(e.request));
    return;
  }
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
