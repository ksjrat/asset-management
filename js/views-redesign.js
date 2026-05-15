import { formatWon, parseAmount, monthLabel } from './format.js';
import {
  getMonth, uid, calcSettlement, getNetWorth, totalLiabilities,
  expensesByOwner, getBudgetVsActual, getExpenseCategoryList,
  applyAutoCarryOver, setCarryOver, defaultTxDate, pushRecentTx,
} from './store.js';
import { escapeHtml, openModal, closeModal } from './ui.js';
import { exportJson, importJsonFile } from './backup.js';
import { pullFromCloud, pushToCloud } from './sync.js';
import { showTxForm, showAssetForm } from './views.js';

export function renderHomeV2(ctx) {
  const { data, viewMonth, main, pageTitle, setRoute } = ctx;
  const year = data.year;
  applyAutoCarryOver(data, year, viewMonth);
  const s = calcSettlement(data, year, viewMonth);
  const netWorth = getNetWorth(data);
  const budgetRows = getBudgetVsActual(data, year, viewMonth)
    .filter((r) => r.budget > 0 || r.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 5);
  const byOwner = expensesByOwner(data, year, viewMonth);
  const ownerTotal = byOwner.reduce((sum, [, v]) => sum + v, 0) || 1;

  pageTitle.textContent = data.settings.title || '\uc2b9\uc7ac\u00b7\uc740\uc9c0 \uac00\uacc4\ubd80';

  let budgetHtml = '';
  if (budgetRows.length) {
    budgetHtml = '<div class="card"><div class="card-title">\uc608\uc0b0 \ucd08\uacfc \uc8fc\uc758</div>';
    budgetRows.forEach((r) => {
      const pct = r.budget > 0 ? Math.min(r.actual / r.budget, 1.5) : 0;
      budgetHtml +=
        '<div class="budget-bar-row' + (r.over ? ' over' : '') + '">' +
        '<div class="budget-bar-head"><span>' + escapeHtml(r.category) + '</span>' +
        '<span>' + formatWon(r.actual) + ' / ' + formatWon(r.budget) + '</span></div>' +
        '<div class="progress-bar"><div class="progress-fill' + (r.over ? ' over' : '') +
        '" style="width:' + Math.min(pct, 1) * 100 + '%"></div></div></div>';
    });
    budgetHtml += '<button type="button" class="link-btn" data-go="budget">\uc608\uc0b0 \uc804\uccb4 \ubcf4\uae30</button></div>';
  }

  let ownerHtml = '';
  if (byOwner.length) {
    ownerHtml = '<div class="card"><div class="card-title">\ub204\uac00 \uc588\ub098</div>';
    byOwner.forEach(([name, amt]) => {
      ownerHtml +=
        '<div class="owner-row"><span class="owner-name">' + escapeHtml(name) + '</span>' +
        '<div class="owner-track"><div class="owner-fill" style="width:' + (amt / ownerTotal * 100) + '%"></div></div>' +
        '<span class="owner-amt">' + formatWon(amt) + '</span></div>';
    });
    ownerHtml += '</div>';
  }

  main.innerHTML =
    '<div class="hero-card">' +
    '<p class="hero-label">' + monthLabel(viewMonth) + ' \ub0a8\ub294 \ub3c8</p>' +
    '<p class="hero-value ' + (s.netIncome >= 0 ? 'positive' : 'negative') + '">' + formatWon(s.netIncome) + '</p>' +
    '<div class="hero-stats">' +
    '<div><span>\uc218\uc785</span><strong>' + formatWon(s.income) + '</strong></div>' +
    '<div><span>\uc9c0\ucd9c</span><strong>' + formatWon(s.totalExpense) + '</strong></div>' +
    '<div><span>\uc800\ucd95</span><strong>' + formatWon(s.savingExpense) + '</strong></div>' +
    '</div></div>' +
    '<div class="quick-actions">' +
    '<button type="button" class="btn btn-light" id="quick-expense">+ \uc9c0\ucd9c</button>' +
    '<button type="button" class="btn btn-light" id="quick-income">+ \uc218\uc785</button>' +
    '<button type="button" class="btn btn-light" data-go="month">\ub0b4\uc5ed</button>' +
    '</div>' +
    ownerHtml + budgetHtml +
    '<div class="card card-compact">' +
    '<div class="card-title-row"><span>\uc774\ubc88 \ub2ec \uacb0\uc0b0</span>' +
    '<button type="button" class="link-btn" id="edit-carry-v2">\uc774\uc6d4 \uc218\uc815</button></div>' +
    '<div class="summary-lines">' +
    '<div class="summary-line"><span>\uc774\uc6d4</span><span>' + formatWon(s.carryOver) + '</span></div>' +
    '<div class="summary-line total"><span>\uc794\uc561</span><span>' + formatWon(s.balance) + '</span></div>' +
    '</div></div>' +
    '<div class="card card-compact card-link" data-go="assets">' +
    '<div class="card-title-row"><span>\uc21c\uc790\uc0b0</span><span class="stat-value">' + formatWon(netWorth) + '</span></div>' +
    '<p class="hint">\ud0ed\ud558\uc5ec \uacc4\uc88c\u00b7\ub300\ucd9c \ubcf4\uae30</p></div>';

  main.querySelector('#quick-expense')?.addEventListener('click', () => showQuickTxForm(ctx, 'expense'));
  main.querySelector('#quick-income')?.addEventListener('click', () => showQuickTxForm(ctx, 'income'));
  main.querySelector('#edit-carry-v2')?.addEventListener('click', () => showCarryForm(ctx));
  main.querySelector('[data-go="budget"]')?.addEventListener('click', () => setRoute('budget'));
  main.querySelector('[data-go="month"]')?.addEventListener('click', () => setRoute('month'));
  main.querySelector('.card-link')?.addEventListener('click', () => setRoute('assets'));
}

