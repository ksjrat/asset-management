import { load, save, KEY, getVisibleCategories } from './store.js';
import { findEarliestDueBudgetMonth } from './budget-engine.js';
import { syncAfterPersist } from './sync-service.js';

const initialData = load();

const savedTab = (() => {
  try { return localStorage.getItem('couple-asset-tab'); } catch { return null; }
})();

function normalizeSavedTab(tab) {
  if (!tab) return null;
  if (tab === 'budget') return 'expense';
  if (tab === 'goals') return 'dashboard';
  if (tab === 'reports') return 'memos';
  return tab;
}

export const state = {
  data: initialData,
  tab: normalizeSavedTab(savedTab) || 'dashboard',
  subView: null,
  ownerFilter: initialData.settings?.homeOwnerFilter || 'all',
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
  /** 세션당 1회: 지출 탭 첫 진입 시 입력 대기 월 자동 선택 */
  expenseDueMonthApplied: false,
};

export function persist() {
  try {
    save(state.data);
    syncAfterPersist();
    return true;
  } catch (e) {
    console.warn('Persist failed', e);
    return false;
  }
}

/** 전체 저장 실패 시에도 시작 화면·로그인 상태만이라도 남김 */
export function persistAuthFlags() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : structuredClone(state.data);
    data.auth = { ...data.auth, ...state.data.auth };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Auth flags persist failed', e);
    return false;
  }
}

/** 설정 등에서 「시작 화면」(가족 코드·암호 입력)으로 이동 */
export function enterStartScreen() {
  state.showWelcome = true;
  state.authScreen = 'welcome';
  state.locked = false;
  state.settingsSubView = null;
  if (state.data?.auth) state.data.auth.atStartScreen = true;
}

/** 시작 화면에서 앱으로 복귀 */
export function leaveStartScreen() {
  state.showWelcome = false;
  if (state.data?.auth) state.data.auth.atStartScreen = false;
}

export function setTab(tab) {
  state.tab = tab;
  state.subView = null;
  state.settingsSubView = null;
  state.txSearch = '';
  try { localStorage.setItem('couple-asset-tab', tab); } catch { /* ignore */ }
}

/** 지출 탭 첫 진입 시 실적 입력 대기 중인 가장 이른 달로 이동 */
export function applyExpenseDueMonthIfNeeded() {
  if (state.expenseDueMonthApplied || !state.data.budget?.setupDone) return;
  state.expenseDueMonthApplied = true;
  const due = findEarliestDueBudgetMonth(state.data, getVisibleCategories(state.data));
  if (due) setMonth(due.year, due.month);
}

/** 지출 탭으로 이동 (month 지정 시 해당 달 유지, 미지정 시 입력 대기 달 우선) */
export function enterExpenseTab({ year, month } = {}) {
  if (year != null && month != null) {
    setMonth(year, month);
    state.expenseDueMonthApplied = true;
  } else {
    applyExpenseDueMonthIfNeeded();
  }
  setTab('expense');
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
