import { state, persist } from '../state.js';
import { hasSafetyBackup, restoreFromSafetyBackup, hasUserFinancialData } from '../store.js';
import { getBudgetStart } from '../budget-engine.js';
import { isSyncEnabled, getSyncStatus, hasCloudPassphraseSession, setCloudPassphraseSession } from '../sync.js';
import { syncManualRefresh, syncEnsureHousehold } from '../sync-service.js';
import { fmtMonth } from '../format.js';
import { openModal, toast, confirmDialog, formField, esc, modalValue, modalForm, copyText } from '../ui.js';
import { showBudgetStartForm } from './modals.js';

export function renderSettings() {
  const a = state.data.auth;
  const s = state.data.settings;
  const start = getBudgetStart(state.data);
  const startLabel = start ? fmtMonth(start.year, start.month) : '미설정';
  const syncOn = isSyncEnabled();
  const syncStatus = getSyncStatus(state.data);
  const familyCode = state.data.auth.householdId || state.data.auth.inviteCode;
  const syncMeta = !syncOn
    ? '로컬만 (docs/SYNC.md)'
    : syncStatus === 'no-code'
      ? '가족 코드 발급 필요'
      : !hasCloudPassphraseSession()
        ? '가족 암호 입력 필요'
        : '암호화 연동 중';
  return `
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

    <div class="settings-group">
      <p class="settings-group-title">배우자</p>
      <div class="settings-row" style="cursor:default">
        <span><strong>연결 상태</strong><span class="settings-row-meta">${a.spouseConnected ? `${esc(a.spouseName)}님과 연결됨` : '연결되지 않음'}</span></span>
      </div>
      ${!a.spouseConnected ? `<button type="button" class="settings-row" id="btn-connect"><span><strong>배우자 연결</strong><span class="settings-row-meta">초대 코드 발급</span></span><span class="settings-chevron">›</span></button>` : ''}
      ${a.spouseConnected ? `<button type="button" class="settings-row" id="btn-disconnect" style="color:var(--danger)">
        <span><strong>연결 해제</strong></span><span class="settings-chevron">›</span>
      </button>` : ''}
    </div>

    <div class="settings-group">
      <p class="settings-group-title">동기화</p>
      <div class="settings-row" style="cursor:default">
        <span><strong>상태</strong><span class="settings-row-meta">${syncMeta}</span></span>
      </div>
      ${familyCode ? `<button type="button" class="settings-row" id="btn-copy-family-code">
        <span><strong>가족 코드</strong><span class="settings-row-meta">${esc(familyCode)}</span></span>
        <span class="settings-chevron">복사</span>
      </button>` : ''}
      ${syncOn ? `<button type="button" class="settings-row" id="btn-cloud-pass">
        <span><strong>가족 암호</strong><span class="settings-row-meta">${hasCloudPassphraseSession() ? '입력됨 (이 기기)' : '미입력'}</span></span>
        <span class="settings-chevron">›</span>
      </button>` : ''}
      ${syncOn ? `<button type="button" class="settings-row" id="btn-sync-refresh">
        <span><strong>지금 동기화</strong><span class="settings-row-meta">다른 기기에서 받아오기</span></span>
        <span class="settings-chevron">›</span>
      </button>` : ''}
      ${hasSafetyBackup() && !hasUserFinancialData(state.data) ? `<button type="button" class="settings-row" id="btn-restore-backup">
        <span><strong>백업에서 복구</strong><span class="settings-row-meta">이 기기에 저장된 최근 백업</span></span>
        <span class="settings-chevron">›</span>
      </button>` : ''}
    </div>

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
      <button type="button" class="btn btn-danger btn-block" id="btn-logout">로그아웃</button>
    </div>`;
}

export function bindSettings() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());

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
  document.getElementById('btn-connect')?.addEventListener('click', async () => {
    const { generateInviteCode } = await import('../store.js');
    if (!state.data.auth.inviteCode) {
      state.data.auth.inviteCode = generateInviteCode();
      state.data.auth.householdId = state.data.auth.inviteCode;
      persist();
      syncEnsureHousehold();
    }
    await openModal({
      title: '배우자 초대',
      body: `<p class="modal-text">가족 코드: <strong class="invite-code">${esc(state.data.auth.inviteCode)}</strong></p>
        <p class="muted">배우자·다른 기기에서 같은 코드를 입력하면 데이터가 연동됩니다.</p>`,
      actions: [{ label: '닫기', primary: true }],
    });
  });
  document.getElementById('btn-disconnect')?.addEventListener('click', async () => {
    if (await confirmDialog('연결 해제', '배우자 연결을 해제할까요?')) {
      state.data.auth.spouseConnected = false;
      state.data.auth.spouseName = '';
      persist(); toast('연결이 해제되었습니다'); rerender();
    }
  });
  document.getElementById('btn-copy-family-code')?.addEventListener('click', () => {
    const code = state.data.auth.householdId || state.data.auth.inviteCode;
    if (code) copyText(code);
  });
  document.getElementById('btn-cloud-pass')?.addEventListener('click', async () => {
    const res = await openModal({
      title: '가족 암호',
      body: `<form id="cloud-pass-form" class="form-stack" autocomplete="off">
        <p class="field-hint">클라우드에 올리는 데이터를 암호화합니다. 배우자·다른 기기에도 <strong>같은 암호</strong>를 입력하세요.</p>
        ${formField('가족 암호', '<input class="input" name="pass" type="password" minlength="6" autocomplete="new-password" required />')}
      </form>`,
      actions: [{ label: '취소', value: null }, { label: '확인', value: 'save', primary: true }],
    });
    if (modalValue(res) !== 'save') return;
    const pass = modalForm(res)?.get('pass')?.toString();
    if (!pass || pass.length < 6) {
      toast('6자 이상 입력하세요', 'error');
      return;
    }
    setCloudPassphraseSession(pass);
    toast('이 기기에서 암호가 적용되었습니다', 'success');
    syncEnsureHousehold();
    rerender();
  });
  document.getElementById('btn-sync-refresh')?.addEventListener('click', async () => {
    if (!hasCloudPassphraseSession()) {
      toast('먼저 설정에서 가족 암호를 입력하세요', 'error');
      return;
    }
    const ok = await syncManualRefresh();
    toast(ok ? '동기화되었습니다' : '동기화할 수 없습니다', ok ? 'success' : 'error');
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
      body: '<div class="policy-box"><p>기기 내 저장만 사용합니다. 외부 전송 없음.</p></div>',
      actions: [{ label: '닫기', primary: true }],
    });
  });
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (await confirmDialog('로그아웃', '로그아웃 하시겠습니까?')) {
      state.data.auth.loggedIn = false;
      state.locked = true;
      persist();
      state.authScreen = 'welcome';
      rerender();
    }
  });
}