function showCarryForm(ctx) {
  const { data, viewMonth, persist } = ctx;
  const m = getMonth(data, data.year, viewMonth);
  openModal(
    '<h2>' + monthLabel(viewMonth) + ' \uc774\uc6d4\uae08</h2><form id="carry-form-v2">' +
    '<div class="form-group"><label>\uc774\uc6d4\uae08</label><input name="carryOver" type="number" value="' + (m.carryOver || 0) + '" /></div>' +
    '<label class="checkbox-row"><input type="checkbox" name="auto" ' + (data.settings.autoCarryOver ? 'checked' : '') + ' /> \uc804\uc6d4 \uc794\uc561 \uc790\ub3d9 \uc774\uc6d4</label>' +
    '<button type="submit" class="btn btn-primary" style="width:100%;margin-top:12px">\uc800\uc7a5</button></form>',
    (modal) => {
      modal.querySelector('#carry-form-v2').onsubmit = (e) => {
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

export function showQuickTxForm(ctx, kind = 'expense') {
  const { data, viewMonth, persist } = ctx;
  const isIncome = kind === 'income';
  const cats = (isIncome ? data.settings.incomeCategories : getExpenseCategoryList(data)).slice(0, 10);
  const owners = [...data.settings.names, '\uacf5\ub3d9'];
  const recent = (data.settings.recentTransactions || []).filter((r) => r.kind === kind).slice(0, 6);

  const ownerChips = owners.map((o) =>
    '<button type="button" class="chip" data-owner="' + escapeHtml(o) + '">' + escapeHtml(o) + '</button>'
  ).join('');
  const catChips = cats.map((c) =>
    '<button type="button" class="chip" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>'
  ).join('');
  const recentChips = recent.map((r, i) =>
    '<button type="button" class="chip chip-recent" data-recent="' + i + '">' +
    escapeHtml(r.name || r.category) + ' ' + formatWon(r.amount) + '</button>'
  ).join('');

  openModal(
    '<h2>\ube60\ub978 ' + (isIncome ? '\uc218\uc785' : '\uc9c0\ucd9c') + ' \uc785\ub825</h2><form id="quick-tx-form">' +
    '<div class="form-group"><label>\uae08\uc561</label><input name="amount" type="number" class="input-lg" required autofocus /></div>' +
    '<div class="form-group"><label>\ub204\uac00</label><div class="chip-row" id="owner-chips">' + ownerChips + '</div>' +
    '<input type="hidden" name="owner" value="' + escapeHtml(owners[0]) + '" /></div>' +
    '<div class="form-group"><label>\ud56d\ubaa9</label><div class="chip-row" id="cat-chips">' + catChips + '</div>' +
    '<input type="hidden" name="category" value="' + escapeHtml(cats[0] || '\uae30\ud0c0') + '" /></div>' +
    (recentChips ? '<div class="form-group"><label>\ucd5c\uadfc</label><div class="chip-row">' + recentChips + '</div></div>' : '') +
    '<div class="form-group"><label>\ub0b4\uc6a9 (\uc120\ud0dd)</label><input name="name" placeholder="\uba54\ubaa8" /></div>' +
    '<div class="btn-row"><button type="submit" class="btn btn-primary">\uc800\uc7a5</button>' +
    '<button type="button" class="btn btn-outline" id="quick-full">\uc0c1\uc138</button>' +
    '<button type="button" class="btn btn-outline" id="quick-cancel">\ucde8\uc18c</button></div></form>',
    (modal) => {
      const setChip = (row, attr, field, val) => {
        if (!row) return;
        row.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset[attr] === val));
        modal.querySelector('[name=' + field + ']').value = val;
      };
      const oRow = modal.querySelector('#owner-chips');
      const cRow = modal.querySelector('#cat-chips');
      oRow?.querySelector('.chip')?.classList.add('active');
      cRow?.querySelector('.chip')?.classList.add('active');
      oRow?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-owner]');
        if (b) setChip(oRow, 'owner', 'owner', b.dataset.owner);
      });
      cRow?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (b) setChip(cRow, 'cat', 'category', b.dataset.cat);
      });
      modal.querySelectorAll('[data-recent]').forEach((btn) => {
        btn.onclick = () => {
          const r = recent[parseInt(btn.dataset.recent, 10)];
          modal.querySelector('[name=amount]').value = r.amount;
          modal.querySelector('[name=name]').value = r.name || '';
          setChip(oRow, 'owner', 'owner', r.owner);
          setChip(cRow, 'cat', 'category', r.category);
        };
      });
      modal.querySelector('#quick-cancel').onclick = closeModal;
      modal.querySelector('#quick-full').onclick = () => { closeModal(); showTxForm(ctx, kind); };
      modal.querySelector('#quick-tx-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const cat = fd.get('category');
        const entry = {
          id: uid(),
          date: defaultTxDate(data.year, viewMonth),
          owner: fd.get('owner'),
          name: fd.get('name') || cat,
          category: cat,
          subCategory: '',
          amount: parseAmount(fd.get('amount')),
          card: '',
          payment: '',
          type: isIncome ? 'consumption' : (cat === '\uc800\ucd95\uc131\uc9c0\ucd9c' ? 'saving' : 'consumption'),
        };
        const mo = getMonth(data, data.year, viewMonth);
        (isIncome ? mo.income : mo.expenses).push(entry);
        pushRecentTx(data, { kind, name: entry.name, category: entry.category, amount: entry.amount, owner: entry.owner });
        persist();
        closeModal();
      };
    }
  );
}

