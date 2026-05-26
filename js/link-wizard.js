import { state, persist } from './state.js';
import { generateInviteCode, HOUSEHOLD_CODE_LENGTH } from './store.js';
import {
  isSyncEnabled, joinHousehold, hasStoredCloudPassphrase,
} from './sync.js';
import {
  connectCloudSync, ensureSyncReady, ensureCloudPassphraseLoaded,
  isCloudSyncActive, syncManualRefresh,
} from './sync-service.js';
import { openModal, toast, esc, copyText, formField, modalValue, modalForm } from './ui.js';

const DISMISS_KEY = 'link-wizard-dismissed';
const HOUSEHOLD_PASS_MIN = 4;

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
          <p><strong>로컬에서는 Firebase 설정이 필요합니다.</strong></p>
          <p class="muted"><code>setup-sync-local.bat</code> 후 <code>js/sync-config.js</code>를 채우고 서버를 다시 시작하세요.</p>
        </div>`;
  }
  return `<div class="link-callout">
          <p><strong>클라우드가 이 주소에 없습니다.</strong></p>
          <p class="muted">GitHub Pages는 <code>FIREBASE_CONFIG</code> 시크릿이 필요합니다.</p>
        </div>`;
}

function validateLinkForm(form, syncOn) {
  if (!form) return '입력 내용을 확인해 주세요.';
  const role = form.role?.toString();
  if (!role) return '역할을 선택해 주세요.';
  if (role === 'join') {
    const code = form.code?.toString().trim().toUpperCase() || '';
    if (code.length < HOUSEHOLD_CODE_LENGTH) {
      return `${HOUSEHOLD_CODE_LENGTH}자리 가족 코드를 입력해 주세요.`;
    }
  }
  if (syncOn) {
    const p1 = form.pass?.toString() || '';
    const p2 = form.pass2?.toString() || '';
    if (p1.length < HOUSEHOLD_PASS_MIN) {
      return `가족 암호는 ${HOUSEHOLD_PASS_MIN}자 이상이어야 합니다.`;
    }
    if (p1 !== p2) return '암호가 서로 다릅니다.';
  }
  return null;
}

export function getLinkSteps() {
  const syncOn = isSyncEnabled();
  const code = state.data.auth.householdId || state.data.auth.inviteCode;
  const hid = state.data.auth.householdId || code;
  const linked = isCloudSyncActive() || (syncOn && hid && hasStoredCloudPassphrase(hid));
  return [
    { id: 'cloud', label: '클라우드', hint: cloudOffHint(), done: syncOn, required: syncOn },
    { id: 'code', label: '가족 코드', hint: code || '발급 또는 입력', done: !!code, required: true },
    {
      id: 'pass',
      label: '가족 암호',
      hint: linked ? '이 기기에 저장됨' : `${HOUSEHOLD_PASS_MIN}자 이상`,
      done: linked,
      required: syncOn,
    },
    {
      id: 'sync',
      label: '자동 동기화',
      hint: linked ? '켜짐 · 저장 시 실시간 반영' : '연동 후 자동',
      done: !!state.data._syncMeta?.autoSync || linked,
      required: syncOn,
    },
  ];
}

export function isLinkComplete() {
  const code = !!(state.data.auth.householdId || state.data.auth.inviteCode);
  if (!isSyncEnabled()) return code;
  if (!code) return false;
  return isCloudSyncActive() || hasStoredCloudPassphrase(state.data.auth.householdId);
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
  return `우리 자산 연동\n주소: ${url}\n가족 코드: ${code}\n가족 암호: (가족끼리 정한 비밀번호)`;
}

export async function runSyncWithFeedback() {
  await ensureSyncReady();
  if (!ensureCloudPassphraseLoaded()) {
    toast('먼저 연동 도우미에서 가족 코드·암호를 입력해 주세요', 'info');
    return { ok: false, reason: 'no-pass' };
  }
  const result = await syncManualRefresh();
  const msg = {
    ok: '다른 기기와 맞춰졌습니다',
    uploaded: '클라우드에 올렸습니다',
    'local-only': '동기화했습니다',
    'local-kept': '이 기기 데이터를 유지했습니다',
    off: '클라우드가 꺼져 있습니다',
    'no-code': '가족 코드가 없습니다',
    'no-pass': '가족 암호를 입력해 주세요',
    'bad-pass': '가족 암호가 맞지 않습니다',
    error: '네트워크 오류',
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
  }
  return state.data.auth.householdId || state.data.auth.inviteCode;
}

function applyJoinCodeOnly(code) {
  const upper = code.trim().toUpperCase();
  const own = state.data.auth.inviteCode;
  if (own && upper === own) {
    state.data.auth.householdId = upper;
  } else {
    joinHousehold(state.data, upper);
  }
  state.data.auth.spouseConnected = true;
  state.data.auth.spouseName = state.data.auth.spouseName || '배우자';
  persist();
}

export async function openLinkWizard() {
  await ensureSyncReady();
  const syncOn = isSyncEnabled();
  const existingCode = state.data.auth.householdId || state.data.auth.inviteCode || '';

  const intro = await openModal({
    title: '기기·배우자 연동',
    body: `
      <p class="modal-text">가족 코드와 암호를 <strong>한 번만</strong> 맞추면, 이후에는 저장할 때마다 PC·폰에 자동 반영됩니다.</p>
      ${checklistHtml()}
      ${!syncOn ? cloudOffCalloutHtml() : ''}
    `,
    actions: [
      { label: '나중에', value: 'later' },
      { label: syncOn ? '연동하기' : '코드만 맞추기', value: 'start', primary: true },
    ],
  });
  if (modalValue(intro) !== 'start') {
    dismissLinkAttention();
    return;
  }

  if (!syncOn) {
    const localOnly = await openModal({
      title: '가족 코드',
      body: `<form id="link-local-form" class="form-stack">
        <label class="field"><span class="field-label">역할</span>
          <select name="role" class="input">
            <option value="primary">처음 — 코드 발급</option>
            <option value="join">참여 — 코드 입력</option>
          </select></label>
        <div id="link-code-field">
          ${formField('가족 코드', `<input class="input" name="code" type="text" value="${esc(existingCode)}" placeholder="ABC123" maxlength="12" style="text-transform:uppercase" />`)}
        </div>
      </form>`,
      actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
    });
    if (modalValue(localOnly) !== 'save') return;
    const fd = modalForm(localOnly);
    if (fd?.get('role') === 'primary') await ensureCode();
    else if (fd?.get('code')) applyJoinCodeOnly(fd.get('code').toString());
    else await ensureCode();
    dismissLinkAttention();
    import('./views/index.js').then((m) => m.renderApp());
    return;
  }

  const setup = await openModal({
    title: '가족 연동',
    body: `<form id="link-setup-form" class="form-stack" autocomplete="off">
      <label class="field"><span class="field-label">이 기기</span>
        <select name="role" class="input">
          <option value="primary" ${!existingCode ? 'selected' : ''}>처음 — 코드 발급</option>
          <option value="join" ${existingCode ? 'selected' : ''}>참여 — 받은 코드 입력</option>
        </select></label>
      ${formField('가족 코드', `<input class="input" name="code" type="text" value="${esc(existingCode)}" placeholder="6자리 코드" maxlength="12" style="text-transform:uppercase" />`)}
      <p class="field-hint muted">처음이면 비워 두고 연동하면 코드가 만들어집니다.</p>
      ${formField('가족 암호', '<input class="input" name="pass" type="password" autocomplete="new-password" />')}
      ${formField('한 번 더', '<input class="input" name="pass2" type="password" autocomplete="new-password" />')}
      <p class="field-hint">모든 기기·배우자가 <strong>같은 암호</strong>를 씁니다. 이 기기에 저장되어 새로고침 후에도 자동 동기화됩니다.</p>
    </form>`,
    actions: [{ label: '취소', value: null }, { label: '연동 시작', value: 'save', primary: true }],
    beforeFinish: (value, form) => (value === 'save' ? validateLinkForm(form, true) : null),
  });
  if (modalValue(setup) !== 'save') return;

  const fd = modalForm(setup);
  const role = fd?.get('role')?.toString();
  let code = fd?.get('code')?.toString().trim().toUpperCase() || '';

  if (role === 'primary') {
    code = await ensureCode();
  } else {
    if (!code || code.length < HOUSEHOLD_CODE_LENGTH) {
      toast(`${HOUSEHOLD_CODE_LENGTH}자리 가족 코드를 입력하세요`, 'error');
      return;
    }
    applyJoinCodeOnly(code);
  }

  const pass = fd?.get('pass')?.toString() || '';
  toast('연동 중…', 'info');
  const result = await connectCloudSync({ pass, remember: true });

  if (!result.ok) {
    const err = {
      off: '클라우드 설정을 확인해 주세요',
      'no-code': '가족 코드가 없습니다',
      'no-pass': '가족 암호를 입력해 주세요',
      'bad-pass': '가족 암호가 맞지 않습니다. 모든 기기에서 같아야 합니다',
      error: '연동에 실패했습니다. 네트워크를 확인해 주세요',
    };
    toast(err[result.reason] || '연동하지 못했습니다', 'error');
    return;
  }

  const familyCode = state.data.auth.householdId || code;
  const doneModal = await openModal({
    title: '연동 완료',
    body: `
      <p class="invite-code">${esc(familyCode)}</p>
      <p class="field-hint">배우자에게 <strong>앱 주소 · 가족 코드 · 가족 암호</strong>를 알려 주세요.</p>
      <p class="modal-text muted">이제부터 입력·수정하면 다른 기기에 자동 반영됩니다.</p>
      ${checklistHtml()}
    `,
    actions: [
      { label: '코드 복사', value: 'copy' },
      { label: '안내 복사', value: 'copy-all' },
      { label: '확인', value: 'ok', primary: true },
    ],
  });
  const doneVal = modalValue(doneModal);
  if (doneVal === 'copy') await copyText(familyCode);
  if (doneVal === 'copy-all') await copyText(shareMessage(familyCode));

  dismissLinkAttention();
  import('./views/index.js').then((m) => m.renderApp());
}
