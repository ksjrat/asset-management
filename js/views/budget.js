import { state } from '../state.js';
import { getVisibleCategories, getMonthBudget, getMonthTransactions, getCategorySpend } from '../store.js';
import { fmtMoney, fmtDate, fmtShort } from '../format.js';
import { esc, emptyState } from '../ui.js';
import { budgetBar } from '../charts.js';
import { showTxForm, showBudgetForm } from './modals.js';

export function renderBudget() {
  const { data, selectedYear: y, selectedMonth: m, txSearch, txFilter } = state;
  const mb = getMonthBudget(data, y, m);
  const spend = getCategorySpend(data, y, m);
  let txs = getMonthTransactions(data, y, m);
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const cats = getVisibleCategories(data);

  if (txFilter !== 'all') txs = txs.filter((t) => t.type === txFilter);
  if (txSearch.trim()) {
    const q = txSearch.trim().toLowerCase();
    txs = txs.filter((t) => {
      const cat = cats.find((c) => c.id === t.categoryId);
      return (cat?.name || '').toLowerCase().includes(q)
        || (t.memo || '').toLowerCase().includes(q)
        || String(t.amount).includes(q);
    });
  }

  const catRows = cats.map((c) => {
    const budget = mb[c.id] || 0;
    const used = spend[c.id] || 0;
    const pct = budget > 0 ? used / budget : 0;
    return `<div class="budget-row">
      <div class="budget-head"><span>${esc(c.name)}</span><span class="${pct >= 1 ? 'danger-text' : ''}">${fmtShort(used)} / ${fmtShort(budget)}</span></div>
      ${budgetBar(used, budget, '#1e4d3a')}
      ${pct >= 0.8 ? `<p class="budget-warn">${pct >= 1 ? '⚠ 예산 초과' : '⚠ 80% 사용'}</p>` : ''}
    </div>`;
  }).join('');

  const txRows = txs.sort((a, b) => b.date.localeCompare(a.date)).map((t) => {
    const cat = cats.find((c) => c.id === t.categoryId);
    return `<button type="button" class="list-item" data-tx-id="${t.id}">
      <span class="list-icon">${t.type === 'income' ? '📥' : '📤'}</span>
      <span class="list-body">
        <span class="list-title">${esc(cat?.name || '기타')}${t.shared ? ' · 공동' : ''}</span>
        <span class="list-meta">${fmtDate(t.date)} · ${esc(t.memo || t.paymentMethod || '')}</span>
      </span>
      <span class="list-amount ${t.type === 'income' ? 'income' : ''}">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount)}</span>
    </button>`;
  }).join('');

  const seg = (id, label) =>
    `<button type="button" class="seg-btn ${txFilter === id ? 'active' : ''}" data-tx-filter="${id}">${label}</button>`;

  return `
    <section class="summary-row">
      <div class="mini-card"><span>수입</span><strong class="income">${fmtShort(income)}</strong></div>
      <div class="mini-card"><span>지출</span><strong class="danger">${fmtShort(expense)}</strong></div>
      <div class="mini-card"><span>잔액</span><strong class="${income - expense >= 0 ? 'income' : 'danger'}">${fmtShort(income - expense)}</strong></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>카테고리 예산</h2>
        <button type="button" class="text-btn" id="btn-edit-budget">설정</button></div>
      ${catRows}
    </section>

    <section class="section">
      <div class="section-head"><h2>거래 내역</h2></div>
      <div class="search-row">
        <input type="search" class="input search-input" id="tx-search" placeholder="메모·카테고리·금액 검색" value="${esc(txSearch)}" />
      </div>
      <div class="seg-control">${seg('all', '전체')}${seg('expense', '지출')}${seg('income', '수입')}</div>
      <div class="list-group">
        ${txRows || emptyState('📝', '거래가 없어요', txSearch ? '검색어를 바꿔 보세요' : '지출·수입을 기록해 보세요', txSearch ? '' : '지출 입력', txSearch ? '' : 'empty-add-expense')}
      </div>
    </section>`;
}

export function bindBudget() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  const { selectedYear: y, selectedMonth: m } = state;

  document.getElementById('btn-edit-budget')?.addEventListener('click', () => showBudgetForm(y, m, rerender));
  document.getElementById('empty-add-expense')?.addEventListener('click', () => showTxForm('expense', null, rerender));

  const search = document.getElementById('tx-search');
  let searchTimer;
  search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.txSearch = search.value;
      rerender();
    }, 280);
  });

  document.querySelectorAll('[data-tx-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      state.txFilter = b.dataset.txFilter;
      rerender();
    });
  });

  document.querySelectorAll('[data-tx-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const t = state.data.transactions.find((x) => x.id === b.dataset.txId);
      if (t) showTxForm(t.type, t, rerender);
    });
  });
}