export function renderMore(ctx) {
  const { main, pageTitle, setRoute } = ctx;
  pageTitle.textContent = '\ub354\ubcf4\uae30';
  const items = [
    ['budget', '\uc608\uc0b0 vs \uc2e4\uc801', '\uc774\ubc88 \ub2ec \uc608\uc0b0'],
    ['report', '\uc6d4\ubcc4 \ub9ac\ud3ec\ud2b8', '\ud56d\ubaa9\ubcc4 \uc9c0\ucd9c'],
    ['settlement', '\uc5f0\uac04 \uacb0\uc0b0', '12\uac1c\uc6d4'],
    ['items', '\uce74\ud14c\uace0\ub9ac', '\uc218\uc785\u00b7\uc9c0\ucd9c \ud56d\ubaa9'],
    ['settings', '\uc124\uc815 \u00b7 \ubc31\uc5c5', '\uc5d1\uc140, JSON'],
  ];
  main.innerHTML = '<div class="menu-list">' + items.map(([id, t, s]) =>
    '<button type="button" class="menu-list-item" data-nav="' + id + '">' +
    '<div><strong>' + t + '</strong><span>' + s + '</span></div><span class="menu-chevron">\u203a</span></button>'
  ).join('') + '</div>';
  main.querySelectorAll('[data-nav]').forEach((btn) => { btn.onclick = () => setRoute(btn.dataset.nav); });
}

