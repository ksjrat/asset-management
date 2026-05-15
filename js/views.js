import { formatWon, formatPct, parseAmount, MONTHS, monthLabel, formatDateShort } from './format.js';
import {
  getMonth, uid, calcSettlement, totalAssets, totalLiabilities, assetBreakdown,
  annualByCategory, annualByCard, annualBySubCategory, monthlyTrend,
  expensesByCategoryForMonth, getBudgetVsActual, applyAutoCarryOver, setCarryOver,
  isSavingExpense, defaultTxDate,
} from './store.js';
import { escapeHtml, openModal, closeModal } from './ui.js';
import { barChartHtml, lineTrendSvg } from './charts.js';
import { listEditorHtml, readListFromForm, bindListEditor } from './list-editor.js';
import { exportJson, importJsonFile } from './backup.js';
import { parseTransactionsCsv } from './csv-import.js';
import { pullFromCloud, pushToCloud } from './sync.js';

function showCarryForm(ctx) {
  const { data, viewMonth, persist } = ctx;
  const m = getMonth(data, data.year, viewMonth);
  openModal(
    '<h2>' + monthLabel(viewMonth) + ' \uc774\uc6d4\uae08</h2>' +
    '<form id="carry-form">' +
    '<div class="form-group"><label>\uc774\uc6d4\uae08</label><input name="carryOver" type="number" value="' + (m.carryOver || 0) + '" /></div>' +
    '<label class="checkbox-row"><input type="checkbox" name="auto" ' + (data.settings.autoCarryOver ? 'checked' : '') + ' /> \uc804\uc6d4 \uc794\uc561 \uc790\ub3d9 \uc774\uc6d4</label>' +
    '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:12px">\uc800\uc7a5</button></form>'
,
    (modal) => {
      modal.querySelector('#carry-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        setCarryOver(data, data.year, viewMonth, parseAmount(fd.get('carryOver')), true);
        data.settings.autoCarryOver = !!fd.get('auto');
        persist();
        closeModal();
      };
    }
  );
}

export function renderHome(ctx) {
  const { data, viewMonth, main, pageTitle, headerSub, setRoute } = ctx;
  const year = data.year;
  applyAutoCarryOver(data, year, viewMonth);
  const s = calcSettlement(data, year, viewMonth);
  const assets = totalAssets(data);
  const liabilities = totalLiabilities(data);
  const goal = data.settings.monthlySavingsGoal;
  const goalRate = data.settings.monthlySavingsRateGoal;
  const budgetRows = getBudgetVsActual(data, year, viewMonth)
    .filter((r) => r.budget > 0 || r.actual > 0).slice(0, 5);

  pageTitle.textContent = year + '\ub144 \uac00\uacc4\ubd80';
  headerSub.textContent = monthLabel(viewMonth) + ' \uacb0\uc0b0 \u00b7 \uc21c\uc790\uc0b0 ' + formatWon(assets - liabilities);

  let budgetHtml = '';
  if (budgetRows.length) {
    budgetHtml = '<div class="card"><div class="card-title">\uc608\uc0b0 \ud558\uc774\ub77c\uc774\ud2b8</div>' +
      budgetRows.map((r) =>
        '<div class="budget-row' + (r.over ? ' over' : '') + '"><span>' + escapeHtml(r.category) +
        '</span><span>' + formatWon(r.actual) + ' / ' + formatWon(r.budget) + '</span></div>'
      ).join('') +
      '<button type="button" class="link-btn" data-go="budget">\uc608\uc0b0 \uc804\uccb4 \ubcf4\uae30</button></div>';
  }

  main.innerHTML = (
    '<div class="card"><div class="card-title">' + monthLabel(viewMonth) + ' \uc7ac\ubb34 \ubaa9\ud45c</div>' +
    '<div class="stat-grid">' +
    '<div class="stat"><div class="stat-label">\uc6d4 \ubaa9\ud45c \uc800\ucd95\uc561</div><div class="stat-value">' + formatWon(goal) + '</div></div>' +
    '<div class="stat"><div class="stat-label">\ub2ec\uc131\ub960</div><div class="stat-value positive">' + formatPct(s.savingsGoalProgress) + '</div></div>' +
    '</div><div class="progress-bar"><div class="progress-fill" style="width:' + Math.min(s.savingsGoalProgress, 1) * 100 + '%"></div></div>' +
    '<p class="hint">\uc800\ucd95\uc131 ' + formatWon(s.savingExpense) + ' \u00b7 \ubaa9\ud45c \uc800\ucd95\ub960 ' + formatPct(goalRate) + ' \ub300\ube44 ' + formatPct(s.savingsRateGoalProgress) + '</p></div>' +
    '<div class="card"><div class="card-title-row"><span>\u25b7 \uacb0\uc0b0</span><button type="button" class="link-btn" id="edit-carry">\uc774\uc6d4 \uc218\uc815</button></div>' +
    '<table class="data"><tbody>' +
    '<tr><td>\uc774\uc6d4</td><td>' + formatWon(s.carryOver) + '</td></tr>' +
    '<tr><td>\uc21c\uc218\uc785</td><td>' + formatWon(s.netIncome) + '</td></tr>' +
    '<tr><td>\ucd1d\uc9c0\ucd9c</td><td>' + formatWon(s.totalExpense) + '</td></tr>' +
    '<tr class="total"><td>\uc794\uc561</td><td>' + formatWon(s.balance) + '</td></tr>' +
    '<tr><td>\uc800\ucd95\ube44\uc728</td><td>' + formatPct(s.savingsRate) + '</td></tr></tbody></table></div>' +
    budgetHtml +
    '<div class="card"><div class="card-title">\uc790\uc0b0 \uc694\uc57d</div><div class="stat-grid">' +
    '<div class="stat"><div class="stat-label">\uc21c\uc790\uc0b0</div><div class="stat-value">' + formatWon(assets - liabilities) + '</div></div>' +
    '<div class="stat"><div class="stat-label">\ucd1d\uc790\uc0b0</div><div class="stat-value positive">' + formatWon(assets) + '</div></div></div></div>'
  )

  main.querySelector('#edit-carry')?.addEventListener('click', () => showCarryForm(ctx));
  main.querySelector('[data-go="budget"]')?.addEventListener('click', () => setRoute('budget'));
}

