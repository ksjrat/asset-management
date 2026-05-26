import { load, save } from './store.js';
import { syncAfterPersist } from './sync-service.js';

const savedTab = (() => {
  try { return localStorage.getItem('couple-asset-tab'); } catch { return null; }
})();

function normalizeSavedTab(tab) {
  if (!tab) return null;
  if (tab === 'budget') return 'expense';
  if (tab === 'goals') return 'dashboard';
  return tab;
}

export const state = {
  data: load(),
  tab: normalizeSavedTab(savedTab) || 'dashboard',
  subView: null,
  ownerFilter: 'all',
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  selectedGoalId: null,
  selectedTxId: null,
  txSearch: '',
  txFilter: 'all',
  locked: true,
  showWelcome: false,
  authScreen: 'welcome',
  setupStep: 1,
  /** 설정 탭 내 화면: null | 'goals' */
  settingsSubView: null,
};

export function persist() {
  save(state.data);
  syncAfterPersist();
}

export function setTab(tab) {
  state.tab = tab;
  state.subView = null;
  state.settingsSubView = null;
  state.txSearch = '';
  try { localStorage.setItem('couple-asset-tab', tab); } catch { /* ignore */ }
}

export function goToToday() {
  const now = new Date();
  setMonth(now.getFullYear(), now.getMonth() + 1);
}

export function setMonth(year, month) {
  state.selectedYear = year;
  state.selectedMonth = month;
}

export function shiftMonth(delta) {
  let { selectedYear: y, selectedMonth: m } = state;
  m += delta;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  setMonth(y, m);
}
