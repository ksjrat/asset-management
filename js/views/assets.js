import { state, persist, enterExpenseTab } from '../state.js';
import {
  ASSET_TYPES, OWNERS, getInvestmentPnLForMonth, listSavingsContributions,
  getOwnerDisplayLabel, getEffectiveAssetAmount,
} from '../store.js';
import { getLoanRepaymentLabel } from '../loan-amort.js';
import { fmtMoney, fmtShort } from '../format.js';
import { esc, emptyState, openModal, modalValue } from '../ui.js';
import { showAssetForm, showTxForm, showAssetAppraisalForm, showSavingsActualForm } from './modals.js';
import { assetIcon } from '../icons.js';

const APPRAISED_TYPES = new Set(['invest', 'realestate']);
const HISTORY_MONTHS_DEFAULT = 6;

function latestValuation(item) {
  const vals = item.valuations || [];
  if (!vals.length) return null;
  return vals[vals.length - 1];
}

function prevValuation(item) {
  const vals = item.valuations || [];
  if (vals.length < 2) return null;
  return vals[vals.length - 2];
}

function itemRow(item) {
  const type = ASSET_TYPES.find((t) => t.id === item.type);
  const owner = OWNERS.find((o) => o.id === item.owner);
  const icon = assetIcon(item.type, type?.group);
  const hasAppraisal = APPRAISED_TYPES.has(item.type);
  const latest = hasAppraisal ? latestValuation(item) : null;
  const prev = hasAppraisal ? prevValuation(item) : null;
  const delta = latest && prev ? latest.amount - prev.amount : null;
  const deltaLabel = delta == null ? '' : `${delta >= 0 ? '+' : ''}${fmtMoney(delta)}`;
  const valMeta = latest ? ` · 평가 ${esc(latest.ym)} ${fmtMoney(latest.amount)}${delta != null ? ` (${esc(deltaLabel)})` : ''}` : '';
  const loanMeta = item.type === 'loan' && item.annualRate != null
    ? ` · ${item.annualRate}% · ${getLoanRepaymentLabel(item.repaymentMethod)}`
    : '';
  return `<button type="button" class="list-item" data-asset-id="${item.id}">
    <span class="avatar avatar--asset avatar--icon" aria-hidden="true">${icon}</span>
    <span class="list-body">
      <span class="list-title">${esc(item.name)}${item.private ? ' 🔒' : ''}</span>
      <span class="list-meta">${esc(type?.label)} · ${esc(owner?.label)}${hasAppraisal ? valMeta : ''}${loanMeta}</span>
    </span>
    <span class="list-amount ${type?.group === 'liability' ? 'danger' : ''}">${fmtMoney(getEffectiveAssetAmount(item))}</span>
  </button>`;
}

function incomeRow(tx) {
  const ownerLabel = getOwnerDisplayLabel(state.data, tx.owner || 'self');
  return `<button type="button" class="list-item" data-income-id="${tx.id}">
    <span class="avatar avatar--icon" aria-hidden="true">＋</span>
    <span class="list-body">
      <span class="list-title">${esc(tx.memo || '수익')}</span>
      <span class="list-meta">${esc(ownerLabel)} · ${esc(String(tx.date || '').slice(0, 10))}${tx.paymentMethod ? ` · ${esc(tx.paymentMethod)}` : ''}</span>
    </span>
    <span class="list-amount income">${fmtMoney(tx.amount)}</span>
  </button>`;
}

function savingsRow({ asset, entry }) {
  const type = ASSET_TYPES.find((t) => t.id === asset.type);
  let item = null;
  for (const items of Object.values(state.data.budget?.subItemsByCategory || {})) {
    item = items.find((i) => i.id === entry.savingsItemId);
    if (item) break;
  }
  const itemLabel = item ? item.name : '';
  const fromBudget = entry.source === 'budget';
  return `<button type="button" class="list-item" data-savings-id="${entry.id}" data-savings-budget="${fromBudget ? '1' : ''}" data-savings-year="${entry.year ?? ''}" data-savings-month="${entry.month ?? ''}">
    <span class="avatar avatar--icon" aria-hidden="true">🏦</span>
    <span class="list-body">
      <span class="list-title">${esc(entry.memo || itemLabel || '저축')}</span>
      <span class="list-meta">${itemLabel ? `${esc(itemLabel)} · ` : ''}${esc(String(entry.date).slice(0, 10))} · ${esc(asset.name)} (${esc(type?.label || '')})</span>
    </span>
    <span class="list-amount income">+${fmtMoney(entry.amount)}</span>
  </button>`;
}

