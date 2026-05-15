import { state, persist } from '../state.js';
import { openModal, toast, confirmDialog, formField, esc, modalValue, modalForm } from '../ui.js';

export function renderSettings() {
  const a = state.data.auth;
  const s = state.data.settings;
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
      <p class="settings-group-title">예산</p>
      <button type="button" class="settings-row" id="btn-budget-setup">
        <span><strong>예산 설정 다시하기</strong><span class="settings-row-meta">항목·월간예산·정산일</span></span>
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
      persist();
    }
    await openModal({
      title: '배우자 초대',
      body: `<p class="modal-text">초대 코드: <strong class="invite-code">${esc(state.data.auth.inviteCode)}</strong></p>
        <p class="muted">배우자에게 코드를 공유하세요. (24시간 유효)</p>`,
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
