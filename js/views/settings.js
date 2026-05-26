import { state, persist, enterStartScreen } from '../state.js';
import {
  hasSafetyBackup, restoreFromSafetyBackup, hasUserFinancialData, dataFootprint,
  HOME_OWNER_FILTERS, ensureAppSettings, computeGoalProgress,
} from '../store.js';
import { showGoalForm } from './modals.js';
import { fmtMoney } from '../format.js';
import { getBudgetStart } from '../budget-engine.js';
import { isSyncEnabled } from '../sync.js';
import { fmtMonth } from '../format.js';
import { openModal, toast, confirmDialog, formField, esc, modalValue, modalForm } from '../ui.js';
import { showBudgetStartForm } from './modals.js';
import {
  getLinkSteps, isLinkComplete, openLinkWizard, runSyncWithFeedback,
} from '../link-wizard.js';
import { isCloudSyncActive } from '../sync-service.js';
import { applyAppUpdate, checkAppUpdateAvailable } from '../app-update.js';
import {
  canPromptInstall, getPwaInstallHint, pwaInstallInstructionsHtml, tryPwaInstall,
} from '../pwa-install.js';

function linkStatusLabel() {
  if (isLinkComplete()) return '연동 완료';
  const steps = getLinkSteps().filter((s) => s.required);
  const done = steps.filter((s) => s.done).length;
  return `${done}/${steps.length}단계`;
}

function homeFilterSummary(filterIds) {
  const set = new Set(filterIds || []);
  const labels = HOME_OWNER_FILTERS.filter((o) => set.has(o.id)).map((o) => o.label);
  return labels.length ? labels.join(', ') : '선택 없음';
}

function linkSectionSummary(linkDone) {
  if (isCloudSyncActive()) return '자동 동기화 켜짐';
  return linkDone ? '연동 완료' : linkStatusLabel();
}

function bindSettingsDisclosure(toggleId, panelId) {
  const toggle = document.getElementById(toggleId);
  const panel = document.getElementById(panelId);
  if (!toggle || !panel) return;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    toggle.classList.toggle('is-open', !open);
    panel.hidden = open;
  });
}

