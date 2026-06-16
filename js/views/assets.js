import { state } from '../state.js';
import {
  ASSET_TYPES, OWNERS, getInvestmentPnLForMonth, listSavingsContributions,
  getOwnerDisplayLabel, getEffectiveAssetAmount,
} from '../store.js';
import { fmtMoney } from '../format.js';
import { esc, emptyState, openModal, modalValue } from '../ui.js';
import { showAssetForm, showTxForm, showAssetValuationForm, showSavingsForm } from './modals.js';
import { assetIcon } from '../icons.js';

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
  const isInvest = item.type === 'invest';
  const latest = isInvest ? latestValuation(item) : null;
  const prev = isInvest ? prevValuation(item) : null;
  const delta = latest && prev ? latest.amount - prev.amount : null;
  const deltaLabel = delta == null ? '' : `${delta >= 0 ? '+' : ''}${fmtMoney(delta)}`;
  const valMeta = latest ? ` · 평가 ${esc(latest.ym)} ${fmtMoney(latest.amount)}${delta != null ? ` (${esc(deltaLabel)})` : ''}` : '';
  return `<button type="button" class="list-item" data-asset-id="${item.id}">
    <span class="avatar avatar--asset avatar--icon" aria-hidden="true">${icon}</span>
    <span class="list-body">
      <span class="list-title">${esc(item.name)}${item.private ? ' 🔒' : ''}</span>
      <span class="list-meta">${esc(type?.label)} · ${esc(owner?.label)}${isInvest ? valMeta : ''}</span>
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
  return `<button type="button" class="list-item" data-savings-id="${entry.id}">
    <span class="avatar avatar--icon" aria-hidden="true">🏦</span>
    <span class="list-body">
      <span class="list-title">${esc(entry.memo || itemLabel || '저축')}</span>
      <span class="list-meta">${itemLabel ? `${esc(itemLabel)} · ` : ''}${esc(String(entry.date).slice(0, 10))} · ${esc(asset.name)} (${esc(type?.label || '')})</span>
    </span>
    <span class="list-amount income">+${fmtMoney(entry.amount)}</span>
  </button>`;
}

export function renderAssets() {
  const { data } = state;
  const now = new Date();
  const invest = getInvestmentPnLForMonth(data, now.getFullYear(), now.getMonth() + 1);
  const assets = data.assets.items.filter((i) => ASSET_TYPES.find((t) => t.id === i.type)?.group === 'asset');
  const debts = data.assets.items.filter((i) => ASSET_TYPES.find((t) => t.id === i.type)?.group === 'liability');
  const savings = listSavingsContributions(data).slice(0, 20);
  const incomes = (data.transactions || [])
    .filter((t) => t.type === 'income')
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 20);

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
          <button type="button" class="text-btn" id="btn-add-savings">저축 실행</button>
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
      ${savings.length ? `<h3 class="list-subtitle">저축 실행 기록</h3>
      <div class="list-group">${savings.map(savingsRow).join('')}</div>` : ''}
      <div class="list-group">
        ${incomes.length ? incomes.map(incomeRow).join('') : (!savings.length ? emptyState('✨', '수익·저축 기록이 없어요', '근로소득은 수익 입력, 예·적금 이체는 저축 실행', '저축 실행', 'empty-add-savings') : '')}
      </div>
      <p class="muted" style="margin-top:10px">최근 20건만 표시됩니다. 저축 실행은 예금·적금 잔액에 바로 반영됩니다.</p>
    </section>
  `;
}

export function bindAssets() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());

  document.getElementById('btn-add-asset')?.addEventListener('click', () => showAssetForm(null, rerender));
  document.getElementById('empty-add-asset')?.addEventListener('click', () => showAssetForm(null, rerender));

  document.getElementById('btn-add-income')?.addEventListener('click', () => showTxForm('income', null, rerender));
  document.getElementById('empty-add-income')?.addEventListener('click', () => showTxForm('income', null, rerender));

  document.getElementById('btn-add-savings')?.addEventListener('click', () => showSavingsForm(rerender));
  document.getElementById('empty-add-savings')?.addEventListener('click', () => showSavingsForm(rerender));

  document.querySelectorAll('[data-asset-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const item = state.data.assets.items.find((x) => x.id === b.dataset.assetId);
      if (!item) return;
      if (item.type !== 'invest') { showAssetForm(item, rerender); return; }
      openModal({
        title: '투자 자산',
        body: `<p class="modal-text"><strong>${esc(item.name)}</strong>에서 무엇을 할까요?</p>`,
        actions: [
          { label: '평가금액 기록', value: 'valuation', primary: true },
          { label: '항목 수정/삭제', value: 'edit' },
          { label: '취소', value: null },
        ],
      }).then((res) => {
        const v = modalValue(res);
        if (v === 'valuation') showAssetValuationForm(item.id, rerender);
        if (v === 'edit') showAssetForm(item, rerender);
      });
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
      showSavingsForm(rerender, b.dataset.savingsId);
    });
  });
}
