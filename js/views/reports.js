import { state } from '../state.js';
import {
  computeNetWorth, computeGoalProgress, getMonthBudget,
  getMonthCashflowSummary, getCategorySpend, getVisibleCategories,
  getInvestmentPnLForMonth,
  buildReportShareText,
} from '../store.js';
import { fmtMoney, fmtPct, fmtMonth } from '../format.js';
import { esc, copyText, toast } from '../ui.js';
import { barChart } from '../charts.js';

export function renderReports() {
  const { data, selectedYear: y, selectedMonth: m } = state;
  const nw = computeNetWorth(data);
  const snaps = [...data.assets.snapshots].sort((a, b) => a.year - b.year || a.month - b.month);
  const cur = snaps.find((s) => s.year === y && s.month === m);
  const prev = snaps.filter((s) => s.year < y || (s.year === y && s.month < m)).pop();
  const { income, expense } = getMonthCashflowSummary(data, y, m);
  const invest = getInvestmentPnLForMonth(data, y, m);
  const spend = getCategorySpend(data, y, m);
  const cats = getVisibleCategories(data);
  const barItems = cats.map((c) => ({ label: c.name, value: spend[c.id] || 0 }))
    .filter((i) => i.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);

  const insights = [];
  if (prev && cur) {
    const d = cur.net - prev.net;
    insights.push(`순자산이 전월 대비 ${d >= 0 ? '+' : ''}${fmtMoney(d)} ${d >= 0 ? '증가' : '감소'}했습니다.`);
  }
  const overCats = cats.filter((c) => {
    const b = getMonthBudget(data, y, m)[c.id] || 0;
    return b > 0 && (spend[c.id] || 0) > b;
  });
  if (overCats.length) {
    insights.push(`${overCats.map((c) => c.name).join(', ')} 예산을 초과했습니다.`);
  }
  for (const g of data.goals.filter((x) => x.status === 'active')) {
    const { rate } = computeGoalProgress(g);
    if (rate < 0.5) {
      insights.push(`'${g.title}' 기여가 부족합니다. 월 ${fmtMoney(g.monthlyContribution)} 권장.`);
    }
  }
  if (!insights.length) {
    insights.push('이번 달 재정 상태가 안정적입니다. 다음 달에도 꾸준히 기록해 보세요.');
  }

  return `
    <p class="month-label">${fmtMonth(y, m)} 보고서</p>
    <section class="hero-card small">
      <p class="hero-label">순자산</p>
      <p class="hero-value">${fmtMoney(cur?.net ?? nw.net)}</p>
      ${prev ? `<p class="hero-sub">전월 ${fmtMoney(prev.net)}</p>` : ''}
    </section>
    <section class="section">
      <h2>수입 · 예산 실적</h2>
      <div class="summary-row">
        <div class="mini-card"><span>수입</span><strong class="income">${fmtMoney(income)}</strong></div>
        <div class="mini-card"><span>예산 실적</span><strong class="danger">${fmtMoney(expense)}</strong></div>
        <div class="mini-card"><span>투자 손익(평가)</span><strong class="${invest.pnl >= 0 ? 'income' : 'danger'}">${invest.pnl >= 0 ? '+' : ''}${fmtMoney(invest.pnl)}</strong></div>
      </div>
      <p class="muted">예산 실적은 지출 탭에서 입력한 카테고리별 실적 합계입니다.</p>
    </section>
    <section class="section">
      <h2>카테고리별 실적</h2>
      ${barChart(barItems)}
    </section>
    <section class="section">
      <h2>목표 진행</h2>
      ${data.goals.length ? data.goals.map((g) => {
        const { current, rate } = computeGoalProgress(g);
        return `<div class="report-goal"><span>${esc(g.title)}</span><span>${fmtPct(rate)} (${fmtMoney(current)})</span></div>`;
      }).join('') : '<p class="empty">등록된 목표 없음</p>'}
    </section>
    <section class="section insight-section">
      <h2>💡 인사이트 · 다음 달 제안</h2>
      <ul class="insight-list">${insights.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </section>
    <button type="button" class="btn btn-primary btn-block share-report-btn" id="btn-share-report">📤 보고서 공유하기</button>`;
}

export function bindReports() {
  document.getElementById('btn-share-report')?.addEventListener('click', () => {
    const text = buildReportShareText(state.data, state.selectedYear, state.selectedMonth);
    copyText(text);
  });
}
