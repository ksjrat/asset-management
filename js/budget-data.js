import { ymKey } from './format.js';
import {
  readBudgetAmount, ensureBudgetStructure, migrateBudgetModel,
} from './budget-engine.js';
import { reconcileAllSavingsBudgetSync } from './savings-sync.js';
import { reconcileAllLoanBudgetSync, ensureLoanFields } from './loan-sync.js';

/** 해당 월에 사용자가 입력한 예산 실적(카테고리·세부)이 있는지 */
export function monthHasUserBudgetActuals(data, year, month) {
  if (!data?.budget?.setupDone) return false;
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const actualMonth = data.budget.actuals?.[key];
  if (actualMonth && Object.keys(actualMonth).length > 0) return true;
  const subMonth = data.budget.subActuals?.[key];
  if (subMonth && Object.keys(subMonth).length > 0) return true;
  return false;
}

/** 예산 실적·세부 실적 개수 (동기화·복구 판단) */
export function countBudgetActualEntries(data) {
  let n = 0;
  for (const month of Object.values(data?.budget?.actuals || {})) {
    for (const e of Object.values(month || {})) {
      if (readBudgetAmount(e) > 0) n += 1;
    }
  }
  for (const month of Object.values(data?.budget?.subActuals || {})) {
    for (const e of Object.values(month || {})) {
      if (readBudgetAmount(e) > 0) n += 1;
    }
  }
  return n;
}

function entryTime(entry) {
  if (entry == null) return 0;
  if (typeof entry === 'number') return 0;
  return new Date(entry?.recordedAt || 0).getTime();
}

function pickNewerBudgetEntry(a, b) {
  const amtA = readBudgetAmount(a);
  const amtB = readBudgetAmount(b);
  if (amtA <= 0 && amtB > 0) return b;
  if (amtB <= 0 && amtA > 0) return a;
  return entryTime(b) >= entryTime(a) ? b : a;
}

/** 2025-8 → 2025-08 등 월 키 통일 (병합·동기화용, 원본 변경 없음) */
function flattenBudgetMonthMap(map = {}) {
  const out = {};
  for (const [key, bucket] of Object.entries(map || {})) {
    const m = String(key).match(/^(\d{4})-(\d{1,2})$/);
    if (!m || !bucket || typeof bucket !== 'object') continue;
    const nKey = ymKey(Number(m[1]), Number(m[2]));
    if (!out[nKey]) out[nKey] = {};
    for (const [id, entry] of Object.entries(bucket)) {
      if (readBudgetAmount(entry) <= 0) continue;
      const prev = out[nKey][id];
      out[nKey][id] = prev ? pickNewerBudgetEntry(prev, entry) : entry;
    }
  }
  return out;
}

/** 월별 실적 맵 병합 — 항목 단위로 더 최근 기록 우선, 없으면 합집합 */
export function mergeBudgetMonthMaps(local = {}, remote = {}) {
  const normLocal = flattenBudgetMonthMap(local);
  const normRemote = flattenBudgetMonthMap(remote);
  const out = { ...normLocal };
  for (const [ym, remoteMonth] of Object.entries(normRemote)) {
    if (!remoteMonth || typeof remoteMonth !== 'object') continue;
    const merged = { ...(out[ym] || {}) };
    for (const [id, entry] of Object.entries(remoteMonth)) {
      if (readBudgetAmount(entry) <= 0) continue;
      const localEntry = merged[id];
      merged[id] = localEntry ? pickNewerBudgetEntry(localEntry, entry) : entry;
    }
    if (Object.keys(merged).length) out[ym] = merged;
    else delete out[ym];
  }
  return out;
}

function mergeYearCategoryMaps(local = {}, remote = {}) {
  const out = { ...local };
  for (const [year, remoteCats] of Object.entries(remote || {})) {
    if (!remoteCats || typeof remoteCats !== 'object') continue;
    out[year] = { ...(out[year] || {}), ...remoteCats };
    for (const [catId, amt] of Object.entries(remoteCats)) {
      const prev = Number(out[year][catId]) || 0;
      const next = Number(amt) || 0;
      out[year][catId] = Math.max(prev, next);
    }
  }
  return out;
}

function mergeSubItemsByCategory(local = {}, remote = {}) {
  const out = { ...local };
  for (const [catId, remoteItems] of Object.entries(remote || {})) {
    if (!Array.isArray(remoteItems)) continue;
    const localItems = [...(out[catId] || [])];
    const byId = new Map(localItems.map((i) => [i.id, i]));
    for (const item of remoteItems) {
      if (!item?.id) continue;
      if (byId.has(item.id)) {
        Object.assign(byId.get(item.id), item);
      } else {
        localItems.push(item);
        byId.set(item.id, item);
      }
    }
    out[catId] = localItems;
  }
  return out;
}

function mergeCategories(local = [], remote = []) {
  const byId = new Map(local.map((c) => [c.id, c]));
  for (const c of remote) {
    if (c?.id && !byId.has(c.id)) byId.set(c.id, c);
  }
  return [...byId.values()];
}

/** 클라우드 병합 시 budget 전체를 덮어쓰지 않도록 실적·계획만 깊게 합침 */
export function mergeBudgetObjects(localBudget, remoteBudget) {
  if (!localBudget) return remoteBudget ? structuredClone(remoteBudget) : {};
  if (!remoteBudget) return { ...localBudget };

  const merged = { ...localBudget, ...remoteBudget };
  merged.actuals = mergeBudgetMonthMaps(localBudget.actuals, remoteBudget.actuals);
  merged.subActuals = mergeBudgetMonthMaps(localBudget.subActuals, remoteBudget.subActuals);
  merged.monthlyPlan = mergeYearCategoryMaps(localBudget.monthlyPlan, remoteBudget.monthlyPlan);
  merged.subMonthlyPlan = mergeYearCategoryMaps(localBudget.subMonthlyPlan, remoteBudget.subMonthlyPlan);
  merged.subItemsByCategory = mergeSubItemsByCategory(
    localBudget.subItemsByCategory,
    remoteBudget.subItemsByCategory,
  );
  if (localBudget.categories?.length || remoteBudget.categories?.length) {
    merged.categories = mergeCategories(localBudget.categories || [], remoteBudget.categories || []);
  }
  merged.setupDone = !!(localBudget.setupDone || remoteBudget.setupDone);
  delete merged.savingsActuals;
  delete merged.savingsItems;
  delete merged.savingsMonthlyPlan;
  return merged;
}

/** 클라우드 pull/push 직후 — 실적 키 정규화·구형 필드 마이그레이션·자산 연동 */
export function finalizeBudgetAfterSync(data) {
  if (!data?.budget) return;
  ensureBudgetStructure(data);
  migrateBudgetModel(data);
  for (const item of data.assets?.items || []) ensureLoanFields(item);
  reconcileAllSavingsBudgetSync(data);
  reconcileAllLoanBudgetSync(data);
}
