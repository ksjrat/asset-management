import { state, persist } from './state.js';
import { generateInviteCode, HOUSEHOLD_CODE_LENGTH } from './store.js';
import {
  isSyncEnabled, hasCloudPassphraseSession, setCloudPassphraseSession, joinHousehold,
} from './sync.js';
import { syncEnsureHousehold, syncJoinHousehold, syncManualRefresh, ensureSyncReady } from './sync-service.js';
import { openModal, toast, esc, copyText, formField, modalValue, modalForm } from './ui.js';

const DISMISS_KEY = 'link-wizard-dismissed';
const HOUSEHOLD_PASS_MIN = 4;

function validateHouseholdPassForm(form) {
  if (!form) return '입력 내용을 확인해 주세요.';
  const p1 = (form.pass ?? '').toString();
  const p2 = (form.pass2 ?? '').toString();
  if (!p1 || p1.length < HOUSEHOLD_PASS_MIN) {
    return `가족 암호는 ${HOUSEHOLD_PASS_MIN}자 이상이어야 합니다.`;
  }
  if (p1 !== p2) return '암호가 서로 다릅니다. 다시 입력해 주세요.';
  return null;
}

function isLocalDevHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

function cloudOffHint() {
  if (isSyncEnabled()) return '연결됨';
  return isLocalDevHost()
    ? '미설정 (js/sync-config.js)'
    : '미설정 (FIREBASE_CONFIG 시크릿)';
}

function cloudOffCalloutHtml() {
  if (isLocalDevHost()) {
    return `<div class="link-callout">
          <p><strong>로컬에서는 Firebase 설정 파일이 필요합니다.</strong></p>
          <p class="muted">프로젝트 폴더에서 <code>setup-sync-local.bat</code> 실행 후, <code>js/sync-config.js</code>에 Firebase 값을 넣고 서버를 다시 시작하세요. 자세한 내용은 docs/SYNC.md 「로컬 개발」을 참고하세요.</p>
          <p class="muted">배포 사이트(<code>github.io</code>)와 동기화하려면 <strong>같은 Firebase 프로젝트</strong> 설정을 쓰면 됩니다.</p>
          <p class="muted">설정 전까지는 가족 코드만 발급·공유할 수 있고, 기기 간 자동 동기화는 되지 않습니다.</p>
        </div>`;
  }
  return `<div class="link-callout">
          <p><strong>클라우드가 아직 이 주소에 없습니다.</strong></p>
          <p class="muted">GitHub Pages를 쓰는 경우, 저장소 시크릿 <code>FIREBASE_CONFIG</code>가 필요합니다. docs/SYNC.md 참고.</p>
          <p class="muted">그 전까지는 가족 코드만 발급·공유할 수 있고, 기기 간 자동 동기화는 되지 않습니다.</p>
        </div>`;
}

export function getLinkSteps() {
  const syncOn = isSyncEnabled();
  const code = state.data.auth.householdId || state.data.auth.inviteCode;
  const hasPass = hasCloudPassphraseSession();
  return [
    {
      id: 'cloud',
      label: '클라우드',
      hint: cloudOffHint(),
      done: syncOn,
      required: syncOn,
    },
    {
      id: 'code',
      label: '가족 코드',
      hint: code ? code : '발급 또는 입력',
      done: !!code,
      required: true,
    },
    {
      id: 'pass',
      label: '가족 암호',
      hint: hasPass ? '이 기기에 입력됨' : `${HOUSEHOLD_PASS_MIN}자 이상, 모든 기기 동일`,
      done: hasPass,
      required: syncOn,
    },
    {
      id: 'sync',
      label: '데이터 맞추기',
      hint: '다른 기기와 한 번 동기화',
      done: false,
      required: syncOn && !!code && hasPass,
    },
  ];
}

export function isLinkComplete() {
  const syncOn = isSyncEnabled();
  const code = !!(state.data.auth.householdId || state.data.auth.inviteCode);
  if (!syncOn) return code;
  return code && hasCloudPassphraseSession();
}

export function needsLinkAttention() {
  if (localStorage.getItem(DISMISS_KEY)) return false;
  return !isLinkComplete();
}

export function dismissLinkAttention() {
  localStorage.setItem(DISMISS_KEY, '1');
}

