import { state, persist } from '../state.js';
import { hasSafetyBackup, restoreFromSafetyBackup, hasUserFinancialData } from '../store.js';
import { getBudgetStart } from '../budget-engine.js';
import { isSyncEnabled } from '../sync.js';
import { fmtMonth } from '../format.js';
import { openModal, toast, confirmDialog, formField, esc, modalValue, modalForm } from '../ui.js';
import { showBudgetStartForm } from './modals.js';
import {
  getLinkSteps, isLinkComplete, openLinkWizard, runSyncWithFeedback,
} from '../link-wizard.js';

function linkStatusLabel() {
  if (isLinkComplete()) return '연동 완료';
  const steps = getLinkSteps().filter((s) => s.required);
  const done = steps.filter((s) => s.done).length;
  return `${done}/${steps.length}단계`;
}

export function renderSettings() {
  const a = state.data.auth;
  const s = state.data.settings;
  const start = getBudgetStart(state.data);
  const startLabel = start ? fmtMonth(start.year, start.month) : '미설정';
  const syncOn = isSyncEnabled();
  const linkDone = isLinkComplete();

  return `
    <div class="settings-group settings-group--highlight">
      <p class="settings-group-title">기기·배우자 연동</p>
      <button type="button" class="settings-row" id="btn-link-wizard">
        <span><strong>연동 도우미</strong><span class="settings-row-meta">${linkDone ? '완료 · 다시 설정' : linkStatusLabel()}</span></span>
        <span class="settings-chevron">›</span>
      </button>
      <ul class="link-checklist link-checklist--compact">
        ${getLinkSteps().filter((st) => st.required).map((st) => `
          <li class="link-check-item ${st.done ? 'done' : ''}">
            <span class="link-check-mark">${st.done ? '✓' : '○'}</span>
            <span>${esc(st.label)}</span>
          </li>`).join('')}
      </ul>
      ${syncOn && linkDone ? `<button type="button" class="settings-row" id="btn-sync-refresh">
        <span><strong>지금 동기화</strong><span class="settings-row-meta">다른 기기와 다시 맞추기</span></span>
        <span class="settings-chevron">›</span>
      </button>` : ''}
      ${a.spouseConnected ? `<button type="button" class="settings-row" id="btn-disconnect" style="color:var(--danger)">
        <span><strong>배우자 연결 해제</strong></span><span class="settings-chevron">›</span>
      </button>` : ''}
    </div>

    <div class="settings-group">
      <p class="settings-group-title">보안</p>
      <label class="toggle-row"><span>생체 인증</span>
        <input type="checkbox" id="toggle-bio" ${a.biometricEnabled ? 'checked' : ''} /></label>
      <label class="toggle-row"><span>앱 시작 시 잠금</span>
        <input type="checkbox" id="toggle-lock" ${s.lockOnLaunch !== false ? 'checked' : ''} /></label>
      <button type="button" class="settings-row" id="btn-password">
        <span><strong>앱 비밀번호</strong><span class="settings-row-meta">${a.appPasswordSet ? '설정됨' : '미설정'}</span></span>
        <span class="settings-chevron">›</span>
      </button>
    </div>

    ${hasSafetyBackup() && !hasUserFinancialData(state.data) ? `
    <div class="settings-group">
      <button type="button" class="settings-row" id="btn-restore-backup">
        <span><strong>백업에서 복구</strong><span class="settings-row-meta">이 기기에 저장된 최근 백업</span></span>
        <span class="settings-chevron">›</span>
      </button>
    </div>` : ''}

    <div class="settings-group">
      <p class="settings-group-title">예산</p>
      <button type="button" class="settings-row" id="btn-budget-start">
        <span><strong>가계부 시작 월</strong><span class="settings-row-meta">${startLabel}</span></span>
        <span class="settings-chevron">›</span>
      </button>
      <button type="button" class="settings-row" id="btn-budget-setup">
        <span><strong>예산 설정 다시하기</strong><span class="settings-row-meta">항목·월간예산·시작월·정산일</span></span>
        <span class="settings-chevron">›</span>
      </button>
    </div>

    <div class="settings-group">
      <p class="settings-group-title">정책</p>
      <button type="button" class="settings-row" id="btn-policy">
        <span><strong>개인정보 처리방침</strong><span class="settings-row-meta">동의 ${a.policyAccepted ? '완료' : '미완료'} · v${esc(state.data.auth.policyVersion)}</span></span>
        <span class="settings-chevron">›</span>
      </button>
    </div>

    <div class="settings-group">
      <button type="button" class="btn btn-danger btn-block" id="btn-logout">시작 화면으로</button>
    </div>`;
}

export function bindSettings() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());

  document.getElementById('btn-link-wizard')?.addEventListener('click', () => openLinkWizard());
  document.getElementById('btn-sync-refresh')?.addEventListener('click', async () => {
    const result = await runSyncWithFeedback();
    if (result.ok) rerender();
  });

  document.getElementById('toggle-bio')?.addEventListener('change', (e) => {
    state.data.auth.biometricEnabled = e.target.checked; persist();
  });
  document.getElementById('toggle-lock')?.addEventListener('change', (e) => {
    state.data.settings.lockOnLaunch = e.target.checked; persist();
  });
  document.getElementById('btn-password')?.addEventListener('click', async () => {
    const res = await openModal({
      title: '앱 비밀번호',
      body: formField('비밀번호', '<input class="input" name="pin" type="password" minlength="4" />'),
      actions: [{ label: '취소', value: null }, { label: '설정', value: 'save', primary: true }],
    });
    if (modalValue(res) === 'save') { state.data.auth.appPasswordSet = true; persist(); toast('설정되었습니다'); }
  });
  document.getElementById('btn-disconnect')?.addEventListener('click', async () => {
    if (await confirmDialog('연결 해제', '배우자 연결을 해제할까요?')) {
      state.data.auth.spouseConnected = false;
      state.data.auth.spouseName = '';
      persist(); toast('연결이 해제되었습니다'); rerender();
    }
  });
  document.getElementById('btn-restore-backup')?.addEventListener('click', async () => {
    if (!(await confirmDialog('백업 복구', '이 기기에 저장된 최근 백업으로 되돌릴까요?'))) return;
    const backup = restoreFromSafetyBackup();
    if (!backup) {
      toast('복구할 백업이 없습니다', 'error');
      return;
    }
    backup.auth.loggedIn = state.data.auth.loggedIn;
    backup.auth.userName = state.data.auth.userName || backup.auth.userName;
    backup.auth.userEmail = state.data.auth.userEmail || backup.auth.userEmail;
    backup.auth.onboardingDone = true;
    state.data = backup;
    persist();
    toast('백업에서 복구했습니다', 'success');
    rerender();
  });
  document.getElementById('btn-budget-start')?.addEventListener('click', () => {
    showBudgetStartForm(rerender);
  });
  document.getElementById('btn-budget-setup')?.addEventListener('click', () => {
    state.data.budget.setupDone = false;
    state.setupStep = 1;
    rerender();
  });
  document.getElementById('btn-policy')?.addEventListener('click', () => {
    openModal({
      title: '개인정보 처리방침',
      body: '<div class="policy-box"><p>기기 내 저장됩니다. 클라우드 연동 시 가족 코드·암호로 암호화해 공유합니다.</p></div>',
      actions: [{ label: '닫기', primary: true }],
    });
  });
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (await confirmDialog('시작 화면', '시작 화면으로 이동할까요? 데이터는 이 기기에 남습니다.')) {
      state.showWelcome = true;
      state.locked = false;
      state.authScreen = 'welcome';
      persist();
      rerender();
    }
  });
}
