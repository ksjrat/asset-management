import { state, persist } from '../state.js';
import { generateInviteCode, seedDemoData } from '../store.js';
import { formField, toast, esc } from '../ui.js';

export function renderAuth() {
  const s = state.authScreen;
  if (s === 'welcome') {
    return `
      <div class="auth-screen">
        <div class="auth-hero">
          <div class="auth-logo">💑</div>
          <h1>우리 자산</h1>
          <p>신혼부부를 위한<br>공동 자산 관리</p>
        </div>
        <div class="auth-actions">
          <button type="button" class="btn btn-primary btn-block" data-auth="login">로그인</button>
          <button type="button" class="btn btn-ghost btn-block" data-auth="signup">회원가입</button>
        </div>
      </div>`;
  }
  if (s === 'login' || s === 'signup') {
    return `
      <div class="auth-screen">
        <button type="button" class="back-link" data-auth="welcome">← 돌아가기</button>
        <h1>${s === 'login' ? '로그인' : '회원가입'}</h1>
        <form class="auth-form" id="auth-form">
          ${formField('이름', '<input type="text" name="name" class="input" required placeholder="홍길동" />')}
          ${formField('이메일', '<input type="email" name="email" class="input" required placeholder="you@email.com" />')}
          ${formField('비밀번호', '<input type="password" name="password" class="input" required minlength="4" placeholder="4자 이상" />')}
          <button type="submit" class="btn btn-primary btn-block">${s === 'login' ? '로그인' : '가입하기'}</button>
        </form>
      </div>`;
  }
  if (s === 'biometric') {
    return `
      <div class="auth-screen center">
        <div class="auth-icon">🔐</div>
        <h1>생체 인증 설정</h1>
        <p class="muted">Face ID / Touch ID로<br>앱을 더 안전하게 보호하세요</p>
        <div class="auth-actions">
          <button type="button" class="btn btn-primary btn-block" data-auth="bio-yes">등록하기</button>
          <button type="button" class="btn btn-ghost btn-block" data-auth="bio-skip">나중에</button>
        </div>
      </div>`;
  }
  if (s === 'invite') {
    return `
      <div class="auth-screen">
        <h1>배우자 연결</h1>
        <p class="muted">초대 코드를 발급하거나<br>배우자 코드를 입력하세요</p>
        <div class="card">
          <p class="card-label">내 초대 코드</p>
          <p class="invite-code">${esc(state.data.auth.inviteCode || '—')}</p>
          <button type="button" class="btn btn-ghost btn-sm" data-auth="gen-invite">코드 발급 (24시간)</button>
        </div>
        <form class="auth-form" id="accept-invite-form">
          ${formField('배우자 초대 코드', '<input type="text" name="code" class="input" placeholder="ABC123" maxlength="8" style="text-transform:uppercase" />')}
          <button type="submit" class="btn btn-primary btn-block">연결하기</button>
        </form>
        <button type="button" class="btn btn-ghost btn-block" data-auth="invite-skip">혼자 시작하기</button>
      </div>`;
  }
  if (s === 'policy') {
    return `
      <div class="auth-screen">
        <h1>개인정보 처리방침</h1>
        <div class="policy-box">
          <p>본 앱은 입력하신 금융 정보를 기기 내(localStorage)에만 저장합니다. 외부 서버로 전송하지 않으며, 배우자 연결 시 공동 데이터만 상대방과 공유됩니다.</p>
          <p>민감 정보(비상금 등)는 '비공개' 설정으로 배우자에게 숨길 수 있습니다.</p>
          <p class="muted">버전 ${esc(state.data.auth.policyVersion)}</p>
        </div>
        <button type="button" class="btn btn-primary btn-block" data-auth="policy-ok">동의하고 시작</button>
      </div>`;
  }
  return '';
}

export function bindAuth(onFinish) {
  document.querySelectorAll('[data-auth]').forEach((el) => {
    el.addEventListener('click', () => {
      const a = el.dataset.auth;
      if (a === 'login' || a === 'signup') { state.authScreen = a; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'welcome') { state.authScreen = 'welcome'; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'bio-yes') { state.data.auth.biometricEnabled = true; persist(); state.authScreen = 'invite'; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'bio-skip') { state.authScreen = 'invite'; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'gen-invite') {
        state.data.auth.inviteCode = generateInviteCode();
        state.data.auth.inviteExpiresAt = Date.now() + 86400000;
        persist();
        import('./index.js').then((m) => m.renderApp());
        toast('초대 코드가 발급되었습니다');
        return;
      }
      if (a === 'invite-skip') { state.authScreen = 'policy'; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'policy-ok') onFinish();
    });
  });

  document.getElementById('auth-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.data.auth.userName = fd.get('name');
    state.data.auth.userEmail = fd.get('email');
    state.data.auth.loggedIn = true;
    persist();
    state.authScreen = 'biometric';
    import('./index.js').then((m) => m.renderApp());
  });

  document.getElementById('accept-invite-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code')?.toString().toUpperCase();
    if (code && code.length >= 4) {
      state.data.auth.spouseConnected = true;
      state.data.auth.spouseName = '배우자';
      toast('배우자와 연결되었습니다');
      persist();
    }
    state.authScreen = 'policy';
    import('./index.js').then((m) => m.renderApp());
  });
}

export function finishOnboarding() {
  state.data.auth.policyAccepted = true;
  state.data.auth.onboardingDone = true;
  seedDemoData(state.data);
  persist();
  state.locked = false;
  state.authScreen = 'welcome';
  import('./index.js').then((m) => m.renderApp());
  toast('우리 자산에 오신 것을 환영합니다!', 'success');
}
