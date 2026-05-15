import { initUI } from './ui.js';
import { renderApp } from './views/index.js';
import { state } from './state.js';
import { load } from './store.js';

function bootstrap() {
  state.data = load();
  if (state.data.auth.loggedIn && state.data.auth.onboardingDone) {
    state.locked = state.data.auth.biometricEnabled && state.data.settings?.lockOnLaunch !== false;
  } else {
    state.locked = false;
  }
  initUI();
  renderApp();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

bootstrap();
