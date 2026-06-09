import { state } from '../state.js';
import { getVisibleCategories, getOwnerDisplayLabel, getOwnerMonthlySummary, getSavingsPayerLabel } from '../store.js';
import {
  getCategoryPeriodSummary,
  getPeriodTotals,
  isRecordDue,
  canRecordActual,
  getRecordDay,
  getBudgetStart,
  isBeforeBudgetStart,
  getSavingsSubSummary,
} from '../budget-engine.js';
import { fmtShort, fmtPct, fmtMonth } from '../format.js';
import { esc, emptyState } from '../ui.js';
import { budgetBar } from '../charts.js';
import {
  showCategoryManage,
  showMonthlyBudgetForm,
  showActualForm,
  showSavingsActualForm,
} from './modals.js';

function ownerUsageRows(data, year, month) {
  const { income, expense } = getOwnerMonthlySummary(data, year, month);
  const max = Math.max(income.self, income.spouse, expense.self, expense.spouse, expense.joint, 1);
  const rows = [
    { id: 'self', label: getOwnerDisplayLabel(data, 'self'), amount: expense.self, color: 'var(--primary)' },
    { id: 'spouse', label: getOwnerDisplayLabel(data, 'spouse'), amount: expense.spouse, color: '#3d6b8a' },
    { id: 'joint', label: getOwnerDisplayLabel(data, 'joint'), amount: expense.joint, color: '#8a6b3d' },
  ];
  return rows.map((r) => {
    const pct = max > 0 ? Math.round((r.amount / max) * 100) : 0;
    return `<div class="owner-row">
      <span>${esc(r.label)}</span>
      <div class="owner-track"><div class="owner-fill" style="width:${pct}%;background:${r.color}"></div></div>
      <span class="owner-amt">${fmtShort(r.amount)}</span>
    </div>`;
  }).join('');
}

