import { state, persist, setTab, setMonth } from '../state.js';
import {
  computeNetWorth,
  createSnapshot,
  getVisibleHomeOwnerFilters,
  getMonthCashflowSummary,
  getVisibleCategories,
  getOwnerDisplayLabel,
  getOwnerMonthlySummary,
  getHomeSummaryMonth,
  getSnapshotAtMonth,
  getPreviousSnapshot,
  getCategorySpendComparison,
  prevYm,
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
    state.ownerFilter = visibleOwnerFilters[0]?.id || 'all';
  }
  const ownerFilter = state.ownerFilter;
  const nw = computeNetWorth(data, ownerFilter);

  const snaps = [...data.assets.snapshots]
    .sort((a, b) => a.year - b.year || a.month - b.month).slice(-6);
  if (!snaps.length && data.assets.items.length) {
    createSnapshot(data, sy, sm);
    persist();
  }
  const chartPts = snaps.map((s) => ({ label: `${s.month}월`, value: s.net }));

  const summarySnap = getSnapshotAtMonth(data, sy, sm);
  const prevSnap = getPreviousSnapshot(data, sy, sm);
  let nwDelta = null;
  let nwDeltaPct = 0;
  if (summarySnap && prevSnap) {
    nwDelta = summarySnap.net - prevSnap.net;
    nwDeltaPct = prevSnap.net ? nwDelta / Math.abs(prevSnap.net) : 0;
  } else if (prevSnap) {
    nwDelta = nw.net - prevSnap.net;
    nwDeltaPct = prevSnap.net ? nwDelta / Math.abs(prevSnap.net) : 0;
  }

  const ownerChipRow = visibleOwnerFilters.length > 1
    ? `<div class="chip-row">${visibleOwnerFilters.map((o) =>
      `<button type="button" class="chip ${ownerFilter === o.id ? 'active' : ''}" data-owner="${o.id}">${o.label}</button>`
    ).join('')}</div>`
    : '';

  const flow = getMonthCashflowSummary(data, sy, sm);
  const prevFlow = getMonthCashflowSummary(data, prev.year, prev.month);
  const ownerSummary = getOwnerMonthlySummary(data, sy, sm);
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
  const impliedChange = flow.income - flow.expense + flow.savings + flow.investPnL;
  const spendDeltas = getCategorySpendComparison(data, sy, sm);

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

  const spendDeltaSection = spendDeltas.length ? `
    <section class="section">
      <div class="section-head"><h2>지출이 늘어난 항목</h2></div>
      <p class="month-label">전월(${fmtMonth(prev.year, prev.month)}) 대비 · ${fmtMonth(sy, sm)}</p>
      <div class="spend-delta-list">
        ${spendDeltas.map((r) => `
          <div class="spend-delta-row">
            <span class="spend-delta-name">${esc(r.name)}</span>
            <span class="spend-delta-change up">+${fmtShort(r.delta)}</span>
            <span class="spend-delta-detail muted">${fmtShort(r.previous)} → ${fmtShort(r.current)}</span>
          </div>`).join('')}
      </div>
    </section>` : '';

  const heroSub = nwDelta != null
    ? `${fmtMonth(sy, sm)} 순자산 ${nwDelta >= 0 ? '+' : ''}${fmtShort(nwDelta)} (${fmtPct(nwDeltaPct)})`
    : '첫 기록 — 스냅샷으로 추이를 쌓아보세요';

  return `
    ${needsLinkAttention() ? '<button type="button" class="tip-banner" id="btn-link-setup">📱 PC·폰·배우자 연동 마무리 · 연동 도우미</button>' : ''}
    ${proposedGoals ? `<button type="button" class="tip-banner" id="btn-proposed-goals">🎯 배우자 목표 제안 ${proposedGoals}건 · 확인하기</button>` : ''}
    ${dueBanner}

    <section class="hero-card">
      <p class="hero-label">순자산 · 현재</p>
      <p class="hero-value">${fmtMoney(nw.net)}</p>
      <p class="hero-sub ${nwDelta != null && nwDelta >= 0 ? 'up' : nwDelta != null ? 'down' : ''}">
        ${heroSub}
      </p>
      <div class="hero-row">
        <div><span class="mini-label">총자산</span><span class="mini-val">${fmtShort(nw.assets)}</span></div>
        <div><span class="mini-label">총부채</span><span class="mini-val danger">${fmtShort(nw.liabilities)}</span></div>
      </div>
    </section>

    <section class="section">
      <p class="month-label">${fmtMonth(sy, sm)} 정산</p>
      <div class="summary-row summary-row--quad">
        <div class="mini-card">
          <span>수입 ${momBadge(flow.income - prevFlow.income)}</span>
          <strong class="income">${fmtShort(flow.income)}</strong>
        </div>
        <div class="mini-card">
          <span>예산 실적 ${momBadge(flow.expense - prevFlow.expense, true)}</span>
          <strong class="danger">${fmtShort(flow.expense)}</strong>
        </div>
        <div class="mini-card">
          <span>저축 실적 ${momBadge(flow.savings - prevFlow.savings)}</span>
          <strong class="income">${fmtShort(flow.savings)}</strong>
        </div>
        <div class="mini-card">
          <span>투자 손익 ${momBadge(flow.investPnL - prevFlow.investPnL)}</span>
          <strong class="${flow.investPnL >= 0 ? 'income' : 'danger'}">${flow.investPnL >= 0 ? '+' : ''}${fmtShort(flow.investPnL)}</strong>
        </div>
      </div>
      <p class="muted">가장 최근 입력된 ${fmtMonth(sy, sm)} 기준 · 순변동 참고 ${impliedChange >= 0 ? '+' : ''}${fmtShort(impliedChange)} (수입−지출+저축+투자손익)</p>
      <div class="summary-row" style="margin-top:10px">
        <div class="mini-card"><span>${esc(getOwnerDisplayLabel(data, 'self'))} 수입</span><strong class="income">${fmtShort(ownerSummary.income.self)}</strong></div>
        <div class="mini-card"><span>${esc(getOwnerDisplayLabel(data, 'spouse'))} 수입</span><strong class="income">${fmtShort(ownerSummary.income.spouse)}</strong></div>
        <div class="mini-card"><span>${esc(getOwnerDisplayLabel(data, 'self'))} 지출</span><strong class="danger">${fmtShort(ownerSummary.expense.self)}</strong></div>
        <div class="mini-card"><span>${esc(getOwnerDisplayLabel(data, 'spouse'))} 지출</span><strong class="danger">${fmtShort(ownerSummary.expense.spouse)}</strong></div>
      </div>
    </section>

    ${spendDeltaSection}

    ${budgetSection}

    ${ownerChipRow}

    <section class="section">
      <div class="section-head"><h2>자산 변동 추이</h2>
        <button type="button" class="text-btn" id="btn-snapshot">${fmtMonth(sy, sm)} 스냅샷 저장</button></div>
      ${lineChart(chartPts)}
      ${legend([{ label: '순자산', value: nw.net, color: '#1e4d3a' }])}
    </section>`;
}