export function renderAssetsV2(ctx) {
  const { data, main, pageTitle, persist } = ctx;
  const netWorth = getNetWorth(data);
  const liabilities = totalLiabilities(data);
  const summary = data.assets.summary || [];
  const accounts = data.assets.accounts || [];
  const savings = data.assets.savings || [];
  const investments = data.assets.investments || [];
  const loans = data.liabilities.loans.filter((l) => l.balance > 0 || l.lender);

  pageTitle.textContent = '\uc790\uc0b0';

  let summaryHtml = '';
  summary.filter((s) => s.balance && !/\ucd1d\uc790\uc0b0|\uc21c\uc790\uc0b0/.test(s.label || '')).forEach((s) => {
    summaryHtml += '<div class="asset-row"><div class="asset-name">' + escapeHtml(s.label) +
      '</div><div class="stat-value">' + formatWon(s.balance) + '</div></div>';
  });

  let accountHtml = accounts.length
    ? accounts.map((a) =>
      '<div class="asset-row" data-id="' + a.id + '"><div><div class="asset-name">' + escapeHtml(a.name) +
      '</div><div class="asset-sub">' + escapeHtml(a.institution) + ' \u00b7 ' + escapeHtml(a.owner) +
      '</div></div><div class="stat-value">' + formatWon(a.balance) + '</div></div>'
    ).join('')
    : '<p class="empty">\uacc4\uc88c \uc5c6\uc74c</p>';

  let loanHtml = loans.length
    ? loans.map((l) =>
      '<div class="asset-row"><div><div class="asset-name">' + escapeHtml(l.name) +
      '</div><div class="asset-sub">' + escapeHtml(l.lender) + '</div></div>' +
      '<div class="stat-value negative">' + formatWon(l.balance) + '</div></div>'
    ).join('')
    : '<p class="empty">\ub4f1\ub85d\ub41c \ub300\ucd9c \uc5c6\uc74c</p>';

  main.innerHTML =
    '<div class="hero-card hero-card-assets"><p class="hero-label">\uc21c\uc790\uc0b0</p>' +
    '<p class="hero-value">' + formatWon(netWorth) + '</p><p class="hint">\ubd80\ucc44 ' + formatWon(liabilities) + '</p></div>' +
    (summaryHtml ? '<div class="card"><div class="card-title">\uc790\uc0b0 \uad6c\uc131</div>' + summaryHtml + '</div>' : '') +
    '<div class="card"><div class="card-title-row"><span>\uacc4\uc88c</span><button type="button" class="link-btn" id="add-account">+ \ucd94\uac00</button></div>' +
    accountHtml + '</div>' +
    (savings.length ? '<div class="card"><div class="card-title">\uc801\uae08 ' + savings.length + '\uac1c</div>' +
      savings.map((s) => '<div class="asset-row"><div class="asset-name">' + escapeHtml(s.name) +
      '</div><div class="asset-sub">' + escapeHtml(s.institution) + '</div></div>').join('') + '</div>' : '') +
    (investments.length ? '<div class="card"><div class="card-title">\ud22c\uc790</div>' +
      investments.map((i) => '<div class="asset-row"><div class="asset-name">' + escapeHtml(i.name) +
      '</div><div class="stat-value">' + formatWon(i.balance) + '</div></div>').join('') + '</div>' : '') +
    '<div class="card"><div class="card-title">\ub300\ucd9c</div>' + loanHtml + '</div>';

  main.querySelector('#add-account')?.addEventListener('click', () => showAssetForm(ctx, 'accounts'));
  main.querySelectorAll('.asset-row[data-id]').forEach((row) => {
    row.onclick = () => {
      const a = accounts.find((x) => x.id === row.dataset.id);
      if (a) showAssetForm(ctx, 'accounts', a);
    };
  });
}

