import { ymKey, parseYm } from './format.js';

export const DEFAULT_SAVINGS_ITEM_NAMES = [
  '비상금', '여행', '주택', '자동차', '결혼', '육아', '노후', '투자', '목표적금', '기타',
];

function now() {
  return new Date().toISOString();
}

export function monthIndex(year, month) {
  return year * 12 + month;
}

export function getSavingsCategory(data) {
  return data.budget?.categories?.find((c) => c.name === '저축') || null;
}

function subItemsList(data, catId) {
  const b = data.budget;
  if (!b) return [];
  if (!b.subItemsByCategory) b.subItemsByCategory = {};
  if (!b.subItemsByCategory[catId]) b.subItemsByCategory[catId] = [];
  return b.subItemsByCategory[catId];
}

export function getSubItems(data, catId) {
  return subItemsList(data, catId);
}

export function getVisibleSubItems(data, catId) {
  return subItemsList(data, catId).filter((i) => !i.hidden);
}

export function hasSubItems(data, catId) {
  return getVisibleSubItems(data, catId).length > 0;
}

export function findSubItemCategoryId(data, itemId) {
  ensureBudgetStructure(data);
  for (const [catId, items] of Object.entries(data.budget.subItemsByCategory || {})) {
    if (items.some((i) => i.id === itemId)) return catId;
  }
  return null;
}

export function getSubMonthlyPlanAmount(data, year, itemId) {
  ensureBudgetStructure(data);
  return data.budget.subMonthlyPlan[String(year)]?.[itemId] ?? 0;
}

export function setSubMonthlyPlanAmount(data, year, catId, itemId, amount) {
  ensureBudgetStructure(data);
  const y = String(year);
  if (!data.budget.subMonthlyPlan[y]) data.budget.subMonthlyPlan[y] = {};
  data.budget.subMonthlyPlan[y][itemId] = Math.max(0, Number(amount) || 0);
  syncSubEnvelopeMonthlyPlan(data, year, catId);
}

export function getSubMonthlyPlanTotal(data, year, catId) {
  return getVisibleSubItems(data, catId).reduce(
    (s, i) => s + getSubMonthlyPlanAmount(data, year, i.id), 0,
  );
}

export function syncSubEnvelopeMonthlyPlan(data, year, catId) {
  const y = String(year);
  if (!data.budget.monthlyPlan[y]) data.budget.monthlyPlan[y] = {};
  data.budget.monthlyPlan[y][catId] = getSubMonthlyPlanTotal(data, year, catId);
}

export function getSubActualEntry(data, year, month, itemId) {
  ensureBudgetStructure(data);
  const key = ymKey(year, month);
  return data.budget.subActuals[key]?.[itemId] ?? null;
}

export function getSubActualAmount(data, year, month, itemId) {
  const entry = getSubActualEntry(data, year, month, itemId);
  return entry?.amount ?? null;
}

export function setSubActualAmount(data, year, month, catId, itemId, amount) {
  ensureBudgetStructure(data);
  const key = ymKey(year, month);
  if (!data.budget.subActuals[key]) data.budget.subActuals[key] = {};
  const val = Math.max(0, Number(amount) || 0);
  if (val === 0) {
    delete data.budget.subActuals[key][itemId];
    if (!Object.keys(data.budget.subActuals[key]).length) delete data.budget.subActuals[key];
  } else {
    data.budget.subActuals[key][itemId] = { amount: val, recordedAt: now() };
  }
  syncSubEnvelopeActual(data, year, month, catId);
}

export function getSubActualsSum(data, year, month, catId) {
  return getVisibleSubItems(data, catId).reduce(
    (s, i) => s + (getSubActualAmount(data, year, month, i.id) || 0), 0,
  );
}

export function hasSubActuals(data, year, month, catId) {
  const key = ymKey(year, month);
  const bucket = data.budget?.subActuals?.[key];
  if (!bucket) return false;
  const ids = new Set(getVisibleSubItems(data, catId).map((i) => i.id));
  return [...ids].some((id) => (bucket[id]?.amount || 0) > 0);
}

export function syncSubEnvelopeActual(data, year, month, catId) {
  const sum = getSubActualsSum(data, year, month, catId);
  if (sum > 0 || hasSubActuals(data, year, month, catId)) {
    setActualAmount(data, year, month, catId, sum);
  } else {
    const key = ymKey(year, month);
    if (data.budget.actuals[key]?.[catId]) {
      delete data.budget.actuals[key][catId];
      if (!Object.keys(data.budget.actuals[key]).length) delete data.budget.actuals[key];
    }
  }
}

export function getSubSummary(data, year, month, catId) {
  const items = getVisibleSubItems(data, catId);
  let filledCount = 0;
  let sum = 0;
  for (const item of items) {
    const amt = getSubActualAmount(data, year, month, item.id) || 0;
    if (amt > 0) filledCount++;
    sum += amt;
  }
  return { filledCount, total: sum, itemCount: items.length };
}