export function bindDashboard() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  const { year: sy, month: sm } = getHomeSummaryMonth(state.data);

  document.querySelectorAll('[data-owner]').forEach((b) => {
    b.addEventListener('click', () => { state.ownerFilter = b.dataset.owner; rerender(); });
  });
  document.getElementById('btn-link-setup')?.addEventListener('click', () => openLinkWizard());
  document.getElementById('btn-proposed-goals')?.addEventListener('click', () => {
    setTab('settings');
    state.settingsSubView = 'goals';
    rerender();
  });
  document.getElementById('btn-home-record-due')?.addEventListener('click', async () => {
    const { showActualForm } = await import('./modals.js');
    const cats = getVisibleCategories(state.data);
    const due = cats.find((c) => isRecordDue(state.data, sy, sm, c.id));
    if (due) {
      setMonth(sy, sm);
      showActualForm(due.id, sy, sm, rerender);
    } else toast('입력 대기 항목이 없거나 정산일 이전입니다', 'info');
  });
  document.getElementById('btn-go-expense')?.addEventListener('click', () => {
    setMonth(sy, sm);
    setTab('expense');
    rerender();
  });
  document.getElementById('btn-snapshot')?.addEventListener('click', () => {
    createSnapshot(state.data, sy, sm);
    persist();
    toast(`${fmtMonth(sy, sm)} 스냅샷이 저장되었습니다`, 'success');
    rerender();
  });
}
