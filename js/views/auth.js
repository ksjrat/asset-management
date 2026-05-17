import { state, persist } from '../state.js';
import { recordPolicyConsent } from '../store.js';
import { openLinkWizard } from '../link-wizard.js';
import { esc } from '../ui.js';

const ONBOARD_STEPS = ['welcome', 'biometric', 'invite', 'policy'];
function stepBar(screen) {
  const idx = ONBOARD_STEPS.indexOf(screen);
  if (idx < 0) return '';
  const pct = Math.round(((idx + 1) / ONBOARD_STEPS.length) * 100);
  return `<div class="step-bar" aria-hidden="true"><div class="step-fill" style="width:${pct}%"></div></div>`;
}

export function renderAuth() {
  const s = state.authScreen;
  if (s === 'welcome') {
    return `
      <div class="auth-screen">
        <div class="auth-hero">
          <div class="auth-logo">💑</div>
          <h1>우리 자산</h1>
          <p>신혼부부를 위한<br>공동 자산 관리</p>
          <ul class="auth-features">
            <li>순자산·예산 한눈에</li>
            <li>함께 달성하는 재정 목표</li>
            <li>기기 안에서 안전하게</li>
          </ul>
        </div>
        <div class="auth-actions">
          <button type="button" class="btn btn-primary btn-block" data-auth="start">시작하기</button>
        </div>
        <p class="muted auth-footnote">PC·폰·배우자 연동은 설정 → <strong>연동 도우미</strong>에서 한 번에 할 수 있습니다.</p>
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
        ${stepBar(s)}
        <h1>배우자 · 기기 연동</h1>
        <p class="muted">PC·폰·배우자가 같은 데이터를 보려면<br>가족 코드와 가족 암호를 맞춥니다.</p>
        <button type="button" class="btn btn-primary btn-block" data-auth="link-wizard">연동 도우미로 설정</button>
        <button type="button" class="btn btn-ghost btn-block" data-auth="invite-skip">나중에 · 혼자 시작</button>
      </div>`;
  }
  if (s === 'policy') {
    return `
      <div class="auth-screen">
        <h1>개인정보 처리방침</h1>
        <div class="policy-box">
          <p>금융 정보는 기기에도 저장됩니다. 클라우드 동기화를 켜면 가족 코드로 PC·폰·배우자 기기가 같은 데이터를 공유합니다.</p>
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
      if (a === 'start') {
        state.data.auth.loggedIn = true;
        state.showWelcome = false;
        persist();
        if (state.data.auth.onboardingDone) {
          import('./index.js').then((m) => m.renderApp());
          return;
        }
        state.authScreen = 'biometric';
        import('./index.js').then((m) => m.renderApp());
        return;
      }
      if (a === 'welcome') { state.authScreen = 'welcome'; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'bio-yes') { state.data.auth.biometricEnabled = true; persist(); state.authScreen = 'invite'; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'bio-skip') { state.authScreen = 'invite'; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'link-wizard') {
        openLinkWizard().then(() => {
          state.authScreen = 'policy';
          persist();
          import('./index.js').then((m) => m.renderApp());
        });
        return;
      }
      if (a === 'invite-skip') { state.authScreen = 'policy'; import('./index.js').then((m) => m.renderApp()); return; }
      if (a === 'policy-ok') onFinish();
    });
  });

}

export function finishOnboarding() {
  state.data.auth.policyAccepted = true;
  state.data.auth.onboardingDone = true;
  recordPolicyConsent(state.data);
  const hasData = state.data.assets?.items?.length || state.data.goals?.length
    || state.data.transactions?.length;
  if (!hasData && !state.data.budget.categories?.length) {
    state.data.budget.categories = [];
    state.data.budget.monthlyPlan = {};
    state.data.budget.actuals = {};
    state.data.budget.setupDone = false;
    state.data.budget.defaultRecordDay = 25;
    state.data.budget.startYear = null;
    state.data.budget.startMonth = null;
    state.setupStep = 1;
  }
  persist();
  state.locked = false;
  state.showWelcome = false;
  state.authScreen = 'welcome';
  import('./index.js').then((m) => m.renderApp());
  toast('예산 항목을 설정해 주세요', 'success');
}
