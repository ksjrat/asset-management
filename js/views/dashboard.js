import { state, persist, setTab } from '../state.js';
import {
  ASSET_TYPES, OWNERS, computeNetWorth, createSnapshot,
} from '../store.js';
import { fmtMoney, fmtPct, fmtShort } from '../format.js';
import { esc, emptyState } from '../ui.js';
import { lineChart, legend } from '../charts.js';
import { toast } from '../ui.js';
import { showAssetForm } from './modals.js';

function itemRow(item) {
  const type = ASSET_TYPES.find((t) => t.id === item.type);
  const owner = OWNERS.find((o) => o.id === item.owner);
  return `<button type="button" class="list-item" data-asset-id="${item.id}">
    <span class="list-icon">${type?.group === 'asset' ? '💰' : '📉'}</span>
    <span class="list-body">
      <span class="list-title">${esc(item.name)}${item.private ? ' 🔒' : ''}</span>
      <span class="list-meta">${esc(type?.label)} · ${esc(owner?.label)}</span>
    </span>
    <span class="list-amount ${type?.group === 'liability' ? 'danger' : ''}">${fmtMoney(item.amount)}</span>
  </button>`;
}

export function renderDashboard() {
  const { data, ownerFilter } = state;
  const nw = computeNetWorth(data, ownerFilter);
  const snaps = [...data.assets.snapshots]
    .sort((a, b) => a.year - b.year || a.month - b.month).slice(-6);
  if (!snaps.length && data.assets.items.length) {
    const now = new Date();
    createSnapshot(data, now.getFullYear(), now.getMonth() + 1);
    persist();
  }
  const chartPts = snaps.map((s) => ({ label: `${s.month}월`, value: s.net }));
  const prev = snaps.length >= 2 ? snaps[snaps.length - 2].net : null;
  const delta = prev != null ? nw.net - prev : 0;
  const deltaPct = prev ? delta / Math.abs(prev) : 0;
  const ownerBtns = [{ id: 'all', label: '전체' }, ...OWNERS].map((o) =>
    `<button type="button" class="chip ${ownerFilter === o.id ? 'active' : ''}" data-owner="${o.id}">${o.label}</button>`
  ).join('');
  const items = data.assets.items.filter((i) => ownerFilter === 'all' || i.owner === ownerFilter);
  const assets = items.filter((i) => ASSET_TYPES.find((t) => t.id === i.type)?.group === 'asset');
  const debts = items.filter((i) => ASSET_TYPES.find((t) => t.id === i.type)?.group === 'liability');
  const proposedGoals = data.goals.filter((g) => g.status === 'proposed').length;

  return `
    ${proposedGoals ? `<button type="button" class="tip-banner" data-goto="goals">🎯 배우자 목표 제안 ${proposedGoals}건 · 확인하기</button>` : ''}

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

    <div class="quick-actions">
      <button type="button" class="quick-btn" data-quick="asset"><span>＋</span>자산</button>
      <button type="button" class="quick-btn" data-quick="expense"><span>＋</span>지출</button>
      <button type="button" class="quick-btn" data-quick="goal"><span>＋</span>목표</button>
      <button type="button" class="quick-btn" data-quick="report"><span>📋</span>보고서</button>
    </div>

    <div class="chip-row">${ownerBtns}</div>

    <section class="section">
      <div class="section-head"><h2>자산 변동 추이</h2>
        <button type="button" class="text-btn" id="btn-snapshot">스냅샷 저장</button></div>
      ${lineChart(chartPts)}
      ${legend([{ label: '순자산', value: nw.net, color: '#1e4d3a' }])}
    </section>

    <section class="section">
      <div class="section-head"><h2>자산 · 부채</h2>
        <button type="button" class="text-btn" id="btn-add-asset">등록</button></div>
      <div class="list-group">
        ${assets.length ? assets.map(itemRow).join('') : emptyState('💰', '자산이 없어요', '예금·적금·대출 등을 등록해 보세요', '첫 자산 등록', 'empty-add-asset')}
      </div>
      ${debts.length ? `<h3 class="list-subtitle">부채</h3><div class="list-group">${debts.map(itemRow).join('')}</div>` : ''}
    </section>`;
}

export function bindDashboard() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());

  document.querySelectorAll('[data-owner]').forEach((b) => {
    b.addEventListener('click', () => { state.ownerFilter = b.dataset.owner; rerender(); });
  });
  document.querySelector('[data-goto="goals"]')?.addEventListener('click', () => {
    setTab('goals');
    rerender();
  });
  document.querySelectorAll('[data-quick]').forEach((b) => {
    b.addEventListener('click', async () => {
      const q = b.dataset.quick;
      if (q === 'asset') showAssetForm(null, rerender);
      else if (q === 'expense') {
        setTab('budget');
        rerender();
      } else if (q === 'goal') {
        setTab('goals');
        const { showGoalForm, bindGoalTemplatePicker } = await import('./modals.js');
        rerender().then(async () => {
          await showGoalForm(rerender);
          bindGoalTemplatePicker();
        });
      } else if (q === 'report') {
        setTab('reports');
        rerender();
      }
    });
  });
  document.getElementById('btn-snapshot')?.addEventListener('click', () => {
    const now = new Date();
    createSnapshot(state.data, now.getFullYear(), now.getMonth() + 1);
    persist();
    toast('월말 스냅샷이 저장되었습니다', 'success');
    rerender();
  });
  document.getElementById('btn-add-asset')?.addEventListener('click', () => showAssetForm(null, rerender));
  document.getElementById('empty-add-asset')?.addEventListener('click', () => showAssetForm(null, rerender));
  document.querySelectorAll('[data-asset-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const item = state.data.assets.items.find((i) => i.id === b.dataset.assetId);
      if (item) showAssetForm(item, rerender);
    });
  });
}
