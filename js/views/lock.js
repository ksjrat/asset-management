import { state } from '../state.js';
import { toast } from '../ui.js';

export function renderLock() {
  const bio = state.data.auth.biometricEnabled;
  return `
    <div class="lock-screen">
      <div class="lock-icon">🔒</div>
      <h1>앱 잠금</h1>
      <p class="muted">${bio ? '생체 인증으로 잠금 해제' : '비밀번호를 입력하세요'}</p>
      ${bio
        ? '<button type="button" class="btn btn-primary btn-block" id="btn-unlock-bio">Face ID / Touch ID</button>'
        : `<form id="unlock-form" class="auth-form">
            <input type="password" name="pin" placeholder="앱 비밀번호" class="input" required />
            <button type="submit" class="btn btn-primary btn-block">해제</button>
          </form>`}
    </div>`;
}

export function bindLock() {
  document.getElementById('btn-unlock-bio')?.addEventListener('click', () => {
    toast('생체 인증 성공 (시뮬레이션)', 'success');
    state.locked = false;
    import('./index.js').then((m) => m.renderApp());
  });
  document.getElementById('unlock-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.locked = false;
    import('./index.js').then((m) => m.renderApp());
  });
}