export function renderSettingsPage(ctx) {
  const { data, main, pageTitle, persist, setRoute } = ctx;
  const sync = data.settings.sync || {};
  pageTitle.textContent = '\uc124\uc815';
  main.innerHTML =
    '<form id="settings-page-form" class="settings-page">' +
    '<div class="card"><div class="card-title">\uae30\ubcf8</div>' +
    '<div class="form-group"><label>\uc6d4 \ubaa9\ud45c \uc800\ucd95\uc561</label><input name="monthlySavingsGoal" type="number" value="' + data.settings.monthlySavingsGoal + '" /></div>' +
    '<div class="form-group"><label>\uc774\ub984 (\uc27c\ud45c)</label><input name="names" value="' + escapeHtml(data.settings.names.join(', ')) + '" /></div>' +
    '<label class="checkbox-row"><input type="checkbox" name="autoCarryOver" ' + (data.settings.autoCarryOver ? 'checked' : '') + ' /> \uc804\uc6d4 \uc790\ub3d9 \uc774\uc6d4</label></div>' +
    '<div class="card"><div class="card-title">\ub370\uc774\ud130</div>' +
    '<a href="import.html" class="btn btn-primary block-link">\uc5d1\uc140 \uac00\uc838\uc624\uae30</a>' +
    '<button type="button" class="btn btn-outline block-btn" id="btn-export">JSON\ub0b4\ubcf4\ub0b4\uae30</button>' +
    '<label class="btn btn-outline file-label block-btn">JSON \uac00\uc838\uc624\uae30<input type="file" id="import-json" accept=".json" hidden /></label></div>' +
    '<div class="card"><div class="card-title">Firestore</div>' +
    '<label class="checkbox-row"><input type="checkbox" name="syncEnabled" ' + (sync.enabled ? 'checked' : '') + ' /> \uc0ac\uc6a9</label>' +
    '<div class="form-group"><label>API Key</label><input name="apiKey" value="' + escapeHtml(sync.apiKey || '') + '" /></div>' +
    '<div class="form-group"><label>Project ID</label><input name="projectId" value="' + escapeHtml(sync.projectId || '') + '" /></div>' +
    '<button type="button" class="btn btn-outline block-btn" id="btn-sync-pull">\ubd88\ub7ec\uc624\uae30</button>' +
    '<button type="button" class="btn btn-outline block-btn" id="btn-sync-push">\uc800\uc7a5\ud558\uae30</button></div>' +
    '<button type="submit" class="btn btn-primary block-btn">\uc800\uc7a5</button>' +
    '<button type="button" class="btn btn-outline block-btn" id="settings-back">\ub354\ubcf4\uae30\ub85c</button></form>';
  main.querySelector('#settings-back').onclick = () => setRoute('more');
  main.querySelector('#btn-export').onclick = () => exportJson(data);
  main.querySelector('#import-json').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    ctx.data = await importJsonFile(file);
    persist();
    alert('\uac00\uc838\uc624\uae30 \uc644\ub8cc');
  };
  main.querySelector('#btn-sync-pull').onclick = async () => {
    try {
      const remote = await pullFromCloud(data);
      if (remote) { ctx.data = remote; persist(); alert('\ubd88\ub7ec\uc654\uc2b5\ub2c8\ub2e4.'); }
    } catch (err) { alert(err.message); }
  };
  main.querySelector('#btn-sync-push').onclick = async () => {
    try { await pushToCloud(data); alert('\uc800\uc7a5\ud588\uc2b5\ub2c8\ub2e4.'); } catch (err) { alert(err.message); }
  };
  main.querySelector('#settings-page-form').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    data.settings.monthlySavingsGoal = parseAmount(fd.get('monthlySavingsGoal'));
    data.settings.names = fd.get('names').split(',').map((s) => s.trim()).filter(Boolean);
    data.settings.autoCarryOver = !!fd.get('autoCarryOver');
    if (!data.settings.sync) data.settings.sync = {};
    data.settings.sync.enabled = !!fd.get('syncEnabled');
    data.settings.sync.apiKey = fd.get('apiKey');
    data.settings.sync.projectId = fd.get('projectId');
    persist();
    alert('\uc800\uc7a5\ub428');
  };
}
