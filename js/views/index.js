import { state, setTab, shiftMonth, goToToday, enterExpenseTab, applyExpenseDueMonthIfNeeded } from '../state.js';
import { esc } from '../ui.js';
import { fmtMonth } from '../format.js';
import { renderAuth, bindAuth, finishOnboarding } from './auth.js';
import { renderLock, bindLock } from './lock.js';
import { renderDashboard, bindDashboard } from './dashboard.js';
import { renderAssets, bindAssets } from './assets.js';
import { renderBudget, bindBudget } from './budget.js';
import { renderMemos, bindMemos } from './memos.js';
import { renderSettings, bindSettings } from './settings.js';
import { renderGoals, bindGoals } from './goals.js';
import { renderSetup, bindSetup } from './setup.js';
import { showActualForm } from './modals.js';
import { TAB_SVG } from '../icons.js';
import { needsLinkAttention, openLinkWizard } from '../link-wizard.js';

let linkWizardPrompted = false;

const TABS = [
  { id: 'dashboard', label: '홈' },
  { id: 'assets', label: '자산·수익' },
  { id: 'expense', label: '지출' },
  { id: 'memos', label: '메모' },
  { id: 'settings', label: '설정' },
];

const MONTH_TABS = new Set(['expense']);

function monthHeader() {
  const { selectedYear: y, selectedMonth: m } = state;
  const isCurrent = y === new Date().getFullYear() && m === new Date().getMonth() + 1;
  return `
    <button type="button" class="icon-btn" id="btn-prev-month" aria-label="이전 달">‹</button>
    <div class="header-titles header-titles--month">
      <button type="button" class="month-pill" id="btn-month-today" title="이번 달로">
        ${esc(fmtMonth(y, m))}${isCurrent ? '' : ' · 이번 달로'}
      </button>
    </div>
    <button type="button" class="icon-btn" id="btn-next-month" aria-label="다음 달">›</button>`;
}

function fabHtml() {
  if (state.tab === 'expense') {
    return `<button type="button" class="fab" id="fab-record-actual" aria-label="실적 입력">✓</button>`;
  }
  if (state.tab === 'memos') {
    return `<button type="button" class="fab" id="fab-add-memo" aria-label="메모 추가">+</button>`;
  }
  return '';
}

export function renderApp() {
  const root = document.getElementById('app');
  const { data, locked } = state;

  if (!data.auth.onboardingDone || state.showWelcome || data.auth.atStartScreen) {
    root.className = 'app-auth';
    root.innerHTML = renderAuth();
    bindAuth(finishOnboarding, renderApp);
    return;
  }

  if (locked) {
    root.className = 'app-lock';
    root.innerHTML = renderLock();
    bindLock();
    return;
  }

  if (!data.budget?.setupDone) {
    root.className = 'app-shell app-shell--setup';
    root.innerHTML = renderSetup();
    bindSetup();
    return;
  }

  if (state.tab === 'expense') applyExpenseDueMonthIfNeeded();

  const tab = TABS.find((t) => t.id === state.tab);
  const showMonth = MONTH_TABS.has(state.tab);

  root.className = 'app-shell';
  root.innerHTML = `
    <header class="header${showMonth ? '' : ' header--compact'}">
      <div class="header-row">
        ${showMonth ? monthHeader() : `
          <div class="header-titles header-titles--compact">
            <h1 class="header-title">${esc(tab?.label || '우리 자산')}</h1>
            <p class="header-sub">
              <span class="couple-pill ${data.auth.spouseConnected ? 'connected' : ''}">
                ${data.auth.spouseConnected ? '💑' : '⏳'}
                ${data.auth.spouseConnected ? esc(data.auth.spouseName) : '연결 대기'}
              </span>
            </p>
          </div>
        `}
      </div>
    </header>
    <main class="main page-enter" id="main">${renderMain()}</main>
    ${fabHtml()}
    <nav class="tab-bar" role="tablist">
      ${TABS.map((t) => `
        <button type="button" class="tab-btn ${state.tab === t.id ? 'active' : ''}"
          data-tab="${t.id}" role="tab" aria-selected="${state.tab === t.id}" aria-label="${t.label}">
          <span class="tab-icon">${TAB_SVG[t.id] || ''}</span>
          <span class="tab-label">${t.label}</span>
        </button>`).join('')}
    </nav>
  `;
  bindShell();
  if (!linkWizardPrompted && needsLinkAttention()) {
    linkWizardPrompted = true;
    setTimeout(() => openLinkWizard(), 600);
  }
}

function renderMain() {
  switch (state.tab) {
    case 'dashboard': return renderDashboard();
    case 'assets': return renderAssets();
    case 'expense': return renderBudget();
    case 'memos': return renderMemos();
    case 'settings':
      return state.settingsSubView === 'goals' ? renderGoals() : renderSettings();
    default: return '';
  }
}

function bindShell() {
  const rerender = () => renderApp();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.subView = null;
      state.selectedGoalId = null;
      if (btn.dataset.tab === 'expense') enterExpenseTab();
      else setTab(btn.dataset.tab);
      rerender();
    });
  });

  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    shiftMonth(-1);
    rerender();
  });
  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    shiftMonth(1);
    rerender();
  });
  document.getElementById('btn-month-today')?.addEventListener('click', () => {
    goToToday();
    rerender();
  });

  document.getElementById('fab-record-actual')?.addEventListener('click', async () => {
    const { getVisibleCategories } = await import('../store.js');
    const { isRecordDue } = await import('../budget-engine.js');
    const { y, m } = { y: state.selectedYear, m: state.selectedMonth };
    const due = getVisibleCategories(state.data).find((c) => isRecordDue(state.data, y, m, c.id));
    if (due) showActualForm(due.id, y, m, rerender);
    else {
      const { toast } = await import('../ui.js');
      toast('입력 대기 항목이 없거나 정산일 이전입니다', 'info');
    }
  });

  if (state.tab === 'dashboard') bindDashboard();
  if (state.tab === 'assets') bindAssets();
  if (state.tab === 'expense') bindBudget();
  if (state.tab === 'memos') bindMemos();
  if (state.tab === 'settings') {
    if (state.settingsSubView === 'goals') bindGoals();
    else bindSettings();
  }
}
