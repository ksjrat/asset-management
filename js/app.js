import { initUi, $ } from './ui.js';
import { app, loadUiPrefs, persist } from './state.js';
import { monthLabel } from './format.js';
import {
  renderMonth, renderBudget, renderMonthlyReport, renderSettlement, renderItems,
} from './views.js';
import {
  renderHomeV2, renderAssetsV2, renderMore, renderSettingsPage, showQuickTxForm,
} from './views-redesign.js';

const main = () => $('#main');
const pageTitle = () => $('#page-title');
const headerSub = () => $('#header-sub');

function ctx() {
  return {
    get data() { return app.data; },
    set data(v) { app.data = v; },
    get route() { return app.route; },
    set route(v) { app.route = v; },
    get viewMonth() { return app.viewMonth; },
    set viewMonth(v) { app.viewMonth = v; },
    get assetSheet() { return app.assetSheet; },
    set assetSheet(v) { app.assetSheet = v; },
    get searchQuery() { return app.searchQuery; },
    set searchQuery(v) { app.searchQuery = v; },
    main: main(),
    pageTitle: pageTitle(),
    headerSub: headerSub(),
    setRoute,
    render,
    persist: () => { persist(); render(); },
  };
}

function tabForRoute(r) {
  if (r === 'home') return 'home';
  if (r === 'month') return 'month';
  if (r === 'assets' || r.startsWith('asset-')) return 'assets';
  if (['more', 'budget', 'report', 'settlement', 'settings', 'items', 'goals'].includes(r)) return 'more';
  return 'home';
}

function shiftMonth(delta) {
  let m = app.viewMonth + delta;
  if (m < 1) m = 12;
  if (m > 12) m = 1;
  app.viewMonth = m;
  render();
}

function setRoute(r, opts = {}) {
  app.route = r;
  if (opts.month != null) app.viewMonth = opts.month;
  if (opts.assetSheet) app.assetSheet = opts.assetSheet;

  document.querySelectorAll('.tab[data-route]').forEach((t) => {
    t.classList.toggle('active', t.dataset.route === tabForRoute(r));
  });

  render();
}

function updateHeaderMonth() {
  const sub = headerSub();
  if (sub) sub.textContent = `${app.data.year}년 ${monthLabel(app.viewMonth)}`;
}

function render() {
  const c = ctx();
  const r = app.route;
  updateHeaderMonth();

  if (r === 'home') renderHomeV2(c);
  else if (r === 'month') renderMonth(c);
  else if (r === 'assets') renderAssetsV2(c);
  else if (r === 'more') renderMore(c);
  else if (r === 'budget') renderBudget(c);
  else if (r === 'report') renderMonthlyReport(c);
  else if (r === 'settlement') renderSettlement(c);
  else if (r === 'settings') renderSettingsPage(c);
  else if (r === 'items') renderItems(c);
  else renderHomeV2(c);
}

function init() {
  initUi();
  loadUiPrefs();
  app.viewMonth = new Date().getMonth() + 1;
  app.route = app.route || 'home';

  $('#btn-prev-month')?.addEventListener('click', () => shiftMonth(-1));
  $('#btn-next-month')?.addEventListener('click', () => shiftMonth(1));

  document.querySelectorAll('.tab[data-route]').forEach((tab) => {
    tab.addEventListener('click', () => setRoute(tab.dataset.route));
  });

  $('#tab-add')?.addEventListener('click', () => showQuickTxForm(ctx(), 'expense'));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
}

init();
