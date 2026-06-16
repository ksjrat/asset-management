import { ymKey } from './format.js';
import {
  getSavingsCategory,
  getSubItems,
  getSubActualAmount,
  getVisibleSubItems,
} from './budget-engine.js';

const SAVINGS_ASSET_TYPES = new Set(['deposit', 'savings']);

function getSavingsEligibleAssets(data) {
  return (data.assets?.items || []).filter((i) => SAVINGS_ASSET_TYPES.has(i.type));
}

export function budgetSavingsLogId(itemId, year, month) {
  return `budget-sync-${itemId}-${ymKey(year, month)}`;
}

export function getDefaultSavingsAsset(data) {
  if (data.settings?.defaultSavingsAssetId) {
    const picked = data.assets?.items?.find((x) => x.id === data.settings.defaultSavingsAssetId);
    if (picked && SAVINGS_ASSET_TYPES.has(picked.type)) return picked;
  }
  return getSavingsEligibleAssets(data)[0] || null;
}

export function getSavingsAssetForSubItem(data, itemId) {
  const cat = getSavingsCategory(data);
  if (!cat) return null;
  const item = getSubItems(data, cat.id).find((i) => i.id === itemId);
  if (item?.assetId) {
    const linked = data.assets?.items?.find((x) => x.id === item.assetId);
    if (linked && SAVINGS_ASSET_TYPES.has(linked.type)) return linked;
  }
  return getDefaultSavingsAsset(data);
}

function savingsRecordDate(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function findBudgetSavingsLogEntry(asset, itemId, year, month) {
  const id = budgetSavingsLogId(itemId, year, month);
  return (asset.savingsLog || []).find((e) => e.id === id) || null;
}

/** 기존 「저축 실행」 기록이 있으면 이미 반영된 금액으로 간주 */
function legacySyncedAmount(data, itemId, year, month) {
  let total = 0;
  for (const asset of data.assets?.items || []) {
    for (const entry of asset.savingsLog || []) {
      if (entry.source === 'budget') continue;
      if (entry.savingsItemId !== itemId) continue;
      const d = new Date(entry.date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        total += Number(entry.amount) || 0;
      }
    }
  }
  return total;
}

function prevSyncedAmount(data, asset, itemId, year, month) {
  const budgetEntry = findBudgetSavingsLogEntry(asset, itemId, year, month);
  if (budgetEntry) return Number(budgetEntry.amount) || 0;
  return legacySyncedAmount(data, itemId, year, month);
}

export function syncSavingsSubActualToAsset(data, year, month, itemId, newAmount) {
  const cat = getSavingsCategory(data);
  if (!cat) return { ok: false, reason: 'no-category' };

  const asset = getSavingsAssetForSubItem(data, itemId);
  if (!asset) return { ok: false, reason: 'no-asset' };

  const amount = Math.max(0, Number(newAmount) || 0);
  const entryId = budgetSavingsLogId(itemId, year, month);
  asset.savingsLog = asset.savingsLog || [];

  const prevSynced = prevSyncedAmount(data, asset, itemId, year, month);
  const delta = amount - prevSynced;
  const existing = findBudgetSavingsLogEntry(asset, itemId, year, month);
  const item = getSubItems(data, cat.id).find((i) => i.id === itemId);

  if (amount === 0) {
    if (existing) asset.savingsLog = asset.savingsLog.filter((e) => e.id !== entryId);
  } else {
    const entry = {
      id: entryId,
      date: savingsRecordDate(year, month),
      amount,
      savingsItemId: itemId,
      memo: item?.name || '저축',
      source: 'budget',
      year,
      month,
      at: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, entry);
    else asset.savingsLog.push(entry);
  }

  if (delta !== 0) {
    asset.amount = Math.max(0, (asset.amount || 0) + delta);
    asset.history = asset.history || [];
    asset.history.push({
      amount: asset.amount,
      at: new Date().toISOString(),
      source: 'budget-sync',
      savingsItemId: itemId,
      year,
      month,
    });
  }

  return { ok: true, delta, asset, itemId };
}

export function syncSavingsCategoryActuals(data, year, month) {
  const cat = getSavingsCategory(data);
  if (!cat) return [];
  return getVisibleSubItems(data, cat.id).map((item) => {
    const amt = getSubActualAmount(data, year, month, item.id) || 0;
    return syncSavingsSubActualToAsset(data, year, month, item.id, amt);
  });
}

export function reconcileAllSavingsBudgetSync(data) {
  const cat = getSavingsCategory(data);
  if (!cat || !data.budget?.subActuals) return;
  for (const [key, bucket] of Object.entries(data.budget.subActuals)) {
    const m = key.match(/^(\d{4})-(\d{2})$/);
    if (!m) continue;
    const year = Number(m[1]);
    const month = Number(m[2]);
    for (const itemId of Object.keys(bucket || {})) {
      if (!getSubItems(data, cat.id).some((i) => i.id === itemId)) continue;
      const amt = getSubActualAmount(data, year, month, itemId) || 0;
      syncSavingsSubActualToAsset(data, year, month, itemId, amt);
    }
  }
}
