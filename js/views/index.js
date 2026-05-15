import { state, persist, setTab, shiftMonth } from '../state.js';
import { esc } from '../ui.js';
import { renderAuth, bindAuth, finishOnboarding } from './auth.js';
import { renderLock, bindLock } from './lock.js';
import { renderDashboard, bindDashboard } from './dashboard.js';
import { renderGoals, bindGoals } from './goals.js';
import { renderBudget, bindBudget } from './budget.js';
import { renderReports } from './reports.js';
import { renderSettings, bindSettings } from './settings.js';

const TABS = [
  { id: 'dashboard', label: '대시보드', icon: '📊' },
  { id: 'goals', label: '목표', icon: '🎯' },
  { id: 'budget', label: '예산', icon: '💳' },
  { id: 'reports', label: '보고서', icon: '📋' },
  { id: 'settings', label: '설정', icon: '⚙️' },
];

export function renderApp() {
  const root = document.getElementById('app');
  const { data, locked } = state;

  if (!data.auth.loggedIn) {
    root.innerHTML = renderAuth();
    bindAuth(finishOnboarding);
    return;
  }

  if (locked && (data.settings?.lockOnLaunch !== false || data.auth.biometricEnabled)) {
    root.innerHTML = renderLock();
    bindLock();
    return;
  }

  const tab = TABS.find((t) => t.id === state.tab);
  root.innerHTML = `
    <header class="header">
      <div class="header-row">
        ${state.tab === 'budget' || state.tab === 'reports'
          ? `<button type="button" class="icon-btn" id="btn-prev-month" aria-label="이전 달">‹</button>`
          : '<span class="icon-spacer"></span>'}
        <div class="header-titles">
          <h1 class="header-title">${esc(tab?.label || '우리 자산')}</h1>
          <p class="header-sub">${esc(data.auth.userName)}${data.auth.spouseConnected ? ` · ${esc(data.auth.spouseName)}` : ''}</p>
        </div>
        ${state.tab === 'budget' || state.tab === 'reports'
          ? `<button type="button" class="icon-btn" id="btn-next-month" aria-label="다음 달">›</button>`
          : '<span class="icon-spacer"></span>'}
      </div>
    </header>
    <main class="main" id="main">${renderMain()}</main>
    <nav class="tab-bar" role="tablist">
      ${TABS.map((t) => `
        <button type="button" class="tab-btn ${state.tab === t.id ? 'active' : ''}"
          data-tab="${t.id}" role="tab" aria-selected="${state.tab === t.id}">
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
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTab(btn.dataset.tab);
      state.subView = null;
      state.selectedGoalId = null;
      renderApp();
    });
  });

  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    shiftMonth(-1);
    renderApp();
  });
  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    shiftMonth(1);
    renderApp();
  });

  if (state.tab === 'dashboard') bindDashboard();
  if (state.tab === 'goals') bindGoals();
  if (state.tab === 'budget') bindBudget();
  if (state.tab === 'settings') bindSettings();
}
