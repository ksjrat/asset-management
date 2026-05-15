import { ymKey, parseYm } from './format.js';

function now() {
  return new Date().toISOString();
}

export function monthIndex(year, month) {
  return year * 12 + month;
}

export function ensureBudgetStructure(data) {
  const b = data.budget;
  if (!b.monthlyPlan) b.monthlyPlan = {};
  if (!b.actuals) b.actuals = {};
  if (b.setupDone === undefined) b.setupDone = false;
  if (!b.defaultRecordDay) b.defaultRecordDay = 25;
  for (const c of b.categories) {
    if (c.recordDay == null) c.recordDay = null;
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

export function getMonthlyPlanAmount(data, year, catId) {
  ensureBudgetStructure(data);
  return data.budget.monthlyPlan[String(year)]?.[catId] ?? 0;
}

export function setMonthlyPlanAmount(data, year, catId, amount) {
  ensureBudgetStructure(data);
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
  const hasPlan = Object.keys(b.monthlyPlan[yKey] || {}).some((id) => b.monthlyPlan[yKey][id] > 0);
  if (hasPlan || Object.keys(b.monthlyPlan[yKey] || {}).length > 0) {
    const visible = b.categories.filter((c) => !c.hidden);
    if (visible.length > 0 && !b.setupDone) b.setupDone = true;
  }

  if (b.setupDone && (!b.startYear || !b.startMonth)) {
    const now = new Date();
    setBudgetStart(data, now.getFullYear(), now.getMonth() + 1);
  }
}
