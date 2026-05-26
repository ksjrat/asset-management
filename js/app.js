import { initUI } from './ui.js';
import { renderApp } from './views/index.js';
import { state } from './state.js';
import { load } from './store.js';
import { setupCloudSync } from './sync-service.js';
import { initPwaInstall } from './pwa-install.js';

async function bootstrap() {
  state.data = load();
  if (state.data.auth.atStartScreen) {
    state.showWelcome = true;
    state.authScreen = 'welcome';
    state.locked = false;
  }
  if (state.data.auth.onboardingDone) {
    state.locked = state.data.auth.appPasswordSet && state.data.settings?.lockOnLaunch !== false;
  } else {
    state.locked = false;
  }
  initUI();
  initPwaInstall();
  renderApp();
  setupCloudSync().then((ok) => {
    if (ok) import('./views/index.js').then((m) => m.renderApp());
  });
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
      navigator.serviceWorker.register('./sw.js').catch(() => {});
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
