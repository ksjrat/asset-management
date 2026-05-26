import { state, persist } from '../state.js';
import { recordPolicyConsent, HOUSEHOLD_CODE_LENGTH } from '../store.js';
import { connectJoinHousehold } from '../link-wizard.js';
import { isSyncEnabled } from '../sync.js';
import { esc, formField, toast } from '../ui.js';

function policySummaryHtml() {
  return `
    <details class="policy-details">
      <summary>개인정보 처리방침</summary>
      <div class="policy-box policy-box--inline">
        <p>금융 정보는 기기에도 저장됩니다. 클라우드 동기화를 켜면 가족 코드로 PC·폰·배우자 기기가 같은 데이터를 공유합니다.</p>
        <p>민감 정보(비상금 등)는 '비공개' 설정으로 배우자에게 숨길 수 있습니다.</p>
        <p class="muted">버전 ${esc(state.data.auth.policyVersion)}</p>
      </div>
    </details>`;
}

function welcomeLinkFieldsHtml() {
  const syncOn = isSyncEnabled();
  const passFields = syncOn ? `
      ${formField('가족 암호', '<input class="input" name="pass" type="password" autocomplete="current-password" />')}
      <p class="field-hint muted">배우자·다른 기기와 <strong>같은 암호</strong>를 씁니다.</p>`
    : '<p class="field-hint muted">클라우드가 꺼져 있으면 코드만 맞춥니다.</p>';
  return `
    <form id="auth-welcome-form" class="auth-form auth-link-block">
      <p class="auth-link-label">이미 가족 코드가 있어요</p>
      ${formField('가족 코드', `<input class="input" name="code" type="text" inputmode="text" autocomplete="off"
        placeholder="${HOUSEHOLD_CODE_LENGTH}자리" maxlength="12" style="text-transform:uppercase" required />`)}
      ${passFields}
    </form>`;
}

export function renderAuth() {
  const s = state.authScreen;
  if (s === 'welcome') {
    const done = state.data.auth.onboardingDone;
    if (done) {
      return `
        <div class="auth-screen">
          <div class="auth-hero auth-hero--compact">
            <div class="auth-logo">💑</div>
            <h1>우리 자산</h1>
            <p class="muted">다시 오신 것을 환영해요</p>
          </div>
          <div class="auth-actions">
            <button type="button" class="btn btn-primary btn-block" data-auth="resume">앱으로 들어가기</button>
          </div>
        </div>`;
    }
    return `
      <div class="auth-screen">
        <div class="auth-hero auth-hero--compact">
          <div class="auth-logo">💑</div>
          <h1>우리 자산</h1>
          <p class="muted">순자산·예산·목표를 함께 관리해요</p>
        </div>
        ${welcomeLinkFieldsHtml()}
        <div class="auth-actions">
          <button type="button" class="btn btn-primary btn-block" data-auth="link-start">연동하고 시작</button>
          <div class="auth-divider"><span>또는</span></div>
          <button type="button" class="btn btn-ghost btn-block" data-auth="solo-start">혼자 시작 · 나중에 연동</button>
        </div>
        ${policySummaryHtml()}
        <label class="policy-agree">
          <input type="checkbox" id="auth-policy-agree" />
          <span>위 방침에 동의합니다</span>
        </label>
      </div>`;
  }
  return '';
}

function readWelcomeForm() {
  const form = document.getElementById('auth-welcome-form');
  if (!form) return {};
  const fd = new FormData(form);
  return {
    code: fd.get('code')?.toString() || '',
    pass: fd.get('pass')?.toString() || '',
  };
}

function requirePolicyAgree() {
  if (document.getElementById('auth-policy-agree')?.checked) return true;
  toast('개인정보 처리방침에 동의해 주세요', 'info');
  return false;
}

export function bindAuth(onFinish) {
  document.querySelectorAll('[data-auth]').forEach((el) => {
    el.addEventListener('click', async () => {
      const a = el.dataset.auth;
      if (a === 'resume') {
        state.data.auth.loggedIn = true;
        state.showWelcome = false;
        persist();
        import('./index.js').then((m) => m.renderApp());
        return;
      }
      if (a === 'solo-start') {
        if (!requirePolicyAgree()) return;
        state.data.auth.loggedIn = true;
        state.showWelcome = false;
        persist();
        onFinish();
        return;
      }
      if (a === 'link-start') {
        if (!requirePolicyAgree()) return;
        const { code, pass } = readWelcomeForm();
        if (!code.trim()) {
          toast('가족 코드를 입력해 주세요', 'error');
          document.querySelector('#auth-welcome-form [name="code"]')?.focus();
          return;
        }
        state.data.auth.loggedIn = true;
        state.showWelcome = false;
        persist();
        const result = await connectJoinHousehold({ code, pass });
        if (!result.ok) {
          toast(result.message || '연동하지 못했습니다', 'error');
          return;
        }
        toast('연동되었습니다', 'success');
        onFinish();
      }
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
  if (!state.data.budget?.setupDone) {
    toast('예산 항목을 설정해 주세요', 'success');
  }
}
