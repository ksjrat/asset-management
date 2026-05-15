import { load, save } from './store.js';

const UI_KEY = 'sej-ledger-ui';

export const app = {
  data: load(),
  route: 'home',
  viewMonth: new Date().getMonth() + 1,
  assetSheet: 'asset-summary',
  searchQuery: '',
};

export function loadUiPrefs() {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return;
    const ui = JSON.parse(raw);
    if (ui.viewMonth) app.viewMonth = ui.viewMonth;
    if (ui.route) app.route = ui.route;
  } catch { /* ignore */ }
}

export function saveUiPrefs() {
  localStorage.setItem(UI_KEY, JSON.stringify({
    viewMonth: app.viewMonth,
    route: app.route,
  }));
}

export function persist() {
  save(app.data);
  saveUiPrefs();
}