export function addSubItemActual(data, dateStr, amount, itemId) {
  if (!data.budget?.setupDone || !itemId) return;
  const catId = findSubItemCategoryId(data, itemId);
  if (!catId) return;
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const prev = getSubActualAmount(data, y, m, itemId) || 0;
  setSubActualAmount(data, y, m, catId, itemId, prev + amount);
}

export function subtractSubItemActual(data, dateStr, amount, itemId) {
  if (!data.budget?.setupDone || !itemId) return;
  const catId = findSubItemCategoryId(data, itemId);
  if (!catId) return;
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const prev = getSubActualAmount(data, y, m, itemId) || 0;
  setSubActualAmount(data, y, m, catId, itemId, Math.max(0, prev - amount));
}

/** @deprecated 저축 전용 — getVisibleSubItems(data, catId) 사용 */
export function getVisibleSavingsItems(data) {
  const cat = getSavingsCategory(data);
  return cat ? getVisibleSubItems(data, cat.id) : [];
}

export function getSavingsMonthlyPlanAmount(data, year, itemId) {
  return getSubMonthlyPlanAmount(data, year, itemId);
}

export function setSavingsMonthlyPlanAmount(data, year, itemId, amount) {
  const catId = findSubItemCategoryId(data, itemId) || getSavingsCategory(data)?.id;
  if (catId) setSubMonthlyPlanAmount(data, year, catId, itemId, amount);
}

export function syncSavingsEnvelopeMonthlyPlan(data, year) {
  const cat = getSavingsCategory(data);
  if (cat) syncSubEnvelopeMonthlyPlan(data, year, cat.id);
}

export function getSavingsActualAmount(data, year, month, itemId) {
  return getSubActualAmount(data, year, month, itemId);
}

export function setSavingsActualAmount(data, year, month, itemId, amount) {
  const catId = findSubItemCategoryId(data, itemId) || getSavingsCategory(data)?.id;
  if (catId) setSubActualAmount(data, year, month, catId, itemId, amount);
}

export function getSavingsSubSummary(data, year, month) {
  const cat = getSavingsCategory(data);
  return cat ? getSubSummary(data, year, month, cat.id) : { filledCount: 0, total: 0, itemCount: 0 };
}

export function addSavingsItemActual(data, dateStr, amount, itemId = null) {
  const cat = getSavingsCategory(data);
  if (!cat) return;
  const items = getVisibleSubItems(data, cat.id);
  const targetId = itemId || items.find((i) => i.name === '기타')?.id || items[0]?.id;
  if (targetId) addSubItemActual(data, dateStr, amount, targetId);
}

export function subtractSavingsItemActual(data, dateStr, amount, itemId = null) {
  const cat = getSavingsCategory(data);
  if (!cat) return;
  const items = getVisibleSubItems(data, cat.id);
  const targetId = itemId || items.find((i) => i.name === '기타')?.id || items[0]?.id;
  if (targetId) subtractSubItemActual(data, dateStr, amount, targetId);
}

function migrateLegacySubItems(data) {
  const b = data.budget;
  if (!b.subItemsByCategory) b.subItemsByCategory = {};
  if (!b.subMonthlyPlan) b.subMonthlyPlan = {};
  if (!b.subActuals) b.subActuals = {};

  const savingsCat = getSavingsCategory(data);
  if (b.savingsItems?.length && savingsCat && !b.subItemsByCategory[savingsCat.id]?.length) {
    b.subItemsByCategory[savingsCat.id] = b.savingsItems;
  }
  if (b.savingsMonthlyPlan) {
    for (const [y, items] of Object.entries(b.savingsMonthlyPlan)) {
      if (!b.subMonthlyPlan[y]) b.subMonthlyPlan[y] = {};
      Object.assign(b.subMonthlyPlan[y], items);
    }
  }
  if (b.savingsActuals) {
    for (const [key, items] of Object.entries(b.savingsActuals)) {
      if (!b.subActuals[key]) b.subActuals[key] = {};
      Object.assign(b.subActuals[key], items);
    }
  }
  delete b.savingsItems;
  delete b.savingsMonthlyPlan;
  delete b.savingsActuals;
}

