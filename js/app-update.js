/** 앱 최신 버전 불러오기 (캐시·서비스 워커 정리 후 새로고침) */

import { KEY, SAFETY_KEY } from './store.js';

function isLocalDevHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1'
    || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

async function clearAppCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
}

/** 서버에 새 버전이 있는지 확인 (서비스 워커 대기 중) */
export async function checkAppUpdateAvailable() {
  if (isLocalDevHost() || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.update();
    return !!reg.waiting;
  } catch {
    return false;
  }
}

/** localStorage는 건드리지 않고, 새로고침 전 안전 백업만 갱신 */
function backupLocalDataBeforeReload() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) localStorage.setItem(SAFETY_KEY, raw);
  } catch { /* quota */ }
}

/** 설치 중인 SW가 waiting 상태가 될 때까지 대기 (네트워크 다운로드) */
function waitForWaitingWorker(reg, maxMs = 6000) {
  if (reg.waiting) return Promise.resolve();
  const worker = reg.installing;
  if (!worker) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'redundant') done();
    });
  });
}

async function activateLatestServiceWorker(reg) {
  if (!reg.waiting) await reg.update();
  if (!reg.waiting) await waitForWaitingWorker(reg);
  if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** 캐시 삭제·SW 갱신 병렬 처리 후 즉시 새로고침 (controllerchange 대기 없음) */
export async function applyAppUpdate() {
  backupLocalDataBeforeReload();

  const tasks = [clearAppCaches()];
  if ('serviceWorker' in navigator && !isLocalDevHost()) {
    tasks.push(
      navigator.serviceWorker.getRegistration()
        .then((reg) => (reg ? activateLatestServiceWorker(reg) : undefined))
        .catch(() => {}),
    );
  }
  await Promise.all(tasks);
  location.reload();
}
