/** 예산 실적·세부 실적 개수 (동기화·복구 판단) */
export function countBudgetActualEntries(data) {
  let n = 0;
  for (const month of Object.values(data?.budget?.actuals || {})) {
    for (const e of Object.values(month || {})) {
      if (Number(e?.amount) > 0) n += 1;
    }
  }
  for (const month of Object.values(data?.budget?.subActuals || {})) {
    for (const e of Object.values(month || {})) {
      if (Number(e?.amount) > 0) n += 1;
    }
  }
  return n;
}

function entryTime(entry) {
  return new Date(entry?.recordedAt || 0).getTime();
}

/** 월별 실적 맵 병합 — 항목 단위로 더 최근 기록 우선, 없으면 합집합 */
export function mergeBudgetMonthMaps(local = {}, remote = {}) {
  const out = { ...local };
  for (const [ym, remoteMonth] of Object.entries(remote || {})) {
    if (!remoteMonth || typeof remoteMonth !== 'object') continue;
    const merged = { ...(out[ym] || {}) };
    for (const [id, entry] of Object.entries(remoteMonth)) {
      if (!entry || Number(entry.amount) <= 0) continue;
      const localEntry = merged[id];
      if (!localEntry) {
        merged[id] = entry;
        continue;
      }
      merged[id] = entryTime(entry) >= entryTime(localEntry) ? entry : localEntry;
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
      if (!byId.has(item.id)) localItems.push(item);
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
  return merged;
}
