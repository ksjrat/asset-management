import { state, setTab, shiftMonth, goToToday } from '../state.js';
import { esc } from '../ui.js';
import { fmtMonth } from '../format.js';
import { renderAuth, bindAuth, finishOnboarding } from './auth.js';
import { renderLock, bindLock } from './lock.js';
import { renderDashboard, bindDashboard } from './dashboard.js';
import { renderGoals, bindGoals } from './goals.js';
import { renderBudget, bindBudget } from './budget.js';
import { renderReports } from './reports.js';
import { renderSettings, bindSettings } from './settings.js';
import { showTxForm } from './modals.js';

const TABS = [
  { id: 'dashboard', label: '대시보드', icon: '📊' },
  { id: 'goals', label: '목표', icon: '🎯' },
  { id: 'budget', label: '예산', icon: '💳' },
  { id: 'reports', label: '보고서', icon: '📋' },
  { id: 'settings', label: '설정', icon: '⚙️' },
];

const MONTH_TABS = new Set(['budget', 'reports']);

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
  if (state.tab === 'budget') {
    return `<button type="button" class="fab" id="fab-add-expense" aria-label="지출 추가">＋</button>`;
  }
  if (state.tab === 'dashboard') {
    return `<button type="button" class="fab fab-secondary" id="fab-add-asset" aria-label="자산 추가">💰</button>`;
  }
  return '';
}

export function renderApp() {
  const root = document.getElementById('app');
  const { data, locked } = state;

  if (!data.auth.loggedIn) {
    root.innerHTML = renderAuth();
    bindAuth(finishOnboarding);
    return;
  }

  if (locked && data.auth.biometricEnabled && data.settings?.lockOnLaunch !== false) {
    root.innerHTML = renderLock();
    bindLock();
    return;
  }

  const tab = TABS.find((t) => t.id === state.tab);
  const showMonth = MONTH_TABS.has(state.tab);

  root.innerHTML = `
    <header class="header">
      <div class="header-row">
        ${showMonth ? monthHeader() : `
          <span class="icon-spacer"></span>
          <div class="header-titles">
            <h1 class="header-title">${esc(tab?.label || '우리 자산')}</h1>
            <p class="header-sub">${esc(data.auth.userName)}${data.auth.spouseConnected ? ` · ${esc(data.auth.spouseName)}` : ' · 연결 대기'}</p>
          </div>
          <span class="icon-spacer"></span>
        `}
      </div>
    </header>
    <main class="main" id="main">${renderMain()}</main>
    ${fabHtml()}
    <nav class="tab-bar" role="tablist">
      ${TABS.map((t) => `
        <button type="button" class="tab-btn ${state.tab === t.id ? 'active' : ''}"
          data-tab="${t.id}" role="tab" aria-selected="${state.tab === t.id}" aria-label="${t.label}">
          <span class="tab-icon">${t.icon}</span>
          <span class="tab-label">${t.label}</span>
        </button>`).join('')}
    </nav>
  `;
  bindShell();
}

function renderMain() {
  switch (state.tab) {
    case 'dashboard': return renderDashboard();
    case 'goals': return renderGoals();
    case 'budget': return renderBudget();
    case 'reports': return renderReports();
    case 'settings': return renderSettings();
    default: return '';
  }
}

function bindShell() {
  const rerender = () => renderApp();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTab(btn.dataset.tab);
      state.subView = null;
      state.selectedGoalId = null;
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

  document.getElementById('fab-add-expense')?.addEventListener('click', () => {
    showTxForm('expense', null, rerender);
  });
  document.getElementById('fab-add-asset')?.addEventListener('click', () => {
    import('./modals.js').then((m) => m.showAssetForm(null, rerender));
  });

  if (state.tab === 'dashboard') bindDashboard();
  if (state.tab === 'goals') bindGoals();
  if (state.tab === 'budget') bindBudget();
  if (state.tab === 'settings') bindSettings();
}
