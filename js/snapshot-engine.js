import { ymKey, uid } from './format.js';
import {
  getBudgetStart,
  isBeforeBudgetStart,
  getSavingsCategory,
  getSubItems,
  getSubActualAmount,
  findSubItemCategoryId,
} from './budget-engine.js';
import { syncSavingsSubActualToAsset } from './savings-sync.js';
import { syncLoanSubActualToAsset } from './loan-sync.js';

function now() {
  return new Date().toISOString();
}

function isOnOrBefore(y1, m1, y2, m2) {
  return y1 < y2 || (y1 === y2 && m1 <= m2);
}

function parseMonthKey(key) {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** 시뮬레이션용 — budget-sync 반영 전 잔액으로 되돌림 */
function resetAssetsForSimulation(data) {
  for (const item of data.assets?.items || []) {
    item.savingsLog = (item.savingsLog || []).filter((e) => e.source !== 'budget');
    item.repaymentLog = (item.repaymentLog || []).filter((e) => e.source !== 'budget');
    if (item.valuations?.length) {
      item.valuations = item.valuations.filter((v) => v.source !== 'budget-sync');
    }
    if (item.type === 'loan') {
      const base = item.originalPrincipal ?? item.history?.find((h) => h.source !== 'budget-sync')?.amount
        ?? item.history?.[0]?.amount ?? item.amount;
      item.amount = Math.max(0, Number(base) || 0);
    } else {
      const h = (item.history || []).find((x) => x.source !== 'budget-sync') || item.history?.[0];
      item.amount = h ? Math.max(0, Number(h.amount) || 0) : Math.max(0, Number(item.amount) || 0);
    }
  }
}

function reconcileSavingsThroughMonth(data, maxYear, maxMonth) {
  const cat = getSavingsCategory(data);
  if (!cat || !data.budget?.subActuals) return;
  for (const [key, bucket] of Object.entries(data.budget.subActuals)) {
    const parsed = parseMonthKey(key);
    if (!parsed || !isOnOrBefore(parsed.year, parsed.month, maxYear, maxMonth)) continue;
    for (const itemId of Object.keys(bucket || {})) {
      if (!getSubItems(data, cat.id).some((i) => i.id === itemId)) continue;
      const amt = getSubActualAmount(data, parsed.year, parsed.month, itemId) || 0;
      syncSavingsSubActualToAsset(data, parsed.year, parsed.month, itemId, amt);
    }
  }
}

function reconcileLoansThroughMonth(data, maxYear, maxMonth) {
  if (!data.budget?.subActuals) return;
  for (const [key, bucket] of Object.entries(data.budget.subActuals)) {
    const parsed = parseMonthKey(key);
    if (!parsed || !isOnOrBefore(parsed.year, parsed.month, maxYear, maxMonth)) continue;
    for (const itemId of Object.keys(bucket || {})) {
      const catId = findSubItemCategoryId(data, itemId);
      if (!catId) continue;
      const items = data.budget.subItemsByCategory?.[catId] || [];
      if (!items.find((i) => i.id === itemId)?.loanId) continue;
      const amt = getSubActualAmount(data, parsed.year, parsed.month, itemId) || 0;
      syncLoanSubActualToAsset(data, parsed.year, parsed.month, itemId, amt);
    }
  }
}

function applyValuationsThroughMonth(data, throughYm) {
  for (const item of data.assets?.items || []) {
    if (item.type !== 'invest' && item.type !== 'realestate') continue;
    const vals = (item.valuations || []).filter((v) => v.ym <= throughYm);
    if (!vals.length) continue;
    vals.sort((a, b) => String(a.ym).localeCompare(String(b.ym)));
    item.amount = Math.max(0, Number(vals[vals.length - 1].amount) || 0);
  }
}

/** 특정 월 말 기준 순자산 (저축·대출 원금 반영 replay) */
export function computeNetWorthAtMonth(data, year, month, computeNetWorthFn) {
  const sim = structuredClone(data);
  resetAssetsForSimulation(sim);
  reconcileSavingsThroughMonth(sim, year, month);
  reconcileLoansThroughMonth(sim, year, month);
  const throughYm = ymKey(year, month);
  applyValuationsThroughMonth(sim, throughYm);
  return computeNetWorthFn(sim, throughYm);
}

export function monthHasBudgetEntry(data, year, month) {
  if (!data.budget?.setupDone) return false;
  const key = ymKey(year, month);
  const actualMonth = data.budget.actuals?.[key];
  if (actualMonth && Object.keys(actualMonth).length > 0) return true;
  const subMonth = data.budget.subActuals?.[key];
  if (subMonth && Object.keys(subMonth).length > 0) return true;
  for (const tx of data.transactions || []) {
    const d = new Date(tx.date);
    if (d.getFullYear() === year && d.getMonth() + 1 === month && tx.type === 'income') return true;
  }
  for (const asset of data.assets?.items || []) {
    for (const entry of asset.savingsLog || []) {
      if (entry.source === 'budget') continue;
      const d = new Date(entry.date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) return true;
    }
  }
  const throughYm = ymKey(year, month);
  for (const item of data.assets?.items || []) {
    if ((item.valuations || []).some((v) => v.ym === throughYm)) return true;
  }
  return false;
}

function collectSnapshotMonths(data) {
  const start = getBudgetStart(data);
  if (!start) return [];
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  const set = new Set();

  for (const key of Object.keys(data.budget?.subActuals || {})) {
    const parsed = parseMonthKey(key);
    if (parsed && !isBeforeBudgetStart(data, parsed.year, parsed.month)) {
      set.add(`${parsed.year}-${parsed.month}`);
    }
  }
  for (const key of Object.keys(data.budget?.actuals || {})) {
    const parsed = parseMonthKey(key);
    if (parsed && !isBeforeBudgetStart(data, parsed.year, parsed.month)) {
      set.add(`${parsed.year}-${parsed.month}`);
    }
  }
  for (const item of data.assets?.items || []) {
    for (const v of item.valuations || []) {
      const parsed = parseMonthKey(v.ym);
      if (parsed && !isBeforeBudgetStart(data, parsed.year, parsed.month)) {
        set.add(`${parsed.year}-${parsed.month}`);
      }
    }
  }

  let y = start.year;
  let m = start.month;
  while (y < endY || (y === endY && m <= endM)) {
    if (monthHasBudgetEntry(data, y, m)) set.add(`${y}-${m}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  return [...set]
    .map((k) => {
      const [ys, ms] = k.split('-');
      return { year: Number(ys), month: Number(ms) };
    })
    .filter(({ year, month }) => !isBeforeBudgetStart(data, year, month))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

/** 저축·대출 원금 반영 월별 순자산 자동 기록 */
export function rebuildAutoSnapshots(data, computeNetWorth) {
  if (!data.assets?.items?.length) return false;

  const months = collectSnapshotMonths(data);
  if (!months.length) {
    const had = (data.assets.snapshots || []).length > 0;
    data.assets.snapshots = [];
    return had;
  }

  const prevByKey = new Map(
    (data.assets.snapshots || []).map((s) => [`${s.year}-${s.month}`, s]),
  );
  const newSnaps = months.map(({ year, month }) => {
    const nw = computeNetWorthAtMonth(
      data, year, month, (d, throughYm) => computeNetWorth(d, 'all', throughYm),
    );
    const key = `${year}-${month}`;
    const prev = prevByKey.get(key);
    return {
      id: prev?.id ?? uid(),
      year,
      month,
      assets: nw.assets,
      liabilities: nw.liabilities,
      net: nw.net,
      source: 'auto',
      createdAt: prev?.createdAt ?? now(),
      updatedAt: now(),
    };
  });

  const changed = JSON.stringify(newSnaps) !== JSON.stringify(data.assets.snapshots);
  data.assets.snapshots = newSnaps;
  return changed;
}
