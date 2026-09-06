import { initUI } from './ui.js';
import { renderApp } from './views/index.js';
import { state, leaveStartScreen, persist, persistAuthFlags } from './state.js';
import { load, hasUserFinancialData, getNetWorthDiagnosis } from './store.js';
import { isAppPinConfigured } from './app-lock.js';
import { setupCloudSync } from './sync-service.js';
import { initPwaInstall } from './pwa-install.js';

async function bootstrap() {
  state.data = load();
  if (state.data.auth.atStartScreen && hasUserFinancialData(state.data)) {
    // 연동 실패 후 시작 화면 플래그만 남은 경우 — 데이터는 있으니 앱으로 복구
    leaveStartScreen();
    state.data.auth.onboardingDone = true;
    state.data.auth.loggedIn = true;
    persistAuthFlags();
    persist();
  } else if (state.data.auth.atStartScreen) {
    state.showWelcome = true;
    state.authScreen = 'welcome';
    state.locked = false;
  }
  if (state.data.auth.onboardingDone) {
    state.locked = isAppPinConfigured(state.data) && state.data.settings?.lockOnLaunch !== false;
  } else {
    state.locked = false;
  }
  initUI();
  initPwaInstall();
  renderApp();
  setupCloudSync().then((ok) => {
    if (ok) import('./views/index.js').then((m) => m.renderApp());
  });

  /** 개발·진단: 콘솔에서 getNetWorthDiagnosis(2026, 5) */
  window.getNetWorthDiagnosis = (year, month, ownerFilter = 'all') =>
    getNetWorthDiagnosis(state.data, year, month, ownerFilter);
}

function isLocalDevHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1'
    || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  if (isLocalDevHost()) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          reg.update();
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') reg.update();
          });
        })
        .catch(() => {});

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    });
  }
}

window.addEventListener('error', (e) => {
  const app = document.getElementById('app');
  if (!app || app.querySelector('.auth-screen h1')) return;
  app.innerHTML = `<div class="auth-screen" style="padding:24px">
    <h1>앱을 불러오지 못했습니다</h1>
    <p class="muted">${e.message || '알 수 없는 오류'}<br><br>
    <strong>start-server.bat</strong> 실행 후<br>
    <a href="http://localhost:8080">http://localhost:8080</a> 로 접속해 보세요.</p></div>`;
});

bootstrap();