function monthKeyFromDate(dateStr) {
  const s = String(dateStr || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${y}년 ${Number(m)}월`;
}

function groupHistoryByMonth(savings, incomes) {
  const groups = new Map();
  const ensure = (ym) => {
    if (!groups.has(ym)) groups.set(ym, { savings: [], incomes: [], incomeTotal: 0, savingsTotal: 0 });
    return groups.get(ym);
  };
  for (const s of savings) {
    const ym = monthKeyFromDate(s.entry.date) || (s.entry.year && s.entry.month
      ? `${s.entry.year}-${String(s.entry.month).padStart(2, '0')}` : null);
    if (!ym) continue;
    const g = ensure(ym);
    g.savings.push(s);
    g.savingsTotal += Number(s.entry.amount) || 0;
  }
  for (const tx of incomes) {
    const ym = monthKeyFromDate(tx.date);
    if (!ym) continue;
    const g = ensure(ym);
    g.incomes.push(tx);
    g.incomeTotal += Number(tx.amount) || 0;
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function monthHistoryBlock(ym, group, expanded) {
  const parts = [];
  if (group.incomeTotal > 0) parts.push(`수익 +${fmtShort(group.incomeTotal)}`);
  if (group.savingsTotal > 0) parts.push(`저축 +${fmtShort(group.savingsTotal)}`);
  const summary = parts.length ? parts.join(' · ') : '기록 없음';
  const savingsItems = group.savings.map((s) => savingsRow(s)).join('');
  const incomeItems = group.incomes.map((tx) => incomeRow(tx)).join('');
  return `<details class="month-history" ${expanded ? 'open' : ''}>
    <summary class="month-history-summary">
      <span class="month-history-label">${esc(formatMonthLabel(ym))}</span>
      <span class="month-history-totals muted">${esc(summary)}</span>
    </summary>
    <div class="list-group month-history-body">
      ${incomeItems}${savingsItems}
    </div>
  </details>`;
}

export function renderAssets() {
  const { data } = state;
  const now = new Date();
  const invest = getInvestmentPnLForMonth(data, now.getFullYear(), now.getMonth() + 1);
  const assets = data.assets.items.filter((i) => ASSET_TYPES.find((t) => t.id === i.type)?.group === 'asset');
  const debts = data.assets.items.filter((i) => ASSET_TYPES.find((t) => t.id === i.type)?.group === 'liability');
  const allSavings = listSavingsContributions(data);
  const allIncomes = (data.transactions || [])
    .filter((t) => t.type === 'income')
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const monthGroups = groupHistoryByMonth(allSavings, allIncomes);
  const visibleGroups = monthGroups.slice(0, HISTORY_MONTHS_DEFAULT);
  const hiddenCount = Math.max(0, monthGroups.length - HISTORY_MONTHS_DEFAULT);
  const historyHtml = visibleGroups.length
    ? `<div class="month-history-list">${visibleGroups.map(([ym, g], i) => monthHistoryBlock(ym, g, i === 0)).join('')}</div>
       ${hiddenCount ? `<p class="muted month-history-more" id="month-history-more">이전 ${hiddenCount}개월 더 보기</p>
       <div class="month-history-list hidden" id="month-history-older">${monthGroups.slice(HISTORY_MONTHS_DEFAULT).map(([ym, g]) => monthHistoryBlock(ym, g, false)).join('')}</div>` : ''}`
    : '';

  return `
    <section class="section">
      <div class="section-head"><h2>자산 · 부채</h2>
        <div class="btn-row-inline">
          <button type="button" class="text-btn" id="btn-add-asset">자산 등록</button>
        </div>
      </div>
      <div class="list-group">
        ${assets.length ? assets.map(itemRow).join('') : emptyState('💰', '자산이 없어요', '예금·적금·부동산 등을 등록해 보세요', '첫 자산 등록', 'empty-add-asset')}
      </div>
      ${debts.length ? `<h3 class="list-subtitle">부채</h3><div class="list-group">${debts.map(itemRow).join('')}</div>` : ''}
    </section>

    <section class="section">
      <div class="section-head"><h2>수익 · 저축</h2>
        <div class="btn-row-inline">
          <button type="button" class="text-btn" id="btn-add-income">수익 입력</button>
        </div>
      </div>
      <div class="list-group">
        <div class="list-item static">
          <span class="avatar avatar--icon" aria-hidden="true">📈</span>
          <span class="list-body">
            <span class="list-title">투자 손익(평가) · 자동</span>
            <span class="list-meta">${esc(invest.prevYm)} → ${esc(invest.ym)} · 평가 기록 기준</span>
          </span>
          <span class="list-amount ${invest.pnl >= 0 ? 'income' : 'danger'}">${invest.pnl >= 0 ? '+' : ''}${fmtMoney(invest.pnl)}</span>
        </div>
        ${invest.perAsset.map((p) => `
          <div class="list-item static">
            <span class="avatar avatar--icon" aria-hidden="true">•</span>
            <span class="list-body">
              <span class="list-title">${esc(p.name)}</span>
              <span class="list-meta">${esc(p.prevYm)} ${fmtMoney(p.previous)} → ${esc(p.ym)} ${fmtMoney(p.current)}</span>
            </span>
            <span class="list-amount ${p.delta >= 0 ? 'income' : 'danger'}">${p.delta >= 0 ? '+' : ''}${fmtMoney(p.delta)}</span>
          </div>`).join('')}
      </div>
      ${historyHtml || emptyState('✨', '수익·저축 기록이 없어요', '근로소득은 수익 입력, 저축은 지출 탭 세부 실적', '지출 탭으로', 'empty-go-expense')}
      <p class="muted" style="margin-top:10px">저축은 지출 탭 → 저축 → 세부 실적 입력 시 예금·적금·투자 계좌에 자동 반영됩니다.</p>
    </section>
  `;
}

function openAppraisedAssetActions(item, rerender) {
  const typeLabel = item.type === 'realestate' ? '부동산' : '투자';
  openModal({
    title: `${typeLabel} 자산`,
    body: `<p class="modal-text"><strong>${esc(item.name)}</strong>에서 무엇을 할까요?</p>`,
    actions: [
      { label: '평가금액 기록', value: 'valuation', primary: true },
      { label: '항목 수정/삭제', value: 'edit' },
      { label: '취소', value: null },
    ],
  }).then((res) => {
    const v = modalValue(res);
    if (v === 'valuation') showAssetAppraisalForm(item.id, rerender);
    if (v === 'edit') showAssetForm(item, rerender);
  });
}

export function bindAssets() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());

  document.getElementById('btn-add-asset')?.addEventListener('click', () => showAssetForm(null, rerender));
  document.getElementById('empty-add-asset')?.addEventListener('click', () => showAssetForm(null, rerender));

  document.getElementById('btn-add-income')?.addEventListener('click', () => showTxForm('income', null, rerender));
  document.getElementById('empty-add-income')?.addEventListener('click', () => showTxForm('income', null, rerender));

  document.getElementById('empty-go-expense')?.addEventListener('click', () => {
    enterExpenseTab();
    rerender();
  });

  document.getElementById('month-history-more')?.addEventListener('click', () => {
    document.getElementById('month-history-older')?.classList.remove('hidden');
    document.getElementById('month-history-more')?.classList.add('hidden');
  });

  document.querySelectorAll('[data-asset-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const item = state.data.assets.items.find((x) => x.id === b.dataset.assetId);
      if (!item) return;
      if (APPRAISED_TYPES.has(item.type)) {
        openAppraisedAssetActions(item, rerender);
        return;
      }
      showAssetForm(item, rerender);
    });
  });

  document.querySelectorAll('[data-income-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const item = (state.data.transactions || []).find((x) => x.id === b.dataset.incomeId);
      if (item) showTxForm('income', item, rerender);
    });
  });

  document.querySelectorAll('[data-savings-id]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.savingsBudget === '1') {
        const y = Number(b.dataset.savingsYear) || state.selectedYear;
        const m = Number(b.dataset.savingsMonth) || state.selectedMonth;
        enterExpenseTab({ year: y, month: m });
        rerender().then(() => showSavingsActualForm(y, m, rerender));
        return;
      }
      import('./modals.js').then((m) => m.showSavingsForm(rerender, b.dataset.savingsId));
    });
  });
}
