import { state } from '../state.js';
import {
  getVisibleCategories, getOwnerDisplayLabel, getOwnerMonthlySummary,
  getSubPayerLabel, hasSubItems,
  getMonthSavingsTotal, getCumulativeSavingsTotal, getCumulativeBudgetSavings,
  getMonthSavedBreakdown, getCumulativeSavedAmount,
} from '../store.js';
import {
  getCategoryPeriodSummary,
  getPeriodTotals,
  isRecordDue,
  canRecordActual,
  formatRecordOpensLabel,
  formatRecordOpensHint,
  getBudgetStart,
  isBeforeBudgetStart,
  getSubSummary,
} from '../budget-engine.js';
import { fmtShort, fmtPct, fmtMonth, fmtMoney } from '../format.js';
import { esc, emptyState } from '../ui.js';
import { budgetBar } from '../charts.js';
import {
  showCategoryManage,
  showMonthlyBudgetForm,
  showActualForm,
  showSubActualForm,
  showSubItemsCategoryPicker,
} from './modals.js';

function formatMonthDelta(delta) {
  if (delta == null) return { text: '—', cls: 'muted' };
  if (delta > 0) return { text: `+${fmtShort(delta)} 초과`, cls: 'danger' };
  if (delta < 0) return { text: `${fmtShort(-delta)} 절약`, cls: 'income' };
  return { text: '예산 내', cls: 'muted' };
}

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
  const recordHint = formatRecordOpensHint(data, y, m);
  const totals = getPeriodTotals(data, y, m, cats);
  const start = getBudgetStart(data);
  const beforeStart = isBeforeBudgetStart(data, y, m);

  const monthSavings = getMonthSavingsTotal(data, y, m);
  const monthSavedBreakdown = getMonthSavedBreakdown(data, y, m);
  const monthPrincipal = monthSavedBreakdown.principal;
  const monthInvest = monthSavedBreakdown.investIncome;
  const monthOverrun = monthSavedBreakdown.budgetOverrun;
  const monthAccumulated = monthSavedBreakdown.total;
  const cumSaved = getCumulativeBudgetSavings(data);
  const cumSavings = getCumulativeSavingsTotal(data);
  const cumAccumulated = getCumulativeSavedAmount(data);

  const savingsStatsCard = !beforeStart && data.budget?.setupDone ? `
    <section class="section">
      <div class="section-head"><h2>절약 & 모은 금액</h2></div>
      <p class="muted" style="font-size:12px;margin-bottom:10px">이번 달 = 저축 + 주택 원금 + 투자 수입 − 예산 초과(저축·원금 제외)</p>
      <div class="summary-row summary-row--quad">
        <div class="mini-card">
          <span>이번 달 모은 금액</span>
          <strong class="${monthAccumulated >= 0 ? 'income' : 'danger'}">${monthAccumulated >= 0 ? '+' : ''}${fmtShort(monthAccumulated)}</strong>
          <span class="mini-card-sub">${fmtMoney(monthAccumulated)}</span>
        </div>
        <div class="mini-card">
          <span>이번 달 저축</span>
          <strong class="income">${fmtShort(monthSavings)}</strong>
          <span class="mini-card-sub">저축 세부 실적</span>
        </div>
        <div class="mini-card">
          <span>이번 달 주택 원금</span>
          <strong class="income">${fmtShort(monthPrincipal)}</strong>
          <span class="mini-card-sub">주거 대출 원금 상환</span>
        </div>
        <div class="mini-card">
          <span>이번 달 예산 초과</span>
          <strong class="danger">−${fmtShort(monthOverrun)}</strong>
          <span class="mini-card-sub">저축·주택 원금 제외 · 예산 대비 초과분만</span>
        </div>
      </div>
      <div class="summary-row summary-row--quad" style="margin-top:10px">
        <div class="mini-card">
          <span>이번 달 투자 수입</span>
          <strong class="${monthInvest >= 0 ? 'income' : 'danger'}">${monthInvest >= 0 ? '+' : ''}${fmtShort(monthInvest)}</strong>
          <span class="mini-card-sub">자산 탭에서 직접 기록한 평가 손익</span>
        </div>
        <div class="mini-card">
          <span>누적 모은 금액</span>
          <strong class="${cumAccumulated >= 0 ? 'income' : 'danger'}">${fmtShort(cumAccumulated)}</strong>
          <span class="mini-card-sub">관리 시작 이래</span>
        </div>
        <div class="mini-card">
          <span>누적 절약</span>
          <strong class="${cumSaved >= 0 ? 'income' : 'danger'}">${fmtShort(cumSaved)}</strong>
          <span class="mini-card-sub">각 달 월 예산 − 실적 합계</span>
        </div>
        <div class="mini-card">
          <span>누적 저축</span>
          <strong class="income">${fmtShort(cumSavings)}</strong>
          <span class="mini-card-sub">저축 세부 실적 합계</span>
        </div>
      </div>
    </section>` : '';

  const preStartBanner = beforeStart && start
    ? `<p class="tip-banner">${fmtMonth(start.year, start.month)}부터 예산을 관리합니다. 이 달은 집계되지 않습니다.</p>`
    : '';

  const dueBanner = !beforeStart && totals.dueCount > 0
    ? `<button type="button" class="tip-banner" id="btn-record-due">📌 실적 입력 ${totals.dueCount}건 대기 · ${esc(recordHint)} 입력 가능</button>`
    : '';

  const ownerSummary = getOwnerMonthlySummary(data, y, m);

  const monthDeltaFmt = cats.some((c) => getCategoryPeriodSummary(data, y, m, c.id).hasActual)
    ? formatMonthDelta(totals.monthDelta)
    : { text: '—', cls: 'muted' };

  const catRows = cats.map((c) => {
    const s = getCategoryPeriodSummary(data, y, m, c.id);
    const opensLabel = formatRecordOpensLabel(data, c, y, m);
    const due = isRecordDue(data, y, m, c.id);
    const canEdit = !s.beforeStart && canRecordActual(data, y, m, c.id);
    const monthPct = s.monthlyPlanned > 0 ? s.actual / s.monthlyPlanned : 0;
    const statusClass = !s.hasActual ? 'pending' : monthPct > 1 ? 'over' : monthPct >= 0.9 ? 'warn' : 'ok';
    const monthDeltaFmt = formatMonthDelta(s.monthDelta);
    const subdivided = hasSubItems(data, c.id);
    const sub = subdivided ? getSubSummary(data, y, m, c.id) : null;
    const payerLabel = subdivided
      ? getSubPayerLabel(data, c.id)
      : getOwnerDisplayLabel(data, c.payer || 'joint');
    const recordLabel = subdivided
      ? (s.hasActual ? '세부 실적 수정' : '세부 실적 입력')
      : (s.hasActual ? '실적 수정' : '실적 입력');
    const recordBtn = subdivided
      ? `<button type="button" class="btn btn-sm ${due ? 'btn-primary' : 'btn-ghost'}" data-record-sub="${c.id}">${recordLabel}</button>`
      : `<button type="button" class="btn btn-sm ${due ? 'btn-primary' : 'btn-ghost'}" data-record-cat="${c.id}">${recordLabel}</button>`;
    return `
      <div class="budget-envelope budget-envelope--${statusClass}">
        <div class="budget-envelope-head">
          <div>
            <strong>${esc(c.name)}</strong>
            <span class="budget-envelope-meta">입력 ${esc(opensLabel)} · ${esc(payerLabel)} · 월 ${fmtShort(s.monthlyPlanned)}</span>
          </div>
          <div class="budget-envelope-badges">
            ${due ? '<span class="badge badge-proposed">입력 대기</span>' : ''}
            ${s.hasActual ? `<span class="badge badge-active">${fmtPct(monthPct)}</span>` : ''}
          </div>
        </div>
        <div class="budget-envelope-grid budget-envelope-grid--4">
          <div><span class="lbl">월 예산</span><span>${fmtShort(s.monthlyPlanned)}</span></div>
          <div><span class="lbl">실적</span><strong class="${s.hasActual ? '' : 'muted'}">${s.hasActual ? fmtShort(s.actual) : '—'}</strong></div>
          <div><span class="lbl">당월 차이</span><strong class="${monthDeltaFmt.cls}">${monthDeltaFmt.text}</strong></div>
          <div><span class="lbl">잔액</span><strong class="${s.remaining >= 0 ? 'income' : 'danger'}">${fmtShort(s.remaining)}</strong></div>
        </div>
        ${sub ? `<p class="budget-savings-hint muted">${sub.filledCount}/${sub.itemCount}개 항목 입력 · 합계 ${fmtShort(sub.total)}</p>` : ''}
        ${budgetBar(s.actual, s.monthlyPlanned, '#1a5c44')}
        <p class="budget-bar-caption muted">월 예산 대비 사용 ${fmtShort(s.actual)} / ${fmtShort(s.monthlyPlanned)}</p>
        <div class="budget-envelope-foot">
          ${canEdit ? recordBtn : s.beforeStart ? '<span class="muted">관리 시작 전</span>' : '<span class="muted">입력 시점 이후</span>'}
        </div>
      </div>`;
  }).join('');

  return `
    ${preStartBanner}
    ${dueBanner}
    <p class="month-label">${fmtMonth(y, m)} · 예산 vs 실적${start ? ` · 시작 ${fmtMonth(start.year, start.month)}` : ''}</p>

    <section class="summary-row">
      <div class="mini-card"><span>월 예산 합계</span><strong>${fmtShort(totals.planned)}</strong></div>
      <div class="mini-card"><span>당월 초과/절약</span><strong class="${monthDeltaFmt.cls}">${monthDeltaFmt.text}</strong></div>
      <div class="mini-card"><span>실적 합계</span><strong class="${totals.actual > totals.planned ? 'danger' : ''}">${fmtShort(totals.actual)}</strong></div>
      <div class="mini-card"><span>잔액 합계</span><strong class="${totals.remaining >= 0 ? 'income' : 'danger'}">${fmtShort(totals.remaining)}</strong></div>
    </section>

    ${savingsStatsCard}

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
          <button type="button" class="text-btn" id="btn-sub-items">세부 나누기</button>
          <button type="button" class="text-btn" id="btn-edit-monthly">월간 예산</button>
        </div>
      </div>
      ${cats.length ? catRows : emptyState('📋', '항목이 없어요', '처음 설정을 다시 진행해 보세요', '항목 설정', 'btn-setup-again')}
    </section>

    <section class="section">
      <div class="section-head"><h2>이용 방법</h2></div>
      <ol class="setup-flow-list compact">
        <li>항목별 <strong>월간 예산</strong>을 설정합니다</li>
        <li>설정한 시점 이후 항목별 <strong>실적</strong>을 입력하세요</li>
        <li>월 예산과 실적 차이가 <strong>절약</strong>으로 집계됩니다</li>
      </ol>
    </section>`;
}

export function bindBudget() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  const { selectedYear: y, selectedMonth: m } = state;

  document.getElementById('btn-categories')?.addEventListener('click', () => showCategoryManage(rerender));
  document.getElementById('btn-sub-items')?.addEventListener('click', () => showSubItemsCategoryPicker(rerender));
  document.getElementById('btn-edit-monthly')?.addEventListener('click', () => showMonthlyBudgetForm(y, m, rerender));
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
  document.querySelectorAll('[data-record-sub]').forEach((btn) => {
    btn.addEventListener('click', () => showSubActualForm(btn.dataset.recordSub, y, m, rerender));
  });
}