export function ensureBudgetStructure(data) {
  const b = data.budget;
  if (!b.subItemsByCategory) b.subItemsByCategory = {};
  if (!b.subMonthlyPlan) b.subMonthlyPlan = {};
  if (!b.subActuals) b.subActuals = {};
  if (!b.monthlyPlan) b.monthlyPlan = {};
  if (!b.actuals) b.actuals = {};
  migrateLegacySubItems(data);
  const savingsCat = getSavingsCategory(data);
  if (savingsCat && !(b.subItemsByCategory[savingsCat.id]?.length)) {
    b.subItemsByCategory[savingsCat.id] = DEFAULT_SAVINGS_ITEM_NAMES.map((name, i) => ({
      id: `sav-${i}`, name, hidden: false, payer: 'joint',
    }));
  }
  for (const items of Object.values(b.subItemsByCategory || {})) {
    for (const item of items) {
      if (!item.payer) item.payer = 'joint';
    }
  }
  if (b.setupDone === undefined) b.setupDone = false;
  if (!b.defaultRecordDay) b.defaultRecordDay = 25;
  for (const c of b.categories) {
    if (c.recordDay == null) c.recordDay = null;
    if (!c.payer) c.payer = 'joint';
  }
}

export function getBudgetStart(data) {
  ensureBudgetStructure(data);
  const { startYear, startMonth } = data.budget;
  if (startYear && startMonth) return { year: startYear, month: startMonth };
  return null;
}

export function setBudgetStart(data, year, month) {
  ensureBudgetStructure(data);
  data.budget.startYear = year;
  data.budget.startMonth = Math.min(12, Math.max(1, month));
}

export function isBeforeBudgetStart(data, year, month) {
  const start = getBudgetStart(data);
  if (!start) return false;
  return monthIndex(year, month) < monthIndex(start.year, start.month);
}

export function isBudgetStartMonth(data, year, month) {
  const start = getBudgetStart(data);
  if (!start) return false;
  return start.year === year && start.month === month;
}

export function getRecordDay(data, category) {
  return category?.recordDay ?? data.budget.defaultRecordDay ?? 25;
}

export function isSubdividedCategoryId(data, catId) {
  return hasSubItems(data, catId);
}

/** @deprecated */
export function isSavingsCategoryId(data, catId) {
  return isSubdividedCategoryId(data, catId);
}

export function getMonthlyPlanAmount(data, year, catId) {
  ensureBudgetStructure(data);
  if (hasSubItems(data, catId)) {
    return getSubMonthlyPlanTotal(data, year, catId);
  }
  return data.budget.monthlyPlan[String(year)]?.[catId] ?? 0;
}

export function setMonthlyPlanAmount(data, year, catId, amount) {
  ensureBudgetStructure(data);
  if (hasSubItems(data, catId)) return;
  const y = String(year);
  if (!data.budget.monthlyPlan[y]) data.budget.monthlyPlan[y] = {};
  data.budget.monthlyPlan[y][catId] = Math.max(0, Number(amount) || 0);
}

export function getActualEntry(data, year, month, catId) {
  ensureBudgetStructure(data);
  const key = ymKey(year, month);
  return data.budget.actuals[key]?.[catId] ?? null;
}

export function getActualAmount(data, year, month, catId) {
  const entry = getActualEntry(data, year, month, catId);
  return entry?.amount ?? null;
}

export function setActualAmount(data, year, month, catId, amount) {
  ensureBudgetStructure(data);
  const key = ymKey(year, month);
  if (!data.budget.actuals[key]) data.budget.actuals[key] = {};
  data.budget.actuals[key][catId] = {
    amount: Math.max(0, Number(amount) || 0),
    recordedAt: now(),
  };
}

/** 이전 달 잔액 이월 — 시작월 이전·시작월에는 이월 없음 */
export function getRolloverIn(data, year, month, catId) {
  const start = getBudgetStart(data);
  const cur = monthIndex(year, month);
  if (start && cur <= monthIndex(start.year, start.month)) return 0;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  if (start && monthIndex(prevYear, prevMonth) < monthIndex(start.year, start.month)) return 0;

  return getCategoryPeriodSummary(data, prevYear, prevMonth, catId).remaining;
}

export function getCategoryPeriodSummary(data, year, month, catId) {
  if (isBeforeBudgetStart(data, year, month)) {
    const entry = getActualEntry(data, year, month, catId);
    const hasActual = entry != null;
    return {
      monthlyPlanned: 0,
      rolloverIn: 0,
      available: 0,
      actual: hasActual ? entry.amount : 0,
      remaining: 0,
      hasActual,
      usedPct: 0,
      beforeStart: true,
    };
  }

  const monthlyPlanned = getMonthlyPlanAmount(data, year, catId);
  const rolloverIn = getRolloverIn(data, year, month, catId);
  const available = monthlyPlanned + rolloverIn;
  const entry = getActualEntry(data, year, month, catId);
  const hasActual = entry != null;
  const actual = hasActual ? entry.amount : 0;
  const remaining = available - actual;
  const usedPct = available > 0 ? actual / available : (actual > 0 ? 1.2 : 0);
  return {
    monthlyPlanned,
    rolloverIn,
    available,
    actual,
    remaining,
    hasActual,
    usedPct,
    beforeStart: false,
  };
}

