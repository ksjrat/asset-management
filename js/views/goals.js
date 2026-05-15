import { state, persist } from '../state.js';
import { GOAL_TEMPLATES, computeGoalProgress, getCategorySpend, getVisibleCategories } from '../store.js';
import { fmtMoney, fmtDate } from '../format.js';
import { esc } from '../ui.js';
import { progressRing } from '../charts.js';
import { openModal, toast, formField, emptyState } from '../ui.js';
import { showGoalForm, bindGoalTemplatePicker, showContributionForm } from './modals.js';

function goalCard(g) {
  const { current, rate } = computeGoalProgress(g);
  const statusLabel = { proposed: '제안됨', active: '진행', achieved: '달성', paused: '보류' }[g.status];
  const tpl = GOAL_TEMPLATES.find((t) => t.id === g.template);
  return `<button type="button" class="goal-card" data-goal-id="${g.id}">
    <div class="goal-top">
      <span class="goal-icon">${tpl?.icon || '🎯'}</span>
      <span class="badge badge-${g.status}">${statusLabel}</span>
    </div>
    <h3>${esc(g.title)}</h3>
    <p class="goal-amt">${fmtMoney(current)} / ${fmtMoney(g.targetAmount)}</p>
    <div class="goal-bar"><div class="goal-bar-fill" style="width:${rate * 100}%"></div></div>
    <p class="goal-meta">월 ${fmtMoney(g.monthlyContribution)} · ${fmtDate(g.endDate)}까지</p>
  </button>`;
}

function buildGuides() {
  const spend = getCategorySpend(state.data, state.selectedYear, state.selectedMonth);
  const cats = getVisibleCategories(state.data);
  return cats.map((c) => ({ cat: c, amount: spend[c.id] || 0 }))
    .filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3)
    .map((x) => ({
      id: `guide-${x.cat.id}`,
      title: `${x.cat.name} 지출 점검`,
      desc: `이번 달 ${fmtMoney(x.amount)} 사용 · 10% 절감 권장`,
      save: Math.round(x.amount * 0.1),
    }));
}

function renderDetail(g) {
  const { current, rate } = computeGoalProgress(g);
  const milestones = (g.milestones || []).map((m) =>
    `<span class="milestone ${m.reached ? 'done' : ''}">${m.percent}%</span>`).join('');
  const guides = buildGuides();
  const rerender = () => import('./index.js').then((m) => m.renderApp());

  return `
    <button type="button" class="back-link" id="btn-back-goals">← 목록</button>
    <section class="detail-hero">
      ${progressRing(rate)}
      <div><h2>${esc(g.title)}</h2>
        <p>${fmtMoney(current)} / ${fmtMoney(g.targetAmount)}</p>
        <p class="muted">월 기여금 ${fmtMoney(g.monthlyContribution)}</p>
      </div>
    </section>
    <div class="milestone-row">${milestones}</div>
    ${g.status === 'proposed' ? `
      <section class="card actions-card">
        <p>배우자의 목표 제안입니다</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="btn-approve">승인</button>
          <button type="button" class="btn btn-danger" id="btn-reject">반려</button>
        </div>
      </section>` : ''}
    <section class="section">
      <div class="section-head"><h2>기여 내역</h2>
        <button type="button" class="text-btn" id="btn-add-contrib">+ 기록</button></div>
      ${(g.contributions || []).map((c) => `
        <div class="list-item static">
          <span class="list-body"><span class="list-title">${fmtDate(c.date)}</span>
            <span class="list-meta">${esc(c.memo || '')}</span></span>
          <span class="list-amount">+${fmtMoney(c.amount)}</span>
        </div>`).join('') || '<p class="empty">기여 내역이 없습니다</p>'}
    </section>
    <section class="section">
      <h2>맞춤 달성 가이드</h2>
      ${guides.map((guide) => `
        <div class="guide-card">
          <h4>${esc(guide.title)}</h4><p>${esc(guide.desc)}</p>
          <p class="guide-save">예상 절감 ${fmtMoney(guide.save)}</p>
          <div class="btn-row">
            <button type="button" class="btn btn-sm ${state.data.guideChecks[guide.id] === 'done' ? 'btn-primary' : 'btn-ghost'}" data-guide="${guide.id}" data-val="done">해봤어요</button>
            <button type="button" class="btn btn-sm btn-ghost" data-guide="${guide.id}" data-val="later">다음에</button>
          </div>
        </div>`).join('')}
    </section>`;
}

export function renderGoals() {
  if (state.subView === 'detail' && state.selectedGoalId) {
    const g = state.data.goals.find((x) => x.id === state.selectedGoalId);
    return g ? renderDetail(g) : '<p class="empty">목표를 찾을 수 없습니다</p>';
  }
  const proposed = state.data.goals.filter((g) => g.status === 'proposed');
  return `
    ${proposed.length ? `<section class="alert-banner">배우자 제안 ${proposed.length}건 대기 중</section>` : ''}
    <section class="section">
      <div class="section-head"><h2>재정 목표</h2>
        <button type="button" class="text-btn" id="btn-add-goal">+ 생성</button></div>
      ${state.data.goals.length ? state.data.goals.map(goalCard).join('') : emptyState('🎯', '목표가 없어요', '함께 달성할 재정 목표를 만들어 보세요', '목표 만들기', 'empty-add-goal')}
    </section>`;
}

export function bindGoals() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  document.getElementById('btn-back-goals')?.addEventListener('click', () => {
    state.subView = null; state.selectedGoalId = null; rerender();
  });
  document.querySelectorAll('[data-goal-id]').forEach((b) => {
    b.addEventListener('click', () => {
      state.selectedGoalId = b.dataset.goalId;
      state.subView = 'detail';
      rerender();
    });
  });
  document.getElementById('empty-add-goal')?.addEventListener('click', () => {
    document.getElementById('btn-add-goal')?.click();
  });
  document.getElementById('btn-add-goal')?.addEventListener('click', async () => {
    await showGoalForm(rerender);
    bindGoalTemplatePicker();
  });
  document.getElementById('btn-add-contrib')?.addEventListener('click', () => {
    showContributionForm(state.selectedGoalId, rerender);
  });
  document.getElementById('btn-approve')?.addEventListener('click', () => {
    const g = state.data.goals.find((x) => x.id === state.selectedGoalId);
    if (!g) return;
    g.status = 'active';
    g.approvedBy = 'spouse';
    g.history = g.history || [];
    g.history.push({ at: new Date().toISOString(), text: '배우자 승인' });
    persist(); toast('승인되었습니다'); rerender();
  });
  document.getElementById('btn-reject')?.addEventListener('click', async () => {
    const g = state.data.goals.find((x) => x.id === state.selectedGoalId);
    if (!g) return;
    const res = await openModal({
      title: '목표 반려',
      body: formField('사유', '<textarea class="input" name="reason" rows="3"></textarea>'),
      actions: [{ label: '취소', value: null }, { label: '반려', value: 'reject', danger: true }],
    });
    if (res !== 'reject') return;
    g.status = 'paused';
    g.history.push({ at: new Date().toISOString(), text: '배우자 반려' });
    persist(); toast('반려되었습니다'); rerender();
  });
  document.querySelectorAll('[data-guide]').forEach((b) => {
    b.addEventListener('click', () => {
      state.data.guideChecks[b.dataset.guide] = b.dataset.val;
      persist(); rerender();
    });
  });
}