export function renderMonth(ctx) {
  const { data, viewMonth, main, pageTitle, headerSub, searchQuery, persist } = ctx;
  const year = data.year;
  applyAutoCarryOver(data, year, viewMonth);
  const m = getMonth(data, year, viewMonth);
  const s = calcSettlement(data, year, viewMonth);
  const q = (searchQuery || '').toLowerCase();
  const filterList = (list) => list.filter((t) => {
    if (!q) return true;
    return [t.name, t.category, t.owner, t.card].some((x) => (x || '').toLowerCase().includes(q));
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  pageTitle.textContent = monthLabel(viewMonth) + ' \uac00\uacc4';
  headerSub.textContent = '\uc218\uc785 ' + formatWon(s.income) + ' \u00b7 \uc9c0\ucd9c ' + formatWon(s.totalExpense);

  const txRow = (t, kind) =>
    '<li class="tx-item" data-id="' + t.id + '" data-kind="' + kind + '">' +
    '<div class="tx-icon ' + kind + '">' + (kind === 'income' ? '\u2193' : '\u2191') + '</div>' +
    '<div class="tx-body"><div class="tx-name">' + escapeHtml(t.name || t.category) + '</div>' +
    '<div class="tx-meta">' + formatDateShort(t.date) + ' \u00b7 ' + escapeHtml(t.category) +
    (t.owner ? ' \u00b7 ' + escapeHtml(t.owner) : '') + '</div></div>' +
    '<div class="tx-amount ' + kind + '">' + (kind === 'income' ? '+' : '-') + formatWon(t.amount) + '</div></li>';

  const income = filterList(m.income);
  const expenses = filterList(m.expenses);

  main.innerHTML = (
    '<div class="month-picker"><button type="button" id="prev-month">\u2039</button><span>' + year + '\ub144 ' + monthLabel(viewMonth) + '</span><button type="button" id="next-month">\u203a</button></div>' +
    '<input type="search" class="search-input" id="tx-search" placeholder="\uac80\uc0c9..." value="' + escapeHtml(searchQuery || '') + '" />' +
    '<div class="btn-row"><button class="btn btn-primary" id="add-income">+ \uc218\uc785</button><button class="btn btn-outline" id="add-expense">+ \uc9c0\ucd9c</button></div>' +
    '<div class="card"><div class="card-title">\uc218\uc785</div><ul class="tx-list">' + (income.length ? income.map((t) => txRow(t, 'income')).join('') : '<p class="empty">\uc5c6\uc74c</p>') + '</ul></div>' +
    '<div class="card"><div class="card-title">\uc9c0\ucd9c</div><ul class="tx-list">' + (expenses.length ? expenses.map((t) => txRow(t, 'expense')).join('') : '<p class="empty">\uc5c6\uc74c</p>') + '</ul></div>'
  )

  main.querySelector('#prev-month').onclick = () => { ctx.viewMonth = viewMonth > 1 ? viewMonth - 1 : 12; ctx.render(); };
  main.querySelector('#next-month').onclick = () => { ctx.viewMonth = viewMonth < 12 ? viewMonth + 1 : 1; ctx.render(); };
  main.querySelector('#add-income').onclick = () => showTxForm(ctx, 'income');
  main.querySelector('#add-expense').onclick = () => showTxForm(ctx, 'expense');
  main.querySelector('#tx-search').oninput = (e) => { ctx.searchQuery = e.target.value; ctx.render(); };
  main.querySelectorAll('.tx-item').forEach((el) => {
    el.onclick = () => {
      const list = el.dataset.kind === 'income' ? m.income : m.expenses;
      const item = list.find((t) => t.id === el.dataset.id);
      if (item) showTxForm(ctx, el.dataset.kind, item);
    };
  });
}

export function showTxForm(ctx, kind, existing = null) {
  const { data, viewMonth, persist } = ctx;
  const isIncome = kind === 'income';
  const cats = isIncome ? data.settings.incomeCategories : data.settings.expenseCategories;
  const owners = [...data.settings.names, '\uacf5\ub3d9'];
  const subs = data.settings.subCategories || {};
  const subList = existing?.category ? (subs[existing.category] || []) : [];

  const catOpts = cats.map((c) => '<option' + (existing?.category === c ? ' selected' : '') + '>' + escapeHtml(c) + '</option>').join('');
  const ownerOpts = owners.map((o) => '<option' + (existing?.owner === o ? ' selected' : '') + '>' + escapeHtml(o) + '</option>').join('');

  let extra = '';
  if (!isIncome) {
    const cardOpts = data.settings.cards.map((c) => '<option' + (existing?.card === c ? ' selected' : '') + '>' + escapeHtml(c) + '</option>').join('');
    const payOpts = data.settings.paymentMethods.map((p) => '<option' + (existing?.payment === p ? ' selected' : '') + '>' + escapeHtml(p) + '</option>').join('');
    const subOpts = subList.map((s) => '<option value="' + escapeHtml(s) + '">').join('');
    extra =
      '<div class="form-group"><label>\uc138\ubd80\ud56d\ubaa9</label><input name="subCategory" list="sub-list" value="' + escapeHtml(existing?.subCategory || '') + '" /><datalist id="sub-list">' + subOpts + '</datalist></div>' +
      '<div class="form-group"><label>\uce74\ub4dc</label><select name="card"><option value="">\u2014</option>' + cardOpts + '</select></div>' +
      '<div class="form-group"><label>\uacb0\uc7ac</label><select name="payment">' + payOpts + '</select></div>' +
      '<label class="checkbox-row"><input type="checkbox" name="saving" ' + (existing && isSavingExpense(existing) ? 'checked' : '') + ' /> \uc800\ucd95\uc131 \uc9c0\ucd9c</label>';
  }

  openModal(
    ('<h2>' + (existing ? '\uc218\uc815' : '\ucd94\uac00') + ' \u2014 ' + (isIncome ? '\uc218\uc785' : '\uc9c0\ucd9c') + '</h2><form id="tx-form">' +
    '<div class="form-group"><label>\ub0a0\uc9dc</label><input name="date" type="date" value="' + (existing?.date || defaultTxDate(data.year, viewMonth)) + '" /></div>' +
    '<div class="form-group"><label>\uc18c\uc720</label><select name="owner">' + ownerOpts + '</select></div>' +
    '<div class="form-group"><label>\ub0b4\uc6a9</label><input name="name" value="' + escapeHtml(existing?.name || '') + '" /></div>' +
    '<div class="form-group"><label>\ud56d\ubaa9</label><select name="category">' + catOpts + '</select></div>' +
    extra +
    '<div class="form-group"><label>\uae08\uc561</label><input name="amount" type="number" value="' + (existing?.amount || '') + '" required />' +
    '<div class="amount-presets"><button type="button" data-amt="10000">1\ub9cc</button><button type="button" data-amt="50000">5\ub9cc</button><button type="button" data-amt="100000">10\ub9cc</button></div></div>' +
    '<div class="btn-row"><button type="submit" class="btn btn-primary">\uc800\uc7a5</button>' +
    (existing ? '<button type="button" class="btn btn-outline" id="tx-delete">\uc0ad\uc81c</button>' : '') +
    '<button type="button" class="btn btn-outline" id="tx-cancel">\ucde8\uc18c</button></div></form>'),
    (modal) => {
      modal.querySelector('#tx-cancel').onclick = closeModal;
      modal.querySelectorAll('[data-amt]').forEach((b) => {
        b.onclick = () => { modal.querySelector('[name=amount]').value = b.dataset.amt; };
      });
      if (existing) {
        modal.querySelector('#tx-delete').onclick = () => {
          const mo = getMonth(data, data.year, viewMonth);
          const list = isIncome ? mo.income : mo.expenses;
          const idx = list.findIndex((t) => t.id === existing.id);
          if (idx >= 0) list.splice(idx, 1);
          persist();
          closeModal();
        };
      }
      modal.querySelector('#tx-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const cat = fd.get('category');
        const entry = {
          id: existing?.id || uid(),
          date: fd.get('date'),
          owner: fd.get('owner'),
          name: fd.get('name'),
          category: cat,
          subCategory: fd.get('subCategory') || '',
          amount: parseAmount(fd.get('amount')),
          card: fd.get('card') || '',
          payment: fd.get('payment') || '',
          type: fd.get('saving') ? 'saving' : (cat === '\uc800\ucd95\uc131' ? 'saving' : 'consumption'),
        };
        const mo = getMonth(data, data.year, viewMonth);
        const list = isIncome ? mo.income : mo.expenses;
        if (existing) {
          const idx = list.findIndex((t) => t.id === existing.id);
          if (idx >= 0) list[idx] = entry;
        } else list.push(entry);
        persist();
        closeModal();
      };
    }
  );
}

export function renderBudget(ctx) {
  const { data, viewMonth, main, pageTitle, headerSub, persist } = ctx;
  const rows = getBudgetVsActual(data, data.year, viewMonth);
  pageTitle.textContent = '\uc608\uc0b0';
  headerSub.textContent = monthLabel(viewMonth) + ' \uc608\uc0b0 vs \uc2e4\uc801';
  main.innerHTML =
    '<div class="month-picker"><button id="prev-month">\u2039</button><span>' + monthLabel(viewMonth) + '</span><button id="next-month">\u203a</button></div>' +
    '<button class="btn btn-primary" id="edit-budget" style="width:100%;margin-bottom:10px">\uc608\uc0b0 \ud3b8\uc9d1</button>' +
    '<div class="card table-wrap"><table class="data"><thead><tr><th>\ud56d\ubaa9</th><th>\uc608\uc0b0</th><th>\uc2e4\uc801</th><th>%</th></tr></thead><tbody>' +
    rows.map((r) => '<tr class="' + (r.over ? 'row-over' : '') + '"><td>' + escapeHtml(r.category) + '</td><td>' + formatWon(r.budget) + '</td><td>' + formatWon(r.actual) + '</td><td>' + (r.budget ? formatPct(r.pct) : '-') + '</td></tr>').join('') +
    '</tbody></table></div>';
  main.querySelector('#prev-month').onclick = () => { ctx.viewMonth = viewMonth > 1 ? viewMonth - 1 : 12; ctx.render(); };
  main.querySelector('#next-month').onclick = () => { ctx.viewMonth = viewMonth < 12 ? viewMonth + 1 : 1; ctx.render(); };
  main.querySelector('#edit-budget').onclick = () => {
    const cats = data.settings.expenseCategories;
    openModal(
      '<h2>' + monthLabel(viewMonth) + ' \uc608\uc0b0</h2><form id="budget-form">' +
      cats.map((cat) => '<div class="form-group"><label>' + escapeHtml(cat) + '</label><input name="' + escapeHtml(cat) + '" type="number" value="' + ((data.budget[cat] || {})[viewMonth] || '') + '" /></div>').join('') +
      '<button type="submit" class="btn btn-primary" style="width:100%">\uc800\uc7a5</button></form>',
      (modal) => {
        modal.querySelector('#budget-form').onsubmit = (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          cats.forEach((cat) => {
            if (!data.budget[cat]) data.budget[cat] = {};
            data.budget[cat][viewMonth] = parseAmount(fd.get(cat));
          });
          persist();
          closeModal();
        };
      }
    );
  };
}

export function renderMonthlyReport(ctx) {
  const { data, viewMonth, main, pageTitle, headerSub } = ctx;
  const s = calcSettlement(data, data.year, viewMonth);
  const byCat = expensesByCategoryForMonth(data, data.year, viewMonth);
  pageTitle.textContent = '\uc6d4\ubcc4 \ub9ac\ud3ec\ud2b8';
  headerSub.textContent = monthLabel(viewMonth);
  main.innerHTML =
    '<div class="month-picker"><button id="prev-month">\u2039</button><span>' + monthLabel(viewMonth) + '</span><button id="next-month">\u203a</button></div>' +
    '<div class="card"><div class="stat-grid"><div class="stat"><div class="stat-label">\uc21c\uc218\uc785</div><div class="stat-value">' + formatWon(s.netIncome) + '</div></div>' +
    '<div class="stat"><div class="stat-label">\ucd1d\uc9c0\ucd9c</div><div class="stat-value">' + formatWon(s.totalExpense) + '</div></div></div></div>' +
    '<div class="card"><div class="card-title">\ud56d\ubaa9\ubcc4 \uc9c0\ucd9c</div>' + barChartHtml(byCat) + '</div>';

  main.querySelector('#prev-month').onclick = () => { ctx.viewMonth = viewMonth > 1 ? viewMonth - 1 : 12; ctx.render(); };
  main.querySelector('#next-month').onclick = () => { ctx.viewMonth = viewMonth < 12 ? viewMonth + 1 : 1; ctx.render(); };
}

export function renderSettlement(ctx) {
  const { data, main, pageTitle, headerSub } = ctx;
  pageTitle.textContent = '\uacb0\uc0b0';
  headerSub.textContent = data.year + '\ub144';
  const rows = MONTHS.map((m) => ({ m, ...calcSettlement(data, data.year, m) }));
  const trend = monthlyTrend(data, data.year);
  const keys = ['carryOver', 'netIncome', 'totalExpense', 'savingExpense', 'balance'];
  const labels = { carryOver: '\uc774\uc6d4', netIncome: '\uc21c\uc218\uc785', totalExpense: '\ucd1d\uc9c0\ucd9c', savingExpense: '\uc800\ucd95\uc131', balance: '\uc794\uc561' };
  main.innerHTML =
    '<div class="card">' + lineTrendSvg(trend) + '</div>' +
    '<div class="card table-wrap" style="padding:0"><table class="data settlement-table"><thead><tr><th>\ud56d\ubaa9</th>' +
    MONTHS.map((m) => '<th>' + m + '\uc6d4</th>').join('') + '<th>\uacc4</th></tr></thead><tbody>' +
    keys.map((key) => {
      const total = rows.reduce((sum, r) => sum + r[key], 0);
      return '<tr><td>' + labels[key] + '</td>' + rows.map((r) => '<td>' + formatWon(r[key]).replace('\uc6d0', '') + '</td>').join('') + '<td>' + formatWon(total).replace('\uc6d0', '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  
}

export function renderAnnual(ctx, type) {
  const { data, main, pageTitle } = ctx;
  const titles = {
    'annual-income': '\uc5f0\uac04 \ud56d\ubaa9\ubcc4 \uc218\uc785',
    'annual-card': '\uc5f0\uac04 \uce74\ub4dc\ubcc4 \uc9c0\ucd9c',
    'annual-expense': '\uc5f0\uac04 \ud56d\ubaa9\ubcc4 \uc9c0\ucd9c',
    'annual-sub-expense': '\uc5f0\uac04 \uc138\ubd80\ud56d\ubaa9\ubcc4 \uc9c0\ucd9c',
  };
  pageTitle.textContent = titles[type] || '\uc5f0\uac04';
  const rows = type === 'annual-card' ? annualByCard(data, data.year)
    : type === 'annual-sub-expense' ? annualBySubCategory(data, data.year)
    : annualByCategory(data, data.year, type === 'annual-income' ? 'income' : 'expense');
  main.innerHTML = '<div class="card">' + barChartHtml(rows) + '</div>' +
    rows.map(([name, amt]) => '<div class="asset-row"><div class="asset-name">' + escapeHtml(name) + '</div><div class="stat-value">' + formatWon(amt) + '</div></div>').join('');
}

export function renderAssets(ctx) {
  const { data, assetSheet, main, pageTitle, headerSub, persist } = ctx;
  const labels = { 'asset-summary': '\uc790\uc0b0\ud604\ud669', accounts: '\uacc4\uc88c', emergency: '\ube44\uc0c1\uae08', deposits: '\uc608\uae08', savings: '\uc801\uae08', investments: '\ud22c\uc790', trades: '\ub9e4\ub9e4', debts: '\ubd80\ucc44', loans: '\ub300\ucd9c' };
  pageTitle.textContent = labels[assetSheet] || '\uc790\uc0b0';
  headerSub.textContent = '\uc21c\uc790\uc0b0 ' + formatWon(totalAssets(data) - totalLiabilities(data));

  if (assetSheet === 'asset-summary') {
    main.innerHTML = assetBreakdown(data).map((b) =>
      '<div class="asset-row" data-sheet="' + b.id + '"><div class="asset-name">' + b.label + '</div><div class="stat-value">' + formatWon(b.total) + '</div></div>'
    ).join('');
    main.innerHTML = '<div class="card">' + main.innerHTML + '</div>';
    
    main.querySelectorAll('[data-sheet]').forEach((r) => { r.onclick = () => { ctx.assetSheet = r.dataset.sheet; ctx.render(); }; });
    return;
  }

  if (assetSheet === 'loans') {
    main.innerHTML = '<div class="card">' + data.liabilities.loans.map((loan) =>
      '<div class="asset-row"><div><div class="asset-name">' + escapeHtml(loan.name) + '</div><div class="asset-sub">' + escapeHtml(loan.lender || '') + ' \u00b7 \uae08\ub9ac ' + (loan.rate || 0) + '% \u00b7 \uc6d4 ' + formatWon(loan.payment) + '</div></div><div class="stat-value negative">' + formatWon(loan.balance) + '</div></div>'
    ).join('') + '</div><button class="btn btn-primary" style="width:100%" id="edit-loans">\uc218\uc815</button>';
    
    main.querySelector('#edit-loans').onclick = () => showLoansForm(ctx);
    return;
  }

  const keyMap = { accounts: 'accounts', emergency: 'emergency', deposits: 'deposits', savings: 'savings', investments: 'investments', trades: 'trades', debts: 'debts' };
  const key = keyMap[assetSheet];
  const list = key === 'debts' ? data.liabilities.debts : (data.assets[key] || []);
  const isTrade = assetSheet === 'trades';
  main.innerHTML = '<button class="btn btn-primary" id="add-asset" style="width:100%;margin-bottom:8px">+ \ucd94\uac00</button><div class="card">' +
    (list.length ? list.map((a) =>
      '<div class="asset-row" data-id="' + a.id + '"><div><div class="asset-name">' + escapeHtml(a.name) + (a.owner ? '<span class="badge">' + escapeHtml(a.owner) + '</span>' : '') + '</div><div class="asset-sub">' + escapeHtml(a.institution || '') +
      (isTrade && a.quantity ? ' \u00b7 ' + a.quantity + '\uc8fc \u00b7 \ud3c9\ub2e8 ' + formatWon(a.avgPrice) : '') + '</div></div><div class="stat-value">' + formatWon(a.balance) + '</div></div>'
    ).join('') : '<p class="empty">\uc5c6\uc74c</p>') + '</div>';

  main.querySelector('#add-asset').onclick = () => showAssetForm(ctx, key);
  main.querySelectorAll('.asset-row').forEach((row) => {
    const item = list.find((a) => a.id === row.dataset.id);
    if (item) row.onclick = () => showAssetForm(ctx, key, item);
  });
}

function showAssetForm(ctx, key, existing = null) {
  const { data, persist } = ctx;
  const isDebt = key === 'debts';
  const isTrade = key === 'trades';
  const owners = [...data.settings.names, '\uacf5\ub3d9'];
  const ownerOpts = owners.map((o) => '<option' + (existing?.owner === o ? ' selected' : '') + '>' + escapeHtml(o) + '</option>').join('');
  openModal(
    ('<h2>' + (existing ? '\uc218\uc815' : '\ucd94\uac00') + '</h2><form id="asset-form">' +
    '<div class="form-group"><label>\uc774\ub984</label><input name="name" value="' + escapeHtml(existing?.name || '') + '" required /></div>' +
    '<div class="form-group"><label>\uae08\uc735\uae30\uad00</label><input name="institution" value="' + escapeHtml(existing?.institution || '') + '" /></div>' +
    '<div class="form-group"><label>\uc18c\uc720</label><select name="owner">' + ownerOpts + '</select></div>' +
    (isTrade ? '<div class="form-group"><label>\uc218\ub7c9</label><input name="quantity" type="number" value="' + (existing?.quantity || '') + '" /><label>\ud3c9\ub2e8\uac00</label><input name="avgPrice" type="number" value="' + (existing?.avgPrice || '') + '" /></div>' : '') +
    '<div class="form-group"><label>' + (isTrade ? '\ud3c9\uac00\uc561' : '\uc794\uc561') + '</label><input name="balance" type="number" value="' + (existing?.balance || '') + '" required /></div>' +
    '<div class="btn-row"><button type="submit" class="btn btn-primary">\uc800\uc7a5</button>' + (existing ? '<button type="button" class="btn btn-outline" id="asset-delete">\uc0ad\uc81c</button>' : '') + '<button type="button" class="btn btn-outline" id="tx-cancel">\ucde8\uc18c</button></div></form>'),
    (modal) => {
      modal.querySelector('#tx-cancel').onclick = closeModal;
      const targetList = isDebt ? data.liabilities.debts : data.assets[key];
      if (existing) modal.querySelector('#asset-delete').onclick = () => {
        const idx = targetList.findIndex((a) => a.id === existing.id);
        if (idx >= 0) targetList.splice(idx, 1);
        persist(); closeModal();
      };
      modal.querySelector('#asset-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const entry = { id: existing?.id || uid(), name: fd.get('name'), institution: fd.get('institution'), owner: fd.get('owner'), balance: parseAmount(fd.get('balance')), quantity: parseAmount(fd.get('quantity')), avgPrice: parseAmount(fd.get('avgPrice')) };
        if (existing) { const idx = targetList.findIndex((a) => a.id === existing.id); if (idx >= 0) targetList[idx] = entry; } else targetList.push(entry);
        persist(); closeModal();
      };
    }
  );
}

function showLoansForm(ctx) {
  const { data, persist } = ctx;
  const blocks = data.liabilities.loans.map((loan, i) =>
    '<div class="form-group"><label>' + escapeHtml(loan.name) + '</label>' +
    '<input name="lender_' + i + '" value="' + escapeHtml(loan.lender || '') + '" placeholder="\uae08\uc735\uae30\uad00" />' +
    '<input name="balance_' + i + '" type="number" value="' + (loan.balance || '') + '" style="margin-top:4px" placeholder="\uc794\uc561" />' +
    '<input name="rate_' + i + '" type="number" step="0.01" value="' + (loan.rate || '') + '" style="margin-top:4px" placeholder="\uae08\ub9ac %" />' +
    '<input name="payment_' + i + '" type="number" value="' + (loan.payment || '') + '" style="margin-top:4px" placeholder="\uc6d4 \uc0c1\ud658" />' +
    '<input name="dueDay_' + i + '" type="number" value="' + (loan.dueDay || '') + '" style="margin-top:4px" placeholder="\ub0a9\uc785\uc77c" /></div>'
  ).join('');
  openModal('<h2>\ub300\ucd9c 1~5</h2><form id="loans-form">' + blocks + '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">\uc800\uc7a5</button></form>', (modal) => {
    modal.querySelector('#loans-form').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      data.liabilities.loans.forEach((loan, i) => {
        loan.lender = fd.get('lender_' + i);
        loan.balance = parseAmount(fd.get('balance_' + i));
        loan.rate = parseFloat(fd.get('rate_' + i)) || 0;
        loan.payment = parseAmount(fd.get('payment_' + i));
        loan.dueDay = parseInt(fd.get('dueDay_' + i), 10) || 0;
      });
      persist(); closeModal();
    };
  });
}

export function renderItems(ctx) {
  const { data, main, pageTitle, persist } = ctx;
  pageTitle.textContent = '\ud56d\ubaa9\uc124\uc815';
  main.innerHTML = '<div class="card"><div class="card-title">\uc218\uc785 \ud56d\ubaa9</div>' + listEditorHtml(data.settings.incomeCategories, 'incomeCat') + '</div>' +
    '<div class="card"><div class="card-title">\uc9c0\ucd9c \ud56d\ubaa9</div>' + listEditorHtml(data.settings.expenseCategories, 'expenseCat') + '</div>' +
    '<button class="btn btn-primary" id="save-items" style="width:100%">\uc800\uc7a5</button>';
  
  const cards = main.querySelectorAll('.card');
  bindListEditor(main);
  main.querySelector('#save-items').onclick = () => {
    const inc = readListFromForm(cards[0], 'incomeCat');
    const exp = readListFromForm(cards[1], 'expenseCat');
    if (inc.length) data.settings.incomeCategories = inc;
    if (exp.length) data.settings.expenseCategories = exp;
    persist();
  };
}

export function renderPayment(ctx) {
  const { data, main, pageTitle, persist } = ctx;
  pageTitle.textContent = '\uacb0\uc7ac \ubc29\uc2dd';
  const cards = main;
  main.innerHTML = '<div class="card"><div class="card-title">\uacb0\uc7ac \uc218\ub2e8</div>' + listEditorHtml(data.settings.paymentMethods, 'pay') + '</div>' +
    '<div class="card"><div class="card-title">\uce74\ub4dc</div>' + listEditorHtml(data.settings.cards, 'card') + '</div>' +
    '<button class="btn btn-primary" id="save-pay" style="width:100%">\uc800\uc7a5</button>';
  bindListEditor(main);
  main.querySelector('#save-pay').onclick = () => {
    const els = main.querySelectorAll('.card');
    const pay = readListFromForm(els[0], 'pay');
    const card = readListFromForm(els[1], 'card');
    if (pay.length) data.settings.paymentMethods = pay;
    if (card.length) data.settings.cards = card;
    persist();
  };
}

export function renderGoals(ctx) {
  const { data, main, pageTitle, persist } = ctx;
  pageTitle.textContent = '\uc7ac\ubb34\ubaa9\ud45c\u00b7\uc77c\uc815';
  const goals = data.settings.financialGoals || [];
  const schedule = data.settings.financialSchedule || [];
  main.innerHTML =
    '<div class="card"><div class="card-title">\uc7ac\ubb34\ubaa9\ud45c</div>' +
    (goals.map((g) => '<div class="asset-row"><div>' + escapeHtml(g.title) + '</div><div>' + formatWon(g.amount) + '</div></div>').join('') || '<p class="empty">\uc5c6\uc74c</p>') +
    '<button class="btn btn-outline" id="add-goal" style="width:100%;margin-top:8px">+ \ubaa9\ud45c</button></div>' +
    '<div class="card"><div class="card-title">\uc7ac\ubb34\uc77c\uc815</div>' +
    (schedule.map((s) => '<div class="asset-row"><div>' + escapeHtml(s.title) + '</div><div class="asset-sub">' + escapeHtml(s.date || '') + '</div></div>').join('') || '<p class="empty">\uc5c6\uc74c</p>') +
    '<button class="btn btn-outline" id="add-sched" style="width:100%;margin-top:8px">+ \uc77c\uc815</button></div>';

  main.querySelector('#add-goal').onclick = () => {
    openModal('<h2>\uc7ac\ubb34\ubaa9\ud45c</h2><form id="g-form"><input name="title" required placeholder="\ubaa9\ud45c" /><input name="amount" type="number" required placeholder="\uae08\uc561" /><button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">\ucd94\uac00</button></form>', (m) => {
      m.querySelector('#g-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (!data.settings.financialGoals) data.settings.financialGoals = [];
        data.settings.financialGoals.push({ id: uid(), title: fd.get('title'), amount: parseAmount(fd.get('amount')) });
        persist(); closeModal();
      };
    });
  };
  main.querySelector('#add-sched').onclick = () => {
    openModal('<h2>\uc7ac\ubb34\uc77c\uc815</h2><form id="s-form"><input name="title" required /><input name="date" type="date" /><button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">\ucd94\uac00</button></form>', (m) => {
      m.querySelector('#s-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (!data.settings.financialSchedule) data.settings.financialSchedule = [];
        data.settings.financialSchedule.push({ id: uid(), title: fd.get('title'), date: fd.get('date') });
        persist(); closeModal();
      };
    });
  };
}

export function renderSettings(ctx) {
  const { data, persist, render } = ctx;
  const sync = data.settings.sync || {};
  openModal(
    '<h2>\uc124\uc815</h2><form id="settings-form">' +
    '<div class="form-group"><label>\uc6d4 \ubaa9\ud45c \uc800\ucd95\uc561</label><input name="monthlySavingsGoal" type="number" value="' + data.settings.monthlySavingsGoal + '" /></div>' +
    '<div class="form-group"><label>\uc6d4 \ubaa9\ud45c \uc800\ucd95\ub960 (0~1)</label><input name="monthlySavingsRateGoal" type="number" step="0.01" value="' + data.settings.monthlySavingsRateGoal + '" /></div>' +
    '<div class="form-group"><label>\uc774\ub984 (\uc27c\ud45c)</label><input name="names" value="' + escapeHtml(data.settings.names.join(', ')) + '" /></div>' +
    '<label class="checkbox-row"><input type="checkbox" name="autoCarryOver" ' + (data.settings.autoCarryOver ? 'checked' : '') + ' /> \uc804\uc6d4 \uc794\uc561 \uc790\ub3d9 \uc774\uc6d4</label>' +
    '<hr class="divider" /><p class="hint">\ubc31\uc5c5</p>' +
    '<button type="button" class="btn btn-outline" id="btn-export" style="width:100%;margin-bottom:6px">JSON \ub0b4\ubcf4\ub0b4\uae30</button>' +
    '<label class="btn btn-outline file-label">\uac00\uc838\uc624\uae30 (JSON)<input type="file" id="import-json" accept=".json" hidden /></label>' +
    '<label class="btn btn-outline file-label">CSV \uac70\ub798 \uac00\uc838\uc624\uae30<input type="file" id="import-csv" accept=".csv" hidden /></label>' +
    '<hr class="divider" /><p class="hint">Firestore \ub3d9\uae30\ud654</p>' +
    '<label class="checkbox-row"><input type="checkbox" name="syncEnabled" ' + (sync.enabled ? 'checked' : '') + ' /> \uc0ac\uc6a9</label>' +
    '<div class="form-group"><label>API Key</label><input name="apiKey" value="' + escapeHtml(sync.apiKey || '') + '" /></div>' +
    '<div class="form-group"><label>Project ID</label><input name="projectId" value="' + escapeHtml(sync.projectId || '') + '" /></div>' +
    '<button type="button" class="btn btn-outline" id="btn-sync-pull" style="width:100%;margin:4px 0">\ubd88\ub7ec\uc624\uae30</button>' +
    '<button type="button" class="btn btn-outline" id="btn-sync-push" style="width:100%;margin:4px 0">\uc800\uc7a5\ud558\uae30</button>' +
    '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px">\uc800\uc7a5</button>' +
    '<button type="button" class="btn btn-outline" id="settings-cancel" style="width:100%;margin-top:6px">\ub2eb\uae30</button></form>',
    (modal) => {
      modal.querySelector('#settings-cancel').onclick = closeModal;
      modal.querySelector('#btn-export').onclick = () => exportJson(data);
      modal.querySelector('#import-json').onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        ctx.data = await importJsonFile(file);
        persist(); render(); closeModal();
      };
      modal.querySelector('#import-csv').onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = parseTransactionsCsv(text, data.year, ctx.viewMonth);
        const mo = getMonth(data, data.year, ctx.viewMonth);
        mo.income.push(...parsed.income);
        mo.expenses.push(...parsed.expenses);
        persist(); closeModal();
      };
      modal.querySelector('#btn-sync-pull').onclick = async () => {
        try {
          const remote = await pullFromCloud(data);
          if (remote) { ctx.data = remote; persist(); render(); alert('\ubd88\ub7ec\uc654\uc2b5\ub2c8\ub2e4.'); }
          else alert('\ub370\uc774\ud130\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.');
        } catch (err) { alert(err.message); }
      };
      modal.querySelector('#btn-sync-push').onclick = async () => {
        try { await pushToCloud(data); alert('\uc800\uc7a5\ud588\uc2b5\ub2c8\ub2e4.'); } catch (err) { alert(err.message); }
      };
      modal.querySelector('#settings-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        data.settings.monthlySavingsGoal = parseAmount(fd.get('monthlySavingsGoal'));
        data.settings.monthlySavingsRateGoal = parseFloat(fd.get('monthlySavingsRateGoal')) || 0.5;
        data.settings.names = fd.get('names').split(',').map((s) => s.trim()).filter(Boolean);
        data.settings.autoCarryOver = !!fd.get('autoCarryOver');
        if (!data.settings.sync) data.settings.sync = {};
        data.settings.sync.enabled = !!fd.get('syncEnabled');
        data.settings.sync.apiKey = fd.get('apiKey');
        data.settings.sync.projectId = fd.get('projectId');
        data.settings.sync.collection = data.settings.sync.collection || 'household_ledgers';
        data.settings.sync.docId = data.settings.sync.docId || 'sej-2026';
        persist();
        closeModal();
      };
    }
  );
}