function checklistHtml() {
  const steps = getLinkSteps();
  return `<ul class="link-checklist">
    ${steps.map((s) => `
      <li class="link-check-item ${s.done ? 'done' : ''}">
        <span class="link-check-mark" aria-hidden="true">${s.done ? '✓' : '○'}</span>
        <span class="link-check-body">
          <strong>${esc(s.label)}</strong>
          <span class="muted">${esc(s.hint)}</span>
        </span>
      </li>`).join('')}
  </ul>`;
}

function shareMessage(code) {
  const url = location.origin + location.pathname;
  return `우리 자산 앱 연동\n주소: ${url}\n가족 코드: ${code}\n(앱 설정 → 기기 연동에서 같은 가족 암호도 입력해 주세요)`;
}

export async function runSyncWithFeedback() {
  const result = await syncManualRefresh();
  const msg = {
    ok: '다른 기기 데이터를 받아왔습니다',
    uploaded: '클라우드에 이 기기 데이터를 올렸습니다',
    'local-only': '동기화했습니다',
    off: '클라우드가 꺼져 있습니다',
    'no-code': '가족 코드가 없습니다',
    'no-pass': '가족 암호를 입력하세요',
    'bad-pass': '가족 암호가 맞지 않습니다',
    error: '네트워크 오류로 동기화하지 못했습니다',
  };
  const key = result.ok ? (result.reason || 'ok') : (result.reason || 'error');
  toast(msg[key] || '동기화할 수 없습니다', result.ok ? 'success' : 'error');
  return result;
}

async function ensureCode() {
  if (!state.data.auth.inviteCode) {
    state.data.auth.inviteCode = generateInviteCode();
    state.data.auth.householdId = state.data.auth.inviteCode;
    state.data.auth.inviteExpiresAt = Date.now() + 86400000 * 365;
    persist();
    await syncEnsureHousehold();
  }
  return state.data.auth.householdId || state.data.auth.inviteCode;
}

async function applyJoinCode(code) {
  const upper = code.trim().toUpperCase();
  if (!upper || upper.length < HOUSEHOLD_CODE_LENGTH) {
    toast(`${HOUSEHOLD_CODE_LENGTH}자리 가족 코드를 입력하세요`, 'error');
    return false;
  }
  const own = state.data.auth.inviteCode;
  if (own && upper === own) {
    state.data.auth.householdId = upper;
    state.data.auth.spouseConnected = true;
    state.data.auth.spouseName = state.data.auth.spouseName || '배우자';
    persist();
    await syncEnsureHousehold();
    return true;
  }
  joinHousehold(state.data, upper);
  state.data.auth.spouseConnected = true;
  state.data.auth.spouseName = '배우자';
  persist();
  if (isSyncEnabled()) await syncJoinHousehold(upper);
  return true;
}

async function savePassphrase(pass) {
  if (!pass || pass.length < HOUSEHOLD_PASS_MIN) return false;
  setCloudPassphraseSession(pass);
  await syncEnsureHousehold();
  return true;
}

