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
  ensureBudgetStructure(data);
  const cats = data.budget?.categories || [];
  const hidden = new Set(data.settings?.hiddenCategories || []);
  const visible = cats.filter((c) => !c.hidden && !hidden.has(c.id));
  return visible.find((c) => c.name === '저축') || cats.find((c) => c.name === '저축') || null;
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

export function getSubMonthlyPlanAmount(data, year, month, itemId) {
  ensureBudgetStructure(data);
  const key = ymKey(year, month);
  // 월별 키 우선, 없으면 구버전 연도 키 폴백
  return data.budget.subMonthlyPlan[key]?.[itemId]
    ?? data.budget.subMonthlyPlan[String(year)]?.[itemId]
    ?? 0;
}

export function setSubMonthlyPlanAmount(data, year, month, catId, itemId, amount) {
  ensureBudgetStructure(data);
  const key = ymKey(year, month);
  if (!data.budget.subMonthlyPlan[key]) data.budget.subMonthlyPlan[key] = {};
  data.budget.subMonthlyPlan[key][itemId] = Math.max(0, Number(amount) || 0);
  syncSubEnvelopeMonthlyPlan(data, year, month, catId);
}

export function getSubMonthlyPlanTotal(data, year, month, catId) {
  return getVisibleSubItems(data, catId).reduce(
    (s, i) => s + getSubMonthlyPlanAmount(data, year, month, i.id), 0,
  );
}

