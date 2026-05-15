import { state, persist } from '../state.js';
import { seedDemoData } from '../store.js';
import { openModal, toast, confirmDialog, formField, esc } from '../ui.js';

export function renderSettings() {
  const a = state.data.auth;
  const s = state.data.settings;
  return `
    <section class="section">
      <h2>앱 잠금</h2>
      <label class="toggle-row"><span>생체 인증</span>
        <input type="checkbox" id="toggle-bio" ${a.biometricEnabled ? 'checked' : ''} /></label>
      <label class="toggle-row"><span>앱 시작 시 잠금</span>
        <input type="checkbox" id="toggle-lock" ${s.lockOnLaunch !== false ? 'checked' : ''} /></label>
      <button type="button" class="btn btn-ghost btn-block" id="btn-password">앱 비밀번호 설정</button>
    </section>
    <section class="section">
      <h2>배우자 연결</h2>
      <p class="muted">${a.spouseConnected ? `${esc(a.spouseName)}님과 연결됨` : '연결되지 않음'}</p>
      ${!a.spouseConnected ? '<button type="button" class="btn btn-ghost btn-block" id="btn-connect">배우자 연결</button>' : ''}
      <button type="button" class="btn btn-danger btn-block" id="btn-disconnect">연결 해제</button>
    </section>
    <section class="section">
      <h2>과소비 알림</h2>
      <p class="muted">조용한 시간 ${esc(s.alertQuietStart)} ~ ${esc(s.alertQuietEnd)}</p>
      <button type="button" class="btn btn-ghost btn-block" id="btn-alert">알림 설정</button>
    </section>
    <section class="section">
      <h2>정책</h2>
      <button type="button" class="btn btn-ghost btn-block" id="btn-policy">개인정보 처리방침</button>
    </section>
    <section class="section">
      <button type="button" class="btn btn-ghost btn-block" id="btn-demo">데모 데이터 불러오기</button>
      <button type="button" class="btn btn-danger btn-block" id="btn-logout">로그아웃</button>
    </section>`;
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
    if (res === 'save') { state.data.auth.appPasswordSet = true; persist(); toast('설정되었습니다'); }
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
  document.getElementById('btn-alert')?.addEventListener('click', async () => {
    const s = state.data.settings;
    const res = await openModal({
      title: '과소비 알림',
      body: `<form id="alert-form" class="form-stack">
        ${formField('조용한 시간 시작', `<input class="input" name="start" type="time" value="${s.alertQuietStart}" />`)}
        ${formField('종료', `<input class="input" name="end" type="time" value="${s.alertQuietEnd}" />`)}
        <p class="field-hint">카테고리 80%/100% 도달 시 알림 (시뮬레이션)</p>
      </form>`,
      actions: [{ label: '저장', value: 'save', primary: true }],
    });
    if (res === 'save') {
      const fd = new FormData(document.getElementById('alert-form'));
      s.alertQuietStart = fd.get('start');
      s.alertQuietEnd = fd.get('end');
      persist(); toast('저장되었습니다');
    }
  });
  document.getElementById('btn-policy')?.addEventListener('click', () => {
    openModal({
      title: '개인정보 처리방침',
      body: '<div class="policy-box"><p>기기 내 저장만 사용합니다. 외부 전송 없음.</p></div>',
      actions: [{ label: '닫기', primary: true }],
    });
  });
  document.getElementById('btn-demo')?.addEventListener('click', () => {
    seedDemoData(state.data); persist();
    toast('데모 데이터가 로드되었습니다', 'success'); rerender();
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
