import { state } from '../state.js';

export function renderLock() {
  return `
    <div class="lock-screen">
      <div class="lock-icon">🔒</div>
      <h1>앱 잠금</h1>
      <p class="muted">앱 비밀번호를 입력하세요</p>
      <form id="unlock-form" class="auth-form">
        <input type="password" name="pin" placeholder="앱 비밀번호" class="input" required autocomplete="current-password" />
        <button type="submit" class="btn btn-primary btn-block">해제</button>
      </form>
      <button type="button" class="btn btn-ghost btn-block" id="btn-skip-lock" style="margin-top:12px">잠금 건너뛰기</button>
    </div>`;
}

export function bindLock() {
  document.getElementById('unlock-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.locked = false;
    import('./index.js').then((m) => m.renderApp());
  });
  document.getElementById('btn-skip-lock')?.addEventListener('click', () => {
    state.locked = false;
    import('./index.js').then((m) => m.renderApp());
  });
}
