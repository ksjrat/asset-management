import { state } from '../state.js';
import { verifyAppPin } from '../app-lock.js';
import { toast } from '../ui.js';

export function renderLock() {
  return `
    <div class="lock-screen">
      <div class="lock-icon">🔒</div>
      <h1>앱 잠금</h1>
      <p class="muted">앱 비밀번호를 입력하세요</p>
      <form id="unlock-form" class="auth-form">
        <input type="password" name="pin" placeholder="앱 비밀번호" class="input" required
          minlength="4" autocomplete="current-password" inputmode="numeric" />
        <button type="submit" class="btn btn-primary btn-block">해제</button>
      </form>
    </div>`;
}

export function bindLock() {
  const form = document.getElementById('unlock-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = new FormData(form).get('pin')?.toString() ?? '';
    const ok = await verifyAppPin(state.data, pin);
    if (!ok) {
      toast('비밀번호가 올바르지 않습니다', 'error');
      form.reset();
      form.querySelector('[name="pin"]')?.focus();
      return;
    }
    state.locked = false;
    import('./index.js').then((m) => m.renderApp());
  });
}