export function getPeriodTotals(data, year, month, categories) {
  let planned = 0;
  let available = 0;
  let actual = 0;
  let rolloverIn = 0;
  let remaining = 0;
  let dueCount = 0;
  for (const c of categories) {
    const s = getCategoryPeriodSummary(data, year, month, c.id);
    planned += s.monthlyPlanned;
    available += s.available;
    actual += s.actual;
    rolloverIn += s.rolloverIn;
    remaining += s.remaining;
    if (isRecordDue(data, year, month, c.id)) dueCount++;
  }
  return { planned, available, actual, rolloverIn, remaining, dueCount };
}

/** 해당 월·항목 실적 입력 가능 여부 (정산일 이후 또는 과거 월) */
export function canRecordActual(data, year, month, catId) {
  if (isBeforeBudgetStart(data, year, month)) return false;
  const cat = data.budget.categories.find((c) => c.id === catId);
  const recordDay = getRecordDay(data, cat);
  const today = new Date();
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  if (year > ty || (year === ty && month > tm)) return false;
  if (year < ty || (year === ty && month < tm)) return true;
  return today.getDate() >= recordDay;
}

/** 아직 실적 미입력 + 입력 가능 */
export function isRecordDue(data, year, month, catId) {
  if (!canRecordActual(data, year, month, catId)) return false;
  return getActualEntry(data, year, month, catId) == null;
}

export function migrateBudgetModel(data) {
  ensureBudgetStructure(data);
  const b = data.budget;
  const y = new Date().getFullYear();
  const yKey = String(y);

  if (b.annual) {
    for (const [year, cats] of Object.entries(b.annual)) {
      if (!b.monthlyPlan[year]) b.monthlyPlan[year] = {};
      for (const [catId, amt] of Object.entries(cats)) {
        if (amt > 0 && !b.monthlyPlan[year][catId]) {
          b.monthlyPlan[year][catId] = Math.round(Number(amt) / 12);
        }
      }
    }
    delete b.annual;
  }

  if (b.monthly && typeof b.monthly === 'object') {
    for (const [key, cats] of Object.entries(b.monthly)) {
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const { year } = parseYm(key);
      const ys = String(year);
      if (!b.monthlyPlan[ys]) b.monthlyPlan[ys] = {};
      for (const [catId, amt] of Object.entries(cats)) {
        if (amt > 0) {
          b.monthlyPlan[ys][catId] = Math.max(b.monthlyPlan[ys][catId] || 0, Number(amt));
        }
      }
    }
    delete b.monthly;
  }

  if (!b.monthlyPlan[yKey]) b.monthlyPlan[yKey] = {};

  if (b.setupDone && (!b.startYear || !b.startMonth)) {
    const nowD = new Date();
    setBudgetStart(data, nowD.getFullYear(), nowD.getMonth() + 1);
  }

  migrateLegacySubItems(data);
  const savingsCat = getSavingsCategory(data);
  if (savingsCat && !(b.subItemsByCategory[savingsCat.id]?.length)) {
    b.subItemsByCategory[savingsCat.id] = DEFAULT_SAVINGS_ITEM_NAMES.map((name, i) => ({
      id: `sav-${i}`, name, hidden: false, payer: 'joint',
    }));
  }
  if (savingsCat) {
    const items = b.subItemsByCategory[savingsCat.id] || [];
    const miscId = items.find((i) => i.name === '기타')?.id || items[items.length - 1]?.id;
    for (const [key, cats] of Object.entries(b.actuals || {})) {
      const entry = cats[savingsCat.id];
      if (!entry?.amount) continue;
      if (b.subActuals[key] && Object.keys(b.subActuals[key]).length) continue;
      if (!b.subActuals[key]) b.subActuals[key] = {};
      if (miscId) b.subActuals[key][miscId] = { amount: entry.amount, recordedAt: entry.recordedAt || now() };
    }
    syncSubEnvelopeMonthlyPlan(data, y, savingsCat.id);
  }

  const hasPositivePlan = Object.values(b.monthlyPlan || {}).some(
    (yearPlan) => Object.values(yearPlan || {}).some((amt) => Number(amt) > 0),
  );
  const hasActuals = Object.values(b.actuals || {}).some(
    (month) => Object.values(month || {}).some((e) => Number(e?.amount) > 0),
  );
  if (b.setupDone && !hasPositivePlan && !hasActuals) {
    b.setupDone = false;
  } else if (hasPositivePlan && !b.setupDone) {
    const visible = b.categories.filter((c) => !c.hidden);
    if (visible.length > 0) b.setupDone = true;
  }

  for (const tx of data.transactions || []) {
    if (tx.type === 'income' && !tx.owner) tx.owner = 'self';
  }
}
