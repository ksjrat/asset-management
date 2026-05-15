import { initUi, $ } from './ui.js';
import { app, loadUiPrefs, persist } from './state.js';
import { SHEET_MENU } from './store.js';
import {
  renderHome, renderMonth, renderBudget, renderMonthlyReport,
  renderSettlement, renderAnnual, renderAssets, renderItems,
  renderPayment, renderGoals, renderSettings, showTxForm,
} from './views.js';

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
  if (['settlement', 'budget', 'monthly-report'].includes(r) || r.startsWith('annual')) return 'report';
  if (r === 'month' || r.startsWith('month-') || ['items', 'payment', 'goals'].includes(r)) return 'month';
  if (
    r === 'assets' || r.startsWith('asset') ||
    ['accounts', 'emergency', 'deposits', 'savings', 'investments', 'trades', 'debts', 'loans', 'asset-summary'].includes(r)
  ) return 'assets';
  return 'home';
}

function setRoute(r, opts = {}) {
  app.route = r;
  if (opts.month != null) app.viewMonth = opts.month;
  if (opts.assetSheet) app.assetSheet = opts.assetSheet;
  closeDrawer();
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.route === tabForRoute(r));
  });
  render();
}

function openDrawer() {
  $('#drawer').classList.remove('hidden');
  $('#drawer-overlay').classList.remove('hidden');
}

function closeDrawer() {
  $('#drawer').classList.add('hidden');
  $('#drawer-overlay').classList.add('hidden');
}

function renderDrawer() {
  const list = $('#drawer-list');
  list.innerHTML = SHEET_MENU.map((sec) => `
    <li class="drawer-section">${sec.section}</li>
    ${sec.items.map((it) => `
      <li><button type="button" data-nav="${it.id}" class="${app.route === it.id ? 'active' : ''}">${it.label}</button></li>
    `).join('')}
  `).join('');
  list.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.nav;
      if (id.startsWith('month-')) setRoute('month', { month: parseInt(id.split('-')[1], 10) });
      else if (['accounts', 'emergency', 'deposits', 'savings', 'investments', 'trades', 'debts', 'loans', 'asset-summary'].includes(id)) {
        app.assetSheet = id;
        setRoute('assets');
      } else setRoute(id);
    };
  });
}

function updateFab() {
  const fab = $('#fab-add');
  if (!fab) return;
  const show = app.route === 'home' || app.route === 'month' || app.route.startsWith('month-');
  fab.classList.toggle('hidden', !show);
}

function render() {
  renderDrawer();
  updateFab();
  const c = ctx();
  const r = app.route;

  if (r === 'home') renderHome(c);
  else if (r === 'month' || r.startsWith('month-')) renderMonth(c);
  else if (r === 'assets' || ['accounts', 'emergency', 'deposits', 'savings', 'investments', 'trades', 'debts', 'loans', 'asset-summary'].includes(r)) {
    if (r !== 'assets') app.assetSheet = r;
    renderAssets(c);
  }
  else if (r === 'settlement') renderSettlement(c);
  else if (r === 'budget') renderBudget(c);
  else if (r === 'monthly-report') renderMonthlyReport(c);
  else if (r.startsWith('annual')) renderAnnual(c, r);
  else if (r === 'items') renderItems(c);
  else if (r === 'payment') renderPayment(c);
  else if (r === 'goals') renderGoals(c);
  else if (r === 'report') renderSettlement(c);
  else renderHome(c);
}

function init() {
  initUi();
  loadUiPrefs();
  app.viewMonth = new Date().getMonth() + 1;

  $('#btn-menu').addEventListener('click', openDrawer);
  $('#drawer-overlay').addEventListener('click', closeDrawer);
  $('#btn-settings').addEventListener('click', () => renderSettings(ctx()));

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const r = tab.dataset.route;
      if (r === 'report') setRoute('settlement');
      else if (r === 'assets') { app.assetSheet = 'asset-summary'; setRoute('assets'); }
      else setRoute(r);
    });
  });

  $('#fab-add')?.addEventListener('click', () => {
    if (app.route === 'home') setRoute('month');
    showTxForm(ctx(), 'expense');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
}

init();