export function syncSubEnvelopeMonthlyPlan(data, year, month, catId) {
  const key = ymKey(year, month);
  if (!data.budget.monthlyPlan[key]) data.budget.monthlyPlan[key] = {};
  data.budget.monthlyPlan[key][catId] = getSubMonthlyPlanTotal(data, year, month, catId);
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

let onSavingsSubActualSet = null;
let onLoanSubActualSet = null;

/** 저축 세부 실적 저장 시 자산 잔액 연동 (store에서 등록) */
export function setOnSavingsSubActualSet(fn) {
  onSavingsSubActualSet = fn;
}

/** 대출 연결 세부 실적 저장 시 대출 잔액 연동 (store에서 등록) */
export function setOnLoanSubActualSet(fn) {
  onLoanSubActualSet = fn;
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
  const savingsCat = getSavingsCategory(data);
  if (onSavingsSubActualSet && savingsCat && catId === savingsCat.id) {
    onSavingsSubActualSet(data, year, month, itemId, val);
  }
  if (onLoanSubActualSet) {
    onLoanSubActualSet(data, year, month, itemId, val);
  }
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

export function getSavingsMonthlyPlanAmount(data, year, month, itemId) {
  return getSubMonthlyPlanAmount(data, year, month, itemId);
}

export function setSavingsMonthlyPlanAmount(data, year, month, itemId, amount) {
  const catId = findSubItemCategoryId(data, itemId) || getSavingsCategory(data)?.id;
  if (catId) setSubMonthlyPlanAmount(data, year, month, catId, itemId, amount);
}

export function syncSavingsEnvelopeMonthlyPlan(data, year, month) {
  const cat = getSavingsCategory(data);
  if (cat) syncSubEnvelopeMonthlyPlan(data, year, month, cat.id);
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
  if (!b.recordSchedule) b.recordSchedule = RECORD_SCHEDULE_FIXED;
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

export const RECORD_SCHEDULE_FIXED = 'fixed';
export const RECORD_SCHEDULE_NEXT_MONTH_FIRST_SUNDAY = 'next_month_first_sunday';

export const RECORD_SCHEDULES = [
  { id: RECORD_SCHEDULE_NEXT_MONTH_FIRST_SUNDAY, label: '다음 달 첫째 주 일요일' },
  { id: RECORD_SCHEDULE_FIXED, label: '매달 고정일 (1~28일)' },
];

export function getRecordSchedule(data, category = null) {
  return category?.recordSchedule ?? data.budget?.recordSchedule ?? RECORD_SCHEDULE_FIXED;
}

export function getRecordDay(data, category) {
  return category?.recordDay ?? data.budget.defaultRecordDay ?? 25;
}

/** 해당 월의 첫 번째 일요일 (로컬 날짜) */
export function getFirstSundayOfMonth(year, month) {
  const first = new Date(year, month - 1, 1);
  const offset = first.getDay() === 0 ? 0 : 7 - first.getDay();
  return new Date(year, month - 1, 1 + offset);
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 예산 월(year-month) 실적을 입력할 수 있게 되는 날 */
export function getRecordOpensDate(data, category, budgetYear, budgetMonth) {
  const schedule = getRecordSchedule(data, category);
  if (schedule === RECORD_SCHEDULE_NEXT_MONTH_FIRST_SUNDAY) {
    const nextMonth = budgetMonth === 12 ? 1 : budgetMonth + 1;
    const nextYear = budgetMonth === 12 ? budgetYear + 1 : budgetYear;
    return getFirstSundayOfMonth(nextYear, nextMonth);
  }
  const day = getRecordDay(data, category);
  return new Date(budgetYear, budgetMonth - 1, day);
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function formatRecordOpensLabel(data, category, budgetYear, budgetMonth) {
  const schedule = getRecordSchedule(data, category);
  if (schedule === RECORD_SCHEDULE_NEXT_MONTH_FIRST_SUNDAY) {
    const d = getRecordOpensDate(data, category, budgetYear, budgetMonth);
    return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_KO[d.getDay()]})`;
  }
  return `${getRecordDay(data, category)}일`;
}

/** 배너 등 — 현재 보고 있는 달 기준 입력 가능 시점 */
export function getRecordScheduleLabel(data) {
  const id = getRecordSchedule(data);
  return RECORD_SCHEDULES.find((s) => s.id === id)?.label ?? '매달 고정일';
}

export function formatRecordOpensHint(data, budgetYear, budgetMonth) {
  const schedule = getRecordSchedule(data);
  if (schedule === RECORD_SCHEDULE_NEXT_MONTH_FIRST_SUNDAY) {
    const d = getRecordOpensDate(data, null, budgetYear, budgetMonth);
    return `${d.getMonth() + 1}월 ${d.getDate()}일(일)부터`;
  }
  return `${getRecordDay(data)}일부터`;
}

export function isSubdividedCategoryId(data, catId) {
  return hasSubItems(data, catId);
}

/** @deprecated */
export function isSavingsCategoryId(data, catId) {
  return isSubdividedCategoryId(data, catId);
}

export function getMonthlyPlanAmount(data, year, month, catId) {
  ensureBudgetStructure(data);
  if (hasSubItems(data, catId)) {
    return getSubMonthlyPlanTotal(data, year, month, catId);
  }
  const key = ymKey(year, month);
  // 월별 키 우선, 없으면 구버전 연도 키 폴백
  return data.budget.monthlyPlan[key]?.[catId]
    ?? data.budget.monthlyPlan[String(year)]?.[catId]
    ?? 0;
}

export function setMonthlyPlanAmount(data, year, month, catId, amount) {
  ensureBudgetStructure(data);
  if (hasSubItems(data, catId)) return;
  const key = ymKey(year, month);
  if (!data.budget.monthlyPlan[key]) data.budget.monthlyPlan[key] = {};
  data.budget.monthlyPlan[key][catId] = Math.max(0, Number(amount) || 0);
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

export function setActualAmount(data, year, month, catId, amount, payer) {
  ensureBudgetStructure(data);
  const key = ymKey(year, month);
  if (!data.budget.actuals[key]) data.budget.actuals[key] = {};
  const prev = getActualEntry(data, year, month, catId);
  const entry = {
    amount: Math.max(0, Number(amount) || 0),
    recordedAt: now(),
  };
  const resolvedPayer = payer ?? prev?.payer;
  if (resolvedPayer) entry.payer = resolvedPayer;
  data.budget.actuals[key][catId] = entry;
}

/** @deprecated 이월 기능 제거 — 항상 0 */
export function getRolloverIn(_data, _year, _month, _catId) {
  return 0;
}

export function deleteSubItem(data, catId, itemId) {
  ensureBudgetStructure(data);
  const items = subItemsList(data, catId);
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) return false;
  items.splice(idx, 1);
  for (const bucket of Object.values(data.budget.subActuals || {})) {
    delete bucket[itemId];
  }
  for (const bucket of Object.values(data.budget.subMonthlyPlan || {})) {
    delete bucket[itemId];
  }
  const keys = new Set([
    ...Object.keys(data.budget.subActuals || {}),
    ...Object.keys(data.budget.subMonthlyPlan || {}),
    ...Object.keys(data.budget.actuals || {}),
    ...Object.keys(data.budget.monthlyPlan || {}),
  ]);
  for (const key of keys) {
    const parsed = parseYm(key);
    if (!parsed) continue;
    syncSubEnvelopeMonthlyPlan(data, parsed.year, parsed.month, catId);
    syncSubEnvelopeActual(data, parsed.year, parsed.month, catId);
  }
  return true;
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
      monthDelta: null,
      monthUsedPct: 0,
      beforeStart: true,
    };
  }

  const monthlyPlanned = getMonthlyPlanAmount(data, year, month, catId);
  const rolloverIn = 0;
  const available = monthlyPlanned;
  const entry = getActualEntry(data, year, month, catId);
  const hasActual = entry != null;
  const actual = hasActual ? entry.amount : 0;
  const remaining = monthlyPlanned - actual;
  const usedPct = available > 0 ? actual / available : (actual > 0 ? 1.2 : 0);
  const monthDelta = hasActual ? actual - monthlyPlanned : null;
  const monthUsedPct = monthlyPlanned > 0 ? actual / monthlyPlanned : (actual > 0 ? 1.2 : 0);
  return {
    monthlyPlanned,
    rolloverIn,
    available,
    actual,
    remaining,
    hasActual,
    usedPct,
    monthDelta,
    monthUsedPct,
    beforeStart: false,
  };
}

export function getPeriodTotals(data, year, month, categories) {
  let planned = 0;
  let available = 0;
  let actual = 0;
  let rolloverIn = 0;
  let remaining = 0;
  let monthDelta = 0;
  let dueCount = 0;
  for (const c of categories) {
    const s = getCategoryPeriodSummary(data, year, month, c.id);
    planned += s.monthlyPlanned;
    available += s.available;
    actual += s.actual;
    rolloverIn += s.rolloverIn;
    remaining += s.remaining;
    if (s.monthDelta != null) monthDelta += s.monthDelta;
    if (isRecordDue(data, year, month, c.id)) dueCount++;
  }
  return { planned, available, actual, rolloverIn, remaining, monthDelta, dueCount };
}

/** 해당 월·항목 실적 입력 가능 여부 (정산일 이후 또는 과거 월) */
export function canRecordActual(data, year, month, catId) {
  if (isBeforeBudgetStart(data, year, month)) return false;
  const cat = data.budget.categories.find((c) => c.id === catId);
  const today = startOfLocalDay(new Date());
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  if (year > ty || (year === ty && month > tm)) return false;
  if (year < ty || (year === ty && month < tm)) return true;
  const opens = startOfLocalDay(getRecordOpensDate(data, cat, year, month));
  return today >= opens;
}

/** 아직 실적 미입력 + 입력 가능 */
export function isRecordDue(data, year, month, catId) {
  if (!canRecordActual(data, year, month, catId)) return false;
  return getActualEntry(data, year, month, catId) == null;
}

/** 정산일이 지났고 모든 항목 실적이 입력된 달인지 */
export function isMonthSettlementComplete(data, year, month, categories) {
  if (!data.budget?.setupDone) return false;
  if (isBeforeBudgetStart(data, year, month)) return false;
  if (!categories.length) return false;
  for (const c of categories) {
    if (!canRecordActual(data, year, month, c.id)) return false;
    if (isRecordDue(data, year, month, c.id)) return false;
  }
  return true;
}

export function migrateBudgetModel(data) {
  ensureBudgetStructure(data);
  const b = data.budget;
  const now2 = new Date();
  const y = now2.getFullYear();
  const curMonth = now2.getMonth() + 1;
  const yKey = ymKey(y, curMonth);

  if (b.annual) {
    for (const [year, cats] of Object.entries(b.annual)) {
      // 구버전 연간 데이터 → 해당 연도 모든 월에 배포
      for (let m = 1; m <= 12; m++) {
        const mKey = ymKey(Number(year), m);
        if (!b.monthlyPlan[mKey]) b.monthlyPlan[mKey] = {};
        for (const [catId, amt] of Object.entries(cats)) {
          if (amt > 0 && !b.monthlyPlan[mKey][catId]) {
            b.monthlyPlan[mKey][catId] = Math.round(Number(amt) / 12);
          }
        }
      }
    }
    delete b.annual;
  }

  if (b.monthly && typeof b.monthly === 'object') {
    for (const [key, cats] of Object.entries(b.monthly)) {
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      if (!b.monthlyPlan[key]) b.monthlyPlan[key] = {};
      for (const [catId, amt] of Object.entries(cats)) {
        if (amt > 0) {
          b.monthlyPlan[key][catId] = Math.max(b.monthlyPlan[key][catId] || 0, Number(amt));
        }
      }
    }
    delete b.monthly;
  }

  // 구버전 연도 키(예: "2025") → 월별 키(예: "2025-01"~"2025-12")로 변환
  for (const key of Object.keys(b.monthlyPlan || {})) {
    if (/^\d{4}$/.test(key)) {
      const yearNum = Number(key);
      const yearData = b.monthlyPlan[key];
      for (let m = 1; m <= 12; m++) {
        const mKey = ymKey(yearNum, m);
        if (!b.monthlyPlan[mKey]) b.monthlyPlan[mKey] = {};
        for (const [catId, amt] of Object.entries(yearData)) {
          if (!(catId in b.monthlyPlan[mKey])) {
            b.monthlyPlan[mKey][catId] = Number(amt) || 0;
          }
        }
      }
      delete b.monthlyPlan[key];
    }
  }

  // 구버전 subMonthlyPlan 연도 키 → 월별 키 변환
  for (const key of Object.keys(b.subMonthlyPlan || {})) {
    if (/^\d{4}$/.test(key)) {
      const yearNum = Number(key);
      const yearData = b.subMonthlyPlan[key];
      for (let m = 1; m <= 12; m++) {
        const mKey = ymKey(yearNum, m);
        if (!b.subMonthlyPlan[mKey]) b.subMonthlyPlan[mKey] = {};
        for (const [itemId, amt] of Object.entries(yearData)) {
          if (!(itemId in b.subMonthlyPlan[mKey])) {
            b.subMonthlyPlan[mKey][itemId] = Number(amt) || 0;
          }
        }
      }
      delete b.subMonthlyPlan[key];
    }
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
    syncSubEnvelopeMonthlyPlan(data, y, curMonth, savingsCat.id);
  }

  const hasPositivePlan = Object.values(b.monthlyPlan || {}).some(
    (yearPlan) => Object.values(yearPlan || {}).some((amt) => Number(amt) > 0),
  );
  const hasActuals = Object.values(b.actuals || {}).some(
    (month) => Object.values(month || {}).some((e) => Number(e?.amount) > 0),
  ) || Object.values(b.subActuals || {}).some(
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
