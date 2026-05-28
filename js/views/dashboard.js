import { state, persist, setTab } from '../state.js';
import {
  computeNetWorth,
  createSnapshot,
  getVisibleHomeOwnerFilters,
  getMonthCashflowSummary,
  getVisibleCategories,
} from '../store.js';
import { fmtMoney, fmtPct, fmtShort, fmtMonth } from '../format.js';
import { lineChart, legend, budgetBar } from '../charts.js';
import { toast } from '../ui.js';
import { needsLinkAttention, openLinkWizard } from '../link-wizard.js';
import { getPeriodTotals, isRecordDue } from '../budget-engine.js';

export function renderDashboard() {
  const { data } = state;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const visibleOwnerFilters = getVisibleHomeOwnerFilters(data);
  if (!visibleOwnerFilters.some((o) => o.id === state.ownerFilter)) {
    state.ownerFilter = visibleOwnerFilters[0]?.id || 'all';
  }
  const ownerFilter = state.ownerFilter;
  const nw = computeNetWorth(data, ownerFilter);

  const snaps = [...data.assets.snapshots]
    .sort((a, b) => a.year - b.year || a.month - b.month).slice(-6);
  if (!snaps.length && data.assets.items.length) {
    createSnapshot(data, y, m);
    persist();
  }
  const chartPts = snaps.map((s) => ({ label: `${s.month}월`, value: s.net }));
  const prev = snaps.length >= 2 ? snaps[snaps.length - 2].net : null;
  const delta = prev != null ? nw.net - prev : 0;
  const deltaPct = prev ? delta / Math.abs(prev) : 0;

  const ownerChipRow = visibleOwnerFilters.length > 1
    ? `<div class="chip-row">${visibleOwnerFilters.map((o) =>
      `<button type="button" class="chip ${ownerFilter === o.id ? 'active' : ''}" data-owner="${o.id}">${o.label}</button>`
    ).join('')}</div>`
    : '';

  const flow = getMonthCashflowSummary(data, y, m);
  const cats = getVisibleCategories(data);
  const budgetTotals = data.budget?.setupDone
    ? getPeriodTotals(data, y, m, cats)
    : { available: 0, actual: 0, dueCount: 0 };
  const budgetUsedPct = budgetTotals.available > 0
    ? budgetTotals.actual / budgetTotals.available
    : 0;
  const dueCats = cats.filter((c) => isRecordDue(data, y, m, c.id));
  const recordDay = data.budget?.defaultRecordDay ?? 25;

  const proposedGoals = data.goals.filter((g) => g.status === 'proposed').length;

  const dueBanner = data.budget?.setupDone && dueCats.length > 0
    ? `<button type="button" class="tip-banner" id="btn-home-record-due">
        📌 실적 입력 ${dueCats.length}건 · ${recordDay}일부터 입력 가능 · 지금 입력
      </button>`
    : '';

  const budgetSection = data.budget?.setupDone ? `
    <section class="section">
      <div class="section-head">
        <h2>예산 진행</h2>
        <button type="button" class="text-btn" id="btn-go-expense">지출 탭</button>
      </div>
      <p class="month-label">${fmtMonth(y, m)} · 사용 ${fmtPct(budgetUsedPct)}</p>
      ${budgetBar(budgetTotals.actual, budgetTotals.available, '#1a5c44')}
      <div class="summary-row" style="margin-top:10px">
        <div class="mini-card"><span>사용 가능</span><strong>${fmtShort(budgetTotals.available)}</strong></div>
        <div class="mini-card"><span>실적</span><strong class="${budgetUsedPct > 1 ? 'danger' : ''}">${fmtShort(budgetTotals.actual)}</strong></div>
        <div class="mini-card"><span>잔액</span><strong class="${budgetTotals.remaining >= 0 ? 'income' : 'danger'}">${fmtShort(budgetTotals.remaining)}</strong></div>
      </div>
    </section>` : '';

  return `
    ${needsLinkAttention() ? '<button type="button" class="tip-banner" id="btn-link-setup">📱 PC·폰·배우자 연동 마무리 · 연동 도우미</button>' : ''}
    ${proposedGoals ? `<button type="button" class="tip-banner" id="btn-proposed-goals">🎯 배우자 목표 제안 ${proposedGoals}건 · 확인하기</button>` : ''}
    ${dueBanner}

    <section class="hero-card">
      <p class="hero-label">순자산</p>
      <p class="hero-value">${fmtMoney(nw.net)}</p>
      <p class="hero-sub ${delta >= 0 ? 'up' : 'down'}">
        ${prev != null ? `전월 대비 ${delta >= 0 ? '+' : ''}${fmtShort(delta)} (${fmtPct(deltaPct)})` : '첫 기록 — 스냅샷으로 추이를 쌓아보세요'}
      </p>
      <div class="hero-row">
        <div><span class="mini-label">총자산</span><span class="mini-val">${fmtShort(nw.assets)}</span></div>
        <div><span class="mini-label">총부채</span><span class="mini-val danger">${fmtShort(nw.liabilities)}</span></div>
      </div>
    </section>

    <section class="section">
      <p class="month-label">${fmtMonth(y, m)} 한눈에</p>
      <div class="summary-row summary-row--quad">
        <div class="mini-card"><span>수입</span><strong class="income">${fmtShort(flow.income)}</strong></div>
        <div class="mini-card"><span>예산 실적</span><strong class="danger">${fmtShort(flow.expense)}</strong></div>
        <div class="mini-card"><span>저축 실행</span><strong class="income">${fmtShort(flow.savings)}</strong></div>
        <div class="mini-card"><span>투자 손익</span><strong class="${flow.investPnL >= 0 ? 'income' : 'danger'}">${flow.investPnL >= 0 ? '+' : ''}${fmtShort(flow.investPnL)}</strong></div>
      </div>
      <p class="muted">예산 실적은 지출 탭 카테고리 실적 합계입니다. 투자 손익은 평가 기록(전월 대비) 기준입니다.</p>
    </section>

    ${budgetSection}

    ${ownerChipRow}

    <section class="section">
      <div class="section-head"><h2>자산 변동 추이</h2>
        <button type="button" class="text-btn" id="btn-snapshot">스냅샷 저장</button></div>
      ${lineChart(chartPts)}
      ${legend([{ label: '순자산', value: nw.net, color: '#1e4d3a' }])}
    </section>`;
}

export function bindDashboard() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

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
    const due = cats.find((c) => isRecordDue(state.data, y, m, c.id));
    if (due) showActualForm(due.id, y, m, rerender);
    else toast('입력 대기 항목이 없거나 정산일 이전입니다', 'info');
  });
  document.getElementById('btn-go-expense')?.addEventListener('click', () => {
    setTab('expense');
    rerender();
  });
  document.getElementById('btn-snapshot')?.addEventListener('click', () => {
    createSnapshot(state.data, y, m);
    persist();
    toast('월말 스냅샷이 저장되었습니다', 'success');
    rerender();
  });
}
