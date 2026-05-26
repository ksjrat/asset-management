/** 앱 최신 버전 불러오기 (캐시·서비스 워커 정리 후 새로고침) */

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

/** 캐시 삭제 → SW 갱신 → 페이지 새로고침 */
export async function applyAppUpdate() {
  await clearAppCaches();

  if ('serviceWorker' in navigator && !isLocalDevHost()) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          await new Promise((resolve) => {
            const t = setTimeout(resolve, 2500);
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              clearTimeout(t);
              resolve();
            }, { once: true });
          });
        }
      }
    } catch { /* reload anyway */ }
  }

  location.reload();
}
