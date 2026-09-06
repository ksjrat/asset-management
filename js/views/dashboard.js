import { state, persist, setTab, setMonth } from '../state.js';
import {
  computeNetWorth,
  getVisibleHomeOwnerFilters,
  getVisibleCategories,
  getHomeSummaryMonth,
  getCategoryBudgetOveruse,
  prevYm,
  setHomeOwnerFilter,
  getMonthSavedBreakdown,
  getCumulativeSavedAmount,
  getMonthlySavedSeries,
} from '../store.js';
import { fmtMoney, fmtPct, fmtShort, fmtMonth } from '../format.js';
import { lineChart, legend, budgetBar } from '../charts.js';
import { toast, esc } from '../ui.js';
import { needsLinkAttention, openLinkWizard } from '../link-wizard.js';
import { getPeriodTotals, isRecordDue, formatRecordOpensHint } from '../budget-engine.js';

function momBadge(delta, inverse = false) {
  if (!delta) return '';
  const good = inverse ? delta < 0 : delta > 0;
  const cls = good ? 'up' : 'down';
  return `<span class="mom-badge ${cls}">${delta >= 0 ? '+' : ''}${fmtShort(delta)}</span>`;
}

export function renderDashboard() {
  const { data } = state;
  const { year: sy, month: sm } = getHomeSummaryMonth(data);
  const prev = prevYm(sy, sm);

  const visibleOwnerFilters = getVisibleHomeOwnerFilters(data);
  if (!visibleOwnerFilters.some((o) => o.id === state.ownerFilter)) {
    state.ownerFilter = setHomeOwnerFilter(data, visibleOwnerFilters[0]?.id || 'all');
  }
  const ownerFilter = state.ownerFilter;
  const nw = computeNetWorth(data, ownerFilter);

  const saved = getMonthSavedBreakdown(data, sy, sm);
  const prevSaved = getMonthSavedBreakdown(data, prev.year, prev.month);
  const cumSaved = getCumulativeSavedAmount(data);
  const savedDelta = saved.total - prevSaved.total;
  const chartRows = getMonthlySavedSeries(data, 12);
  const chartPts = chartRows.map((r) => ({ label: `${r.month}월`, value: r.total }));

  const ownerChipRow = visibleOwnerFilters.length > 1
    ? `<div class="chip-row">${visibleOwnerFilters.map((o) =>
      `<button type="button" class="chip ${ownerFilter === o.id ? 'active' : ''}" data-owner="${o.id}">${o.label}</button>`
    ).join('')}</div>`
    : '';

  const cats = getVisibleCategories(data);
  const budgetTotals = data.budget?.setupDone
    ? getPeriodTotals(data, sy, sm, cats)
    : { available: 0, actual: 0, remaining: 0, dueCount: 0 };
  const budgetUsedPct = budgetTotals.available > 0
    ? budgetTotals.actual / budgetTotals.available
    : 0;
  const dueCats = cats.filter((c) => isRecordDue(data, sy, sm, c.id));
  const recordHint = formatRecordOpensHint(data, sy, sm);

  const proposedGoals = data.goals.filter((g) => g.status === 'proposed').length;
  const budgetOveruse = data.budget?.setupDone
    ? getCategoryBudgetOveruse(data, sy, sm)
    : [];

  const dueBanner = data.budget?.setupDone && dueCats.length > 0
    ? `<button type="button" class="tip-banner" id="btn-home-record-due">
        📌 ${esc(fmtMonth(sy, sm))} 실적 입력 ${dueCats.length}건 · ${esc(recordHint)} · 지금 입력
      </button>`
    : '';

  const budgetSection = data.budget?.setupDone ? `
    <section class="section">
      <div class="section-head">
        <h2>예산 진행</h2>
        <button type="button" class="text-btn" id="btn-go-expense">지출 탭</button>
      </div>
      <p class="month-label">${fmtMonth(sy, sm)} · 사용 ${fmtPct(budgetUsedPct)}</p>
      ${budgetBar(budgetTotals.actual, budgetTotals.available, '#1a5c44')}
      <div class="summary-row" style="margin-top:10px">
        <div class="mini-card"><span>사용 가능</span><strong>${fmtShort(budgetTotals.available)}</strong></div>
        <div class="mini-card"><span>실적</span><strong class="${budgetUsedPct > 1 ? 'danger' : ''}">${fmtShort(budgetTotals.actual)}</strong></div>
        <div class="mini-card"><span>잔액</span><strong class="${budgetTotals.remaining >= 0 ? 'income' : 'danger'}">${fmtShort(budgetTotals.remaining)}</strong></div>
      </div>
    </section>` : '';

  const budgetOveruseSection = budgetOveruse.length ? `
    <section class="section">
      <div class="section-head"><h2>예산 대비 많이 쓴 항목</h2></div>
      <p class="month-label">${fmtMonth(sy, sm)} · 사용률 높은 순</p>
      <div class="spend-delta-list">
        ${budgetOveruse.map((r) => `
          <div class="spend-delta-row">
            <span class="spend-delta-name">${esc(r.name)}</span>
            <span class="spend-delta-detail muted">${fmtShort(r.actual)} / ${fmtShort(r.available)}</span>
            <span class="spend-delta-change ${r.usedPct > 1 ? 'up' : ''}">${fmtPct(r.usedPct)}</span>
          </div>`).join('')}
      </div>
    </section>` : '';

  const heroSub = chartRows.length
    ? `${fmtMonth(sy, sm)} ${saved.total >= 0 ? '+' : ''}${fmtShort(saved.total)} ${momBadge(savedDelta)}`
    : '수입·저축·주택 원금·투자 수입·예산 실적을 입력하면 집계됩니다';

  return `
    ${needsLinkAttention() ? '<button type="button" class="tip-banner" id="btn-link-setup">📱 PC·폰·배우자 연동 마무리 · 연동 도우미</button>' : ''}
    ${proposedGoals ? `<button type="button" class="tip-banner" id="btn-proposed-goals">🎯 배우자 목표 제안 ${proposedGoals}건 · 확인하기</button>` : ''}
    ${dueBanner}

    <section class="hero-card">
      <p class="hero-label">관리 시작 이래 모은 금액</p>
      <p class="hero-value">${fmtMoney(cumSaved)}</p>
      <p class="hero-sub ${saved.total >= 0 ? 'up' : saved.total < 0 ? 'down' : ''}">
        ${heroSub}
      </p>
      <p class="muted" style="font-size:12px;margin-top:6px">순자산 ${fmtMoney(nw.net)} · 총자산 ${fmtShort(nw.assets)} · 부채 ${fmtShort(nw.liabilities)}</p>
    </section>

    <section class="section">
      <div class="section-head"><h2>${fmtMonth(sy, sm)} 모은 금액</h2></div>
      <p class="muted" style="font-size:12px;margin-bottom:10px">수입 + 저축 + 주택 대출 원금 + 투자 수입 − 예산 실적</p>
      <div class="summary-row summary-row--quad">
        <div class="mini-card">
          <span>수입</span>
          <strong class="income">${fmtShort(saved.income)}</strong>
        </div>
        <div class="mini-card">
          <span>저축</span>
          <strong class="income">${fmtShort(saved.savings)}</strong>
        </div>
        <div class="mini-card">
          <span>주택 원금</span>
          <strong class="income">${fmtShort(saved.principal)}</strong>
        </div>
        <div class="mini-card">
          <span>투자 수입</span>
          <strong class="${saved.investIncome >= 0 ? 'income' : 'danger'}">${saved.investIncome >= 0 ? '+' : ''}${fmtShort(saved.investIncome)}</strong>
        </div>
      </div>
      <div class="summary-row" style="margin-top:10px">
        <div class="mini-card">
          <span>예산 실적</span>
          <strong class="danger">−${fmtShort(saved.budgetActual)}</strong>
        </div>
        <div class="mini-card">
          <span>이번 달 합계</span>
          <strong class="${saved.total >= 0 ? 'income' : 'danger'}">${saved.total >= 0 ? '+' : ''}${fmtMoney(saved.total)}</strong>
        </div>
      </div>
    </section>

    ${budgetOveruseSection}

    ${budgetSection}

    ${ownerChipRow}

    <section class="section">
      <div class="section-head"><h2>월별 모은 금액</h2></div>
      ${chartPts.length ? lineChart(chartPts) : '<p class="muted">입력된 달이 쌓이면 추이가 표시됩니다.</p>'}
      ${chartPts.length ? legend([{ label: '모은 금액', value: saved.total, color: '#1e4d3a' }]) : ''}
    </section>`;
}

export function bindDashboard() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  const { year: sy, month: sm } = getHomeSummaryMonth(state.data);

  document.querySelectorAll('[data-owner]').forEach((b) => {
    b.addEventListener('click', () => {
      state.ownerFilter = setHomeOwnerFilter(state.data, b.dataset.owner);
      persist();
      rerender();
    });
  });
  document.getElementById('btn-link-setup')?.addEventListener('click', () => openLinkWizard());
  document.getElementById('btn-proposed-goals')?.addEventListener('click', () => {
    setTab('settings');
    state.settingsSubView = 'goals';
    rerender();
  });
  document.getElementById('btn-home-record-due')?.addEventListener('click', async () => {
    const { showDueActualForms } = await import('./modals.js');
    const cats = getVisibleCategories(state.data);
    const due = cats.find((c) => isRecordDue(state.data, sy, sm, c.id));
    if (due) {
      setMonth(sy, sm);
      await showDueActualForms(sy, sm, rerender);
    } else toast('입력 대기 항목이 없거나 정산일 이전입니다', 'info');
  });
  document.getElementById('btn-go-expense')?.addEventListener('click', () => {
    setMonth(sy, sm);
    setTab('expense');
    rerender();
  });
}