export async function openLinkWizard() {
  await ensureSyncReady();

  let role = null;

  for (;;) {
    const syncOn = isSyncEnabled();
    const code = state.data.auth.householdId || state.data.auth.inviteCode;

    const intro = await openModal({
      title: '기기·배우자 연동',
      body: `
        <p class="modal-text">PC·폰·배우자가 <strong>같은 데이터</strong>를 보려면 아래를 순서대로 맞춥니다.</p>
        ${checklistHtml()}
        ${!syncOn ? cloudOffCalloutHtml() : ''}
      `,
      actions: [
        { label: '나중에', value: 'later' },
        { label: '시작하기', value: 'start', primary: true },
      ],
    });
    if (modalValue(intro) !== 'start') {
      dismissLinkAttention();
      return;
    }

    if (!role) {
      const pick = await openModal({
        title: '이 기기 역할',
        body: `<p class="modal-text">어느 쪽에 가깝나요?</p>
          <div class="link-role-grid">
            <p class="muted"><strong>처음·데이터 있는 쪽</strong><br>가족 코드를 만들어 배우자·다른 기기에 알려 줍니다.</p>
            <p class="muted"><strong>배우자·다른 기기</strong><br>받은 가족 코드를 입력합니다.</p>
          </div>`,
        actions: [
          { label: '코드 발급 (처음)', value: 'primary' },
          { label: '코드 입력 (참여)', value: 'join', primary: true },
        ],
      });
      const v = modalValue(pick);
      if (v === 'primary') role = 'primary';
      else if (v === 'join') role = 'join';
      else continue;
    }

    if (role === 'primary') {
      const familyCode = await ensureCode();
      const share = shareMessage(familyCode);
      const codeStep = await openModal({
        title: '1. 가족 코드 공유',
        body: `
          <p class="field-hint">배우자·다른 기기에서 <strong>같은 주소</strong>로 앱을 연 뒤, 아래 코드를 입력합니다.</p>
          <p class="invite-code">${esc(familyCode)}</p>
          <p class="muted" style="word-break:break-all;font-size:0.8rem">${esc(location.origin + location.pathname)}</p>
        `,
        actions: [
          { label: '코드 복사', value: 'copy-code' },
          { label: '안내 문구 복사', value: 'copy-all' },
          { label: '다음', value: 'next', primary: true },
        ],
      });
      const cv = modalValue(codeStep);
      if (cv === 'copy-code') { await copyText(familyCode); continue; }
      if (cv === 'copy-all') { await copyText(share); continue; }
      if (cv !== 'next') { role = null; continue; }
      state.data.auth.spouseConnected = true;
      state.data.auth.spouseName = state.data.auth.spouseName || '배우자';
      persist();
    } else {
      const joinStep = await openModal({
        title: '1. 가족 코드 입력',
        body: `<form id="link-join-form" class="form-stack">
          <p class="field-hint">코드를 보낸 쪽(폰·PC)과 <strong>같은 앱 주소</strong>로 접속했는지 확인하세요.</p>
          ${formField('가족 코드', `<input class="input" name="code" type="text" placeholder="ABC123" maxlength="12" minlength="${HOUSEHOLD_CODE_LENGTH}" style="text-transform:uppercase" required />`)}
        </form>`,
        actions: [{ label: '뒤로', value: 'back' }, { label: '다음', value: 'next', primary: true }],
      });
      if (modalValue(joinStep) === 'back') { role = null; continue; }
      const codeInput = modalForm(joinStep)?.get('code')?.toString();
      if (!(await applyJoinCode(codeInput || ''))) continue;
    }

    if (syncOn && !hasCloudPassphraseSession()) {
      const passStep = await openModal({
        title: '2. 가족 암호',
        body: `<form id="link-pass-form" class="form-stack" autocomplete="off">
          <p class="field-hint">클라우드 데이터를 암호화합니다. <strong>모든 기기에 같은 암호</strong>를 씁니다. (${HOUSEHOLD_PASS_MIN}자 이상)</p>
          ${formField('가족 암호', '<input class="input" name="pass" type="password" autocomplete="new-password" />')}
          ${formField('한 번 더', '<input class="input" name="pass2" type="password" autocomplete="new-password" />')}
        </form>`,
        actions: [{ label: '뒤로', value: 'back' }, { label: '다음', value: 'next', primary: true }],
        beforeFinish: (value, form) => (value === 'next' ? validateHouseholdPassForm(form) : null),
      });
      if (modalValue(passStep) === 'back') { role = null; continue; }
      if (modalValue(passStep) !== 'next') continue;
      const p1 = modalForm(passStep)?.get('pass')?.toString() || '';
      if (!(await savePassphrase(p1))) continue;
    } else if (!syncOn) {
      state.data.auth.spouseConnected = true;
      persist();
      await openModal({
        title: '연동 (로컬)',
        body: `<p class="modal-text">가족 코드는 맞춰 두었습니다. 클라우드가 켜지면 설정에서 <strong>가족 암호 → 지금 동기화</strong>만 하면 PC·폰이 맞춰집니다.</p>`,
        actions: [{ label: '확인', value: 'ok', primary: true }],
      });
      dismissLinkAttention();
      import('./views/index.js').then((m) => m.renderApp());
      return;
    }

    if (syncOn && code) {
      const syncStep = await openModal({
        title: '3. 데이터 맞추기',
        body: `<p class="modal-text">다른 기기에 데이터가 있으면 <strong>받아오기</strong>, 이 기기가 처음이면 <strong>올리기</strong>가 됩니다.</p>
          <p class="muted">잠시만 기다려 주세요…</p>`,
        actions: [{ label: '지금 맞추기', value: 'sync', primary: true }],
      });
      if (modalValue(syncStep) === 'sync') {
        await runSyncWithFeedback();
      }
    }

    await openModal({
      title: '연동 완료',
      body: `${checklistHtml()}
        <p class="modal-text muted">나중에 다시 맞출 때는 설정 → <strong>지금 동기화</strong>를 누르세요.</p>`,
      actions: [{ label: '확인', value: 'ok', primary: true }],
    });
    dismissLinkAttention();
    import('./views/index.js').then((m) => m.renderApp());
    return;
  }
}