export function renderSettings() {
  const a = state.data.auth;
  ensureAppSettings(state.data);
  const s = state.data.settings;
  const homeFilters = new Set(s.homeOwnerFilters || []);
  const start = getBudgetStart(state.data);
  const startLabel = start ? fmtMonth(start.year, start.month) : '미설정';
  const syncOn = isSyncEnabled();
  const linkDone = isLinkComplete();

  return `
    <div class="settings-group settings-group--highlight settings-group--disclosure">
      <button type="button" class="settings-row settings-disclosure" id="btn-link-section-toggle"
        aria-expanded="false" aria-controls="link-section-panel">
        <span>
          <strong>기기·배우자 연동</strong>
          <span class="settings-row-meta">${esc(linkSectionSummary(linkDone))}</span>
        </span>
        <span class="settings-chevron settings-disclosure-chevron" aria-hidden="true">›</span>
      </button>
      <div id="link-section-panel" class="settings-disclosure-panel" hidden>
        <button type="button" class="settings-row" id="btn-link-wizard">
          <span><strong>연동 도우미</strong><span class="settings-row-meta">${linkDone ? '다시 설정' : '단계별 안내'}</span></span>
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
          <span><strong>지금 맞추기</strong><span class="settings-row-meta">${isCloudSyncActive() ? '수동으로 다시 맞춤' : '동기화 시작'}</span></span>
          <span class="settings-chevron">›</span>
        </button>` : ''}
        ${a.spouseConnected ? `<button type="button" class="settings-row" id="btn-disconnect" style="color:var(--danger)">
          <span><strong>배우자 연결 해제</strong></span><span class="settings-chevron">›</span>
        </button>` : ''}
      </div>
    </div>

    <div class="settings-group">
      <p class="settings-group-title">보안</p>
      <label class="toggle-row"><span>앱 시작 시 잠금</span>
        <input type="checkbox" id="toggle-lock" ${s.lockOnLaunch !== false ? 'checked' : ''} /></label>
      <button type="button" class="settings-row" id="btn-password">
        <span><strong>앱 비밀번호</strong><span class="settings-row-meta">${a.appPasswordSet ? '설정됨' : '미설정'}</span></span>
        <span class="settings-chevron">›</span>
      </button>
    </div>

    ${(() => {
      const backup = hasSafetyBackup() ? restoreFromSafetyBackup() : null;
      const showRestore = backup && (
        !hasUserFinancialData(state.data)
        || dataFootprint(backup) > dataFootprint(state.data)
      );
      return showRestore ? `
    <div class="settings-group settings-group--highlight">
      <button type="button" class="settings-row" id="btn-restore-backup">
        <span><strong>백업에서 복구</strong><span class="settings-row-meta">동기화 전 이 기기에 저장된 데이터</span></span>
        <span class="settings-chevron">›</span>
      </button>
      <p class="muted settings-hint">데이터가 비었거나 줄었다면 먼저 눌러 보세요.</p>
    </div>` : '';
    })()}

    <div class="settings-group settings-group--disclosure">
      <button type="button" class="settings-row settings-disclosure" id="btn-home-filter-toggle"
        aria-expanded="false" aria-controls="home-filter-panel">
        <span>
          <strong>홈 화면 필터</strong>
          <span class="settings-row-meta" id="home-filter-summary">${esc(homeFilterSummary(s.homeOwnerFilters))}</span>
        </span>
        <span class="settings-chevron settings-disclosure-chevron" aria-hidden="true">›</span>
      </button>
      <div id="home-filter-panel" class="settings-disclosure-panel" hidden>
        <p class="muted settings-hint">순자산·추이 위에 표시할 소유자 필터를 고릅니다. 하나만 켜두면 홈에서 필터 버튼이 숨겨집니다.</p>
        ${HOME_OWNER_FILTERS.map((o) => `
          <label class="toggle-row"><span>${esc(o.label)}</span>
            <input type="checkbox" class="home-owner-filter" data-owner-filter="${o.id}"
              ${homeFilters.has(o.id) ? 'checked' : ''} /></label>`).join('')}
      </div>
    </div>

    <div class="settings-group">
      <p class="settings-group-title">재정 목표</p>
      ${state.data.goals.length ? state.data.goals.slice(0, 3).map((g) => {
        const { current, rate } = computeGoalProgress(g);
        return `<button type="button" class="settings-row settings-row--goal" data-goal-preview="${g.id}">
          <span><strong>${esc(g.title)}</strong><span class="settings-row-meta">${Math.round(rate * 100)}% · ${fmtMoney(current)}</span></span>
          <span class="settings-chevron">›</span>
        </button>`;
      }).join('') : '<p class="muted settings-hint">아직 목표가 없습니다.</p>'}
      <button type="button" class="settings-row" id="btn-goals-manage">
        <span><strong>목표 관리</strong><span class="settings-row-meta">${state.data.goals.length}개</span></span>
        <span class="settings-chevron">›</span>
      </button>
      <button type="button" class="btn btn-secondary btn-block" id="btn-add-goal-settings">+ 목표 추가</button>
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
      <p class="settings-group-title">앱</p>
      <button type="button" class="settings-row" id="btn-pwa-install">
        <span>
          <strong>홈 화면에 추가</strong>
          <span class="settings-row-meta" id="pwa-install-meta">${esc(getPwaInstallHint())}</span>
        </span>
        <span class="settings-chevron" aria-hidden="true">+</span>
      </button>
      <button type="button" class="settings-row" id="btn-app-update">
        <span>
          <strong>업데이트 적용</strong>
          <span class="settings-row-meta" id="app-update-meta">최신 화면·기능 불러오기</span>
        </span>
        <span class="settings-chevron" aria-hidden="true">↻</span>
      </button>
      <p class="muted settings-hint">배포 후 화면이 안 바뀔 때 눌러 주세요. 데이터는 그대로입니다.</p>
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

  document.getElementById('toggle-lock')?.addEventListener('change', (e) => {
    state.data.settings.lockOnLaunch = e.target.checked; persist();
  });

  bindSettingsDisclosure('btn-link-section-toggle', 'link-section-panel');
  bindSettingsDisclosure('btn-home-filter-toggle', 'home-filter-panel');

  const refreshPwaInstallMeta = () => {
    const meta = document.getElementById('pwa-install-meta');
    if (meta) meta.textContent = getPwaInstallHint();
  };
  refreshPwaInstallMeta();
  window.addEventListener('pwa-install-available', refreshPwaInstallMeta);

  document.getElementById('btn-pwa-install')?.addEventListener('click', async () => {
    const actions = canPromptInstall()
      ? [{ label: '닫기', value: null }, { label: '지금 설치', value: 'install', primary: true }]
      : [{ label: '닫기', value: 'ok', primary: true }];
    const res = await openModal({
      title: '홈 화면에 추가',
      body: pwaInstallInstructionsHtml(),
      actions,
    });
    const v = modalValue(res);
    if (v === 'install') {
      const r = await tryPwaInstall();
      if (r.ok) toast('홈 화면에 추가되었습니다', 'success');
      else if (r.reason === 'dismissed') toast('설치를 취소했습니다', 'info');
    }
  });

  checkAppUpdateAvailable().then((available) => {
    const meta = document.getElementById('app-update-meta');
    if (meta && available) meta.textContent = '새 버전 있음 · 눌러 적용';
  });

  document.getElementById('btn-app-update')?.addEventListener('click', async () => {
    toast('업데이트를 적용합니다…', 'info');
    await applyAppUpdate();
  });

  document.querySelectorAll('.home-owner-filter').forEach((el) => {
    el.addEventListener('change', () => {
      const checked = [...document.querySelectorAll('.home-owner-filter:checked')]
        .map((x) => x.dataset.ownerFilter);
      if (!checked.length) {
        el.checked = true;
        toast('최소 1개는 선택해야 합니다', 'info');
        return;
      }
      state.data.settings.homeOwnerFilters = checked;
      if (!checked.includes(state.ownerFilter)) {
        state.ownerFilter = checked[0];
      }
      const summaryEl = document.getElementById('home-filter-summary');
      if (summaryEl) summaryEl.textContent = homeFilterSummary(checked);
      persist();
      toast('홈 화면 필터가 저장되었습니다', 'success');
    });
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
  document.getElementById('btn-goals-manage')?.addEventListener('click', () => {
    state.settingsSubView = 'goals';
    state.subView = null;
    state.selectedGoalId = null;
    rerender();
  });
  document.getElementById('btn-add-goal-settings')?.addEventListener('click', () => {
    showGoalForm(rerender);
  });
  document.querySelectorAll('[data-goal-preview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settingsSubView = 'goals';
      state.selectedGoalId = btn.dataset.goalPreview;
      state.subView = 'detail';
      rerender();
    });
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
      enterStartScreen();
      persist();
      rerender();
    }
  });
}
