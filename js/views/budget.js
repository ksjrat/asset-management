import { state, persist } from '../state.js';
import { getVisibleCategories, getMonthBudget, getMonthTransactions, getCategorySpend } from '../store.js';
import { fmtMoney, fmtDate, fmtMonth, fmtShort } from '../format.js';
import { esc } from '../ui.js';
import { budgetBar } from '../charts.js';
import { openModal, toast, formField } from '../ui.js';
import { showTxForm, showBudgetForm } from './modals.js';

export function renderBudget() {
  const { data, selectedYear: y, selectedMonth: m } = state;
  const mb = getMonthBudget(data, y, m);
  const spend = getCategorySpend(data, y, m);
  const txs = getMonthTransactions(data, y, m);
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const cats = getVisibleCategories(data);

  const catRows = cats.map((c) => {
    const budget = mb[c.id] || 0;
    const used = spend[c.id] || 0;
    const pct = budget > 0 ? used / budget : 0;
    return `<div class="budget-row">
      <div class="budget-head"><span>${esc(c.name)}</span><span>${fmtShort(used)} / ${fmtShort(budget)}</span></div>
      ${budgetBar(used, budget, '#1e4d3a')}
      ${pct >= 0.8 ? `<p class="budget-warn">${pct >= 1 ? '예산 초과!' : '80% 도달'}</p>` : ''}
    </div>`;
  }).join('');

  const txRows = txs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((t) => {
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

  return `
    <p class="month-label">${fmtMonth(y, m)}</p>
    <section class="summary-row">
      <div class="mini-card"><span>수입</span><strong class="income">${fmtShort(income)}</strong></div>
      <div class="mini-card"><span>지출</span><strong class="danger">${fmtShort(expense)}</strong></div>
      <div class="mini-card"><span>잔액</span><strong>${fmtShort(income - expense)}</strong></div>
    </section>
    <section class="section">
      <div class="section-head"><h2>카테고리 예산</h2>
        <button type="button" class="text-btn" id="btn-edit-budget">설정</button></div>
      ${catRows}
    </section>
    <section class="section">
      <div class="section-head"><h2>거래 내역</h2>
        <div class="btn-row-inline">
          <button type="button" class="text-btn" id="btn-add-expense">지출</button>
          <button type="button" class="text-btn" id="btn-add-income">수입</button>
          <button type="button" class="text-btn" id="btn-add-recurring">반복</button>
        </div>
      </div>
      <div class="list-group">${txRows || '<p class="empty">거래 내역이 없습니다</p>'}</div>
    </section>`;
}

export function bindBudget() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  const { selectedYear: y, selectedMonth: m } = state;

  document.getElementById('btn-edit-budget')?.addEventListener('click', () => showBudgetForm(y, m, rerender));
  document.getElementById('btn-add-expense')?.addEventListener('click', () => showTxForm('expense', null, rerender));
  document.getElementById('btn-add-income')?.addEventListener('click', () => showTxForm('income', null, rerender));
  document.getElementById('btn-add-recurring')?.addEventListener('click', async () => {
    const res = await openModal({
      title: '반복 거래 등록',
      body: `<form id="rec-form" class="form-stack">
        ${formField('이름', '<input class="input" name="name" required placeholder="월세, 구독료..." />')}
        ${formField('금액', '<input class="input" name="amount" type="number" required />')}
        ${formField('주기', '<select name="freq" class="input"><option value="monthly">매월</option></select>')}
        ${formField('유형', '<select name="type" class="input"><option value="expense">지출</option><option value="income">수입</option></select>')}
      </form>`,
      actions: [{ label: '취소', value: null }, { label: '등록', value: 'save', primary: true }],
    });
    if (res !== 'save') return;
    const fd = new FormData(document.getElementById('rec-form'));
    const cats = getVisibleCategories(state.data);
    const recId = `${Date.now()}`;
    state.data.recurring.push({
      id: recId, name: fd.get('name'), amount: Number(fd.get('amount')),
      frequency: 'monthly', type: fd.get('type'), categoryId: cats[0]?.id,
    });
    state.data.transactions.push({
      id: recId, date: new Date().toISOString().slice(0, 10),
      amount: Number(fd.get('amount')), type: fd.get('type'),
      categoryId: cats[0]?.id, memo: `${fd.get('name')} (자동)`,
      shared: true, createdBy: 'system', recurringId: recId,
    });
    persist(); toast('반복 거래가 등록되었습니다', 'success'); rerender();
  });
  document.querySelectorAll('[data-tx-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const t = state.data.transactions.find((x) => x.id === b.dataset.txId);
      if (t) showTxForm(t.type, t, rerender);
    });
  });
}