export function renderBudget() {
  const { data, selectedYear: y, selectedMonth: m } = state;
  const cats = getVisibleCategories(data);
  const recordDay = data.budget.defaultRecordDay ?? 25;
  const totals = getPeriodTotals(data, y, m, cats);
  const start = getBudgetStart(data);
  const beforeStart = isBeforeBudgetStart(data, y, m);
  const preStartBanner = beforeStart && start
    ? `<p class="tip-banner">${fmtMonth(start.year, start.month)}부터 예산을 관리합니다. 이 달은 집계되지 않습니다.</p>`
    : '';

  const dueBanner = !beforeStart && totals.dueCount > 0
    ? `<button type="button" class="tip-banner" id="btn-record-due">📌 실적 입력 ${totals.dueCount}건 대기 · ${recordDay}일부터 입력 가능</button>`
    : '';

  const ownerSummary = getOwnerMonthlySummary(data, y, m);

  const catRows = cats.map((c) => {
    const s = getCategoryPeriodSummary(data, y, m, c.id);
    const day = getRecordDay(data, c);
    const due = isRecordDue(data, y, m, c.id);
    const canEdit = !s.beforeStart && canRecordActual(data, y, m, c.id);
    const pct = s.available > 0 ? s.actual / s.available : 0;
    const statusClass = !s.hasActual ? 'pending' : pct > 1 ? 'over' : pct >= 0.9 ? 'warn' : 'ok';
    const isSavings = c.name === '저축';
    const sub = isSavings ? getSavingsSubSummary(data, y, m) : null;
    const payerLabel = isSavings ? getSavingsPayerLabel(data) : getOwnerDisplayLabel(data, c.payer || 'joint');
    const recordLabel = isSavings
      ? (s.hasActual ? '저축 실적 수정' : '저축 실적 입력')
      : (s.hasActual ? '실적 수정' : '실적 입력');
    const recordBtn = isSavings
      ? `<button type="button" class="btn btn-sm ${due ? 'btn-primary' : 'btn-ghost'}" data-record-savings>${recordLabel}</button>`
      : `<button type="button" class="btn btn-sm ${due ? 'btn-primary' : 'btn-ghost'}" data-record-cat="${c.id}">${recordLabel}</button>`;
    return `
      <div class="budget-envelope budget-envelope--${statusClass}">
        <div class="budget-envelope-head">
          <div>
            <strong>${esc(c.name)}</strong>
            <span class="budget-envelope-meta">정산 ${day}일 · ${esc(payerLabel)} · 월 ${fmtShort(s.monthlyPlanned)}</span>
          </div>
          <div class="budget-envelope-badges">
            ${due ? '<span class="badge badge-proposed">입력 대기</span>' : ''}
            ${s.hasActual ? `<span class="badge badge-active">${fmtPct(pct)}</span>` : ''}
          </div>
        </div>
        <div class="budget-envelope-grid">
          <div><span class="lbl">월 예산</span><span>${fmtShort(s.monthlyPlanned)}</span></div>
          <div><span class="lbl">이월</span><span class="${s.rolloverIn >= 0 ? 'income' : 'danger'}">${s.rolloverIn >= 0 ? '+' : ''}${fmtShort(s.rolloverIn)}</span></div>
          <div><span class="lbl">사용 가능</span><strong>${fmtShort(s.available)}</strong></div>
          <div><span class="lbl">실적</span><strong class="${s.hasActual ? '' : 'muted'}">${s.hasActual ? fmtShort(s.actual) : '—'}</strong></div>
        </div>
        ${sub ? `<p class="budget-savings-hint muted">${sub.filledCount}/${sub.itemCount}개 항목 입력 · 합계 ${fmtShort(sub.total)}</p>` : ''}
        ${budgetBar(s.actual, s.available, '#1a5c44')}
        <div class="budget-envelope-foot">
          <span class="${s.remaining >= 0 ? 'income' : 'danger'}">잔액 ${fmtShort(s.remaining)}</span>
          ${s.remaining > 0 && s.hasActual ? '<span class="muted">→ 다음 달 이월</span>' : ''}
          ${canEdit ? recordBtn : s.beforeStart ? '<span class="muted">관리 시작 전</span>' : '<span class="muted">정산일 이후 입력</span>'}
        </div>
      </div>`;
  }).join('');

  return `
    ${preStartBanner}
    ${dueBanner}
    <p class="month-label">${fmtMonth(y, m)} · 예산 vs 실적${start ? ` · 시작 ${fmtMonth(start.year, start.month)}` : ''}</p>

    <section class="summary-row">
      <div class="mini-card"><span>월 예산 합계</span><strong>${fmtShort(totals.planned)}</strong></div>
      <div class="mini-card"><span>이월 포함</span><strong>${fmtShort(totals.available)}</strong></div>
      <div class="mini-card"><span>실적 합계</span><strong class="${totals.actual > totals.available ? 'danger' : ''}">${fmtShort(totals.actual)}</strong></div>
    </section>
    <section class="hero-card small rollover-card">
      <p class="hero-label">이번 달 잔액 (다음 달 이월 예정)</p>
      <p class="hero-value ${totals.remaining >= 0 ? 'up' : 'down'}">${fmtShort(totals.remaining)}</p>
      <p class="hero-sub">이월 반영 ${fmtShort(totals.rolloverIn)} · 실적 ${fmtShort(totals.actual)}</p>
    </section>

    <section class="section">
      <div class="section-head"><h2>이번 달 부담자별 사용</h2></div>
      ${ownerUsageRows(data, y, m)}
      <div class="summary-row" style="margin-top:10px">
        <div class="mini-card"><span>${esc(getOwnerDisplayLabel(data, 'self'))} 수입</span><strong class="income">${fmtShort(ownerSummary.income.self)}</strong></div>
        <div class="mini-card"><span>${esc(getOwnerDisplayLabel(data, 'spouse'))} 수입</span><strong class="income">${fmtShort(ownerSummary.income.spouse)}</strong></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>항목별 비교</h2>
        <div class="btn-row-inline">
          <button type="button" class="text-btn" id="btn-categories">항목</button>
          <button type="button" class="text-btn" id="btn-edit-monthly">월간 예산</button>
        </div>
      </div>
      ${cats.length ? catRows : emptyState('📋', '항목이 없어요', '처음 설정을 다시 진행해 보세요', '항목 설정', 'btn-setup-again')}
    </section>

    <section class="section">
      <div class="section-head"><h2>이용 방법</h2></div>
      <ol class="setup-flow-list compact">
        <li>항목별 <strong>월간 예산</strong>을 설정합니다</li>
        <li>시작 월 이후, 전월 잔액이 이번 달 <strong>이월</strong>로 더해집니다</li>
        <li>정산일 이후 항목별 <strong>실적</strong>을 입력하세요</li>
      </ol>
    </section>`;
}

export function bindBudget() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  const { selectedYear: y, selectedMonth: m } = state;

  document.getElementById('btn-categories')?.addEventListener('click', () => showCategoryManage(rerender));
  document.getElementById('btn-edit-monthly')?.addEventListener('click', () => showMonthlyBudgetForm(y, rerender));
  document.getElementById('btn-setup-again')?.addEventListener('click', () => {
    state.data.budget.setupDone = false;
    state.setupStep = 1;
    rerender();
  });
  document.getElementById('btn-record-due')?.addEventListener('click', () => {
    const due = getVisibleCategories(state.data).find((c) => isRecordDue(state.data, y, m, c.id));
    if (due) showActualForm(due.id, y, m, rerender);
  });
  document.querySelectorAll('[data-record-cat]').forEach((btn) => {
    btn.addEventListener('click', () => showActualForm(btn.dataset.recordCat, y, m, rerender));
  });
  document.querySelectorAll('[data-record-savings]').forEach((btn) => {
    btn.addEventListener('click', () => showSavingsActualForm(y, m, rerender));
  });
}
