import { load, save } from './store.js';

export const state = {
  data: load(),
  tab: 'dashboard',
  subView: null,
  ownerFilter: 'all',
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  selectedGoalId: null,
  selectedTxId: null,
  locked: true,
  authScreen: 'welcome',
};

export function persist() {
  save(state.data);
}

export function setTab(tab) {
  state.tab = tab;
  state.subView = null;
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
