import { deepMerge } from './merge.js';
import { uid, todayISO, ymKey } from './format.js';
import {
  ensureBudgetStructure, migrateBudgetModel, getMonthlyPlanAmount, getPeriodTotals,
  getVisibleSavingsItems, getSavingsCategory, getActualAmount, getActualEntry, getSubActualAmount,
  getVisibleSubItems, hasSubItems, DEFAULT_SAVINGS_ITEM_NAMES, getSubActualsSum,
  getSubItems,
  getSubSummary,
  setOnSavingsSubActualSet, setOnLoanSubActualSet, syncSubEnvelopeActual,
  getBudgetStart, isBeforeBudgetStart, getCategoryPeriodSummary,
} from './budget-engine.js';
import { ensureAppLockAuth } from './app-lock.js';
import {
  syncSavingsSubActualToAsset, reconcileAllSavingsBudgetSync,
} from './savings-sync.js';
import {
  syncLoanSubActualToAsset, reconcileAllLoanBudgetSync, ensureLoanFields,
  getMonthHousingPrincipalTotal,
} from './loan-sync.js';
import { LOAN_REPAYMENT_METHODS } from './loan-amort.js';
import {
  countBudgetActualEntries,
  mergeBudgetMonthMaps,
  monthHasUserBudgetActuals,
} from './budget-data.js';
import { rebuildAutoSnapshots, monthHasBudgetEntry, computeNetWorthAtMonth } from './snapshot-engine.js';

export { monthHasBudgetEntry, monthHasUserBudgetActuals };

export { LOAN_REPAYMENT_METHODS };

export const DATA_VERSION = 1;
export const KEY = 'couple-asset-app-v1';
export const SAFETY_KEY = 'couple-asset-app-v1-safety';

export const GOAL_TEMPLATES = [
  { id: 'house', label: '주택 마련', icon: '🏠', defaultAmount: 100000000, defaultMonths: 60 },
  { id: 'travel', label: '여행', icon: '✈️', defaultAmount: 5000000, defaultMonths: 12 },
  { id: 'child', label: '자녀 교육', icon: '🎓', defaultAmount: 50000000, defaultMonths: 120 },
  { id: 'emergency', label: '비상금', icon: '🛡️', defaultAmount: 20000000, defaultMonths: 24 },
  { id: 'debt', label: '대출 상환', icon: '💳', defaultAmount: 30000000, defaultMonths: 36 },
  { id: 'custom', label: '직접 입력', icon: '✨', defaultAmount: 10000000, defaultMonths: 24 },
];

export const ASSET_TYPES = [
  { id: 'cash', label: '현금', group: 'asset' },
  { id: 'deposit', label: '예금', group: 'asset' },
  { id: 'savings', label: '적금', group: 'asset' },
  { id: 'invest', label: '투자', group: 'asset' },
  { id: 'realestate', label: '부동산', group: 'asset' },
  { id: 'loan', label: '대출', group: 'liability' },
];

export const OWNERS = [
  { id: 'self', label: '남편' },
  { id: 'spouse', label: '아내' },
  { id: 'joint', label: '공동' },
];

/** 홈 탭 순자산·추이 소유자 필터 옵션 */
export const HOME_OWNER_FILTERS = [
  { id: 'all', label: '전체' },
  ...OWNERS,
];

const DEFAULT_HOME_OWNER_FILTERS = ['all', 'self', 'spouse', 'joint'];

export function ensureAppSettings(data) {
  if (!data.settings) data.settings = structuredClone(DEFAULT.settings);
  const valid = new Set(HOME_OWNER_FILTERS.map((o) => o.id));
  let filters = data.settings.homeOwnerFilters;
  if (!Array.isArray(filters) || !filters.length) {
    filters = [...DEFAULT_HOME_OWNER_FILTERS];
  } else {
    filters = filters.filter((id) => valid.has(id));
    if (!filters.length) filters = ['all'];
  }
  data.settings.homeOwnerFilters = filters;
  const visible = new Set(filters);
  let selected = data.settings.homeOwnerFilter;
  if (!selected || !visible.has(selected)) {
    selected = filters[0] || 'all';
  }
  data.settings.homeOwnerFilter = selected;
}

export function getVisibleHomeOwnerFilters(data) {
  ensureAppSettings(data);
  const set = new Set(data.settings.homeOwnerFilters);
  return HOME_OWNER_FILTERS.filter((o) => set.has(o.id));
}

/** 홈 소유자 필터 선택 저장 */
export function setHomeOwnerFilter(data, filterId) {
  ensureAppSettings(data);
  const visible = getVisibleHomeOwnerFilters(data);
  const next = visible.some((o) => o.id === filterId)
    ? filterId
    : (visible[0]?.id || 'all');
  data.settings.homeOwnerFilter = next;
  return next;
}

export const DEFAULT_CATEGORIES = [
  '식비', '주거', '교통', '통신', '보험', '의료', '교육', '문화', '쇼핑', '저축', '기타',
];

export const INCOME_CATEGORIES = [
  { id: 'inc-salary', name: '근로소득' },
  { id: 'inc-business', name: '사업/부업' },
  { id: 'inc-interest', name: '이자' },
  { id: 'inc-dividend', name: '배당' },
  { id: 'inc-invest', name: '투자수익' },
  { id: 'inc-gift', name: '용돈/선물' },
  { id: 'inc-other', name: '기타' },
];

export function getIncomeCategories() {
  return INCOME_CATEGORIES;
}

/** 저축 세부 실적 연동 가능 자산 (예금·적금·투자·부동산) */
export const SAVINGS_ASSET_TYPES = new Set(['deposit', 'savings', 'invest', 'realestate']);

export function getSavingsEligibleAssets(data) {
  return (data.assets?.items || []).filter(
    (i) => SAVINGS_ASSET_TYPES.has(i.type)
      && ASSET_TYPES.find((t) => t.id === i.type)?.group === 'asset',
  );
}

export function getLoanAssets(data) {
  return (data.assets?.items || []).filter((i) => i.type === 'loan');
}

export function listSavingsContributions(data) {
  const rows = [];
  for (const asset of data.assets?.items || []) {
    for (const entry of asset.savingsLog || []) {
      rows.push({ asset, entry });
    }
  }
  return rows.sort((a, b) => String(b.entry.date).localeCompare(String(a.entry.date)));
}

export function findSavingsContribution(data, entryId) {
  for (const asset of data.assets?.items || []) {
    const entry = (asset.savingsLog || []).find((e) => e.id === entryId);
    if (entry) return { asset, entry };
  }
  return null;
}

function ymStr(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function prevYm(year, month) {
  let y = year;
  let m = month - 1;
  if (m < 1) { m = 12; y -= 1; }
  return { year: y, month: m, ym: ymStr(y, m) };
}

/** 홈 요약에 쓸 가장 최근 입력 월 (미입력 달은 건너뜀) */
export function getHomeSummaryMonth(data) {
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  const fallback = () => prevYm(endY, endM);

  if (!data.budget?.setupDone) return fallback();

  const start = getBudgetStart(data);
  if (!start) return fallback();

  let latest = null;
  let y = start.year;
  let m = start.month;
  while (y < endY || (y === endY && m <= endM)) {
    if (monthHasUserBudgetActuals(data, y, m)) {
      latest = { year: y, month: m };
    }
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  return latest ?? fallback();
}

export function getSnapshotAtMonth(data, year, month) {
  return data.assets?.snapshots?.find((s) => s.year === year && s.month === month) ?? null;
}

export function getPreviousSnapshot(data, year, month) {
  const snaps = [...(data.assets?.snapshots || [])]
    .sort((a, b) => a.year - b.year || a.month - b.month);
  return snaps.filter((s) => s.year < year || (s.year === year && s.month < month)).pop() ?? null;
}

/** 지출 탭에 입력한 카테고리별 실적 합계 (봉투 예산 기준) */
export function getMonthBudgetActualTotal(data, year, month) {
  ensureBudgetStructure(data);
  if (!data.budget?.setupDone) return 0;
  const cats = getVisibleCategories(data);
  return getPeriodTotals(data, year, month, cats).actual;
}

export function getMonthCashflowSummary(data, year, month) {
  const txs = getMonthTransactions(data, year, month);
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = getMonthBudgetActualTotal(data, year, month);
  const savings = getMonthSavingsTotal(data, year, month);
  const investPnL = getInvestmentPnLForMonth(data, year, month).pnl;
  return { income, expense, savings, investPnL };
}

/** 해당 월 예산 절약 (월 예산−실적 양수만, 저축·주거 제외) */
export function getMonthBudgetSavings(data, year, month) {
  if (!data.budget?.setupDone || isBeforeBudgetStart(data, year, month)) return 0;
  const cats = getVisibleCategories(data);
  let total = 0;
  for (const c of cats) {
    if (c.name === '저축' || c.name === '주거') continue;
    const s = getCategoryPeriodSummary(data, year, month, c.id);
    if (!s.hasActual) continue;
    const pureSaving = s.monthlyPlanned - s.actual;
    if (pureSaving > 0) total += pureSaving;
  }
  return total;
}

/** 생활 지출 (저축 카테고리·주택 대출 원금 제외) */
export function getMonthLifestyleSpending(data, year, month) {
  if (!data.budget?.setupDone || isBeforeBudgetStart(data, year, month)) return 0;
  const cats = getVisibleCategories(data);
  const principal = getMonthHousingPrincipalTotal(data, year, month);
  let total = 0;
  for (const c of cats) {
    if (c.name === '저축') continue;
    const s = getCategoryPeriodSummary(data, year, month, c.id);
    if (!s.hasActual) continue;
    if (c.name === '주거') {
      total += Math.max(0, s.actual - principal);
    } else {
      total += s.actual;
    }
  }
  return total;
}

/** 이번 달 모은 금액 = 저축 + 주택 원금 + 투자 수입 − 생활 지출 */
export function getMonthSavedBreakdown(data, year, month) {
  if (isBeforeBudgetStart(data, year, month)) {
    return { savings: 0, principal: 0, investIncome: 0, lifestyleSpending: 0, total: 0 };
  }
  const savings = getMonthSavingsTotal(data, year, month);
  const principal = getMonthHousingPrincipalTotal(data, year, month);
  const lifestyleSpending = getMonthLifestyleSpending(data, year, month);
  const investIncome = monthHasUserBudgetActuals(data, year, month)
    ? getInvestmentPnLForMonth(data, year, month).pnl
    : 0;
  const total = savings + principal + investIncome - lifestyleSpending;
  return {
    savings,
    principal,
    investIncome,
    lifestyleSpending,
    total,
  };
}

export function getMonthSavedAmount(data, year, month) {
  return getMonthSavedBreakdown(data, year, month).total;
}

function monthHasSavedInputs(data, year, month) {
  const b = getMonthSavedBreakdown(data, year, month);
  return b.savings > 0 || b.principal > 0 || b.investIncome !== 0 || b.lifestyleSpending > 0;
}

/** 예산 시작월부터 집계 가능한 모든 달 순회 */
export function eachBudgetMonthUpToNow(data, fn) {
  const start = getBudgetStart(data);
  if (!start) return;
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  let y = start.year;
  let m = start.month;
  while (y < endY || (y === endY && m <= endM)) {
    if (!isBeforeBudgetStart(data, y, m)) fn(y, m);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
}

/** 관리 시작 이래 누적 모은 금액 */
export function getCumulativeSavedAmount(data) {
  if (!data.budget?.setupDone) return 0;
  let total = 0;
  eachBudgetMonthUpToNow(data, (y, m) => {
    if (monthHasSavedInputs(data, y, m)) {
      total += getMonthSavedAmount(data, y, m);
    }
  });
  return total;
}

/** 월별 모은 금액 추이 (차트용) */
export function getMonthlySavedSeries(data, limit = 12) {
  const rows = [];
  eachBudgetMonthUpToNow(data, (y, m) => {
    if (monthHasSavedInputs(data, y, m)) {
      rows.push({ year: y, month: m, ...getMonthSavedBreakdown(data, y, m) });
    }
  });
  return rows.slice(-limit);
}

/** 월별 총자산 변화 (전월 대비, 차트용) */
export function getMonthlyAssetChangeSeries(data, ownerFilter = 'all', limit = 12) {
  const nwAt = (y, m) => computeNetWorthAtMonth(data, y, m, (d) => computeNetWorth(d, ownerFilter));
  const rows = [];
  eachBudgetMonthUpToNow(data, (y, m) => {
    const { assets } = nwAt(y, m);
    const prev = prevYm(y, m);
    const prevAssets = nwAt(prev.year, prev.month).assets;
    rows.push({ year: y, month: m, assets, change: assets - prevAssets });
  });
  return rows.slice(-limit);
}

export function getMonthSavingsTotal(data, year, month) {
  ensureBudgetStructure(data);
  const cat = getSavingsCategory(data);
  if (cat) {
    if (hasSubItems(data, cat.id)) {
      const { total } = getSubSummary(data, year, month, cat.id);
      if (total > 0) return total;
    }
    const s = getCategoryPeriodSummary(data, year, month, cat.id);
    if (s.hasActual) return Number(s.actual) || 0;
    const subSum = getSubActualsSum(data, year, month, cat.id);
    if (subSum > 0) return subSum;
    const key = ymKey(year, month);
    const bucket = data.budget?.subActuals?.[key];
    if (bucket) {
      const ids = new Set(getSubItems(data, cat.id).map((i) => i.id));
      let orphanSum = 0;
      for (const [itemId, entry] of Object.entries(bucket)) {
        if (ids.has(itemId)) orphanSum += Number(entry?.amount) || 0;
      }
      if (orphanSum > 0) return orphanSum;
    }
    return 0;
  }
  let total = 0;
  for (const asset of data.assets?.items || []) {
    for (const entry of asset.savingsLog || []) {
      const d = new Date(entry.date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        total += Number(entry.amount) || 0;
      }
    }
  }
  return total;
}

/** 예산 관리 시작 이후 전체 월의 누적 저축 합계 */
export function getCumulativeSavingsTotal(data) {
  if (!data.budget?.setupDone) return 0;
  let total = 0;
  eachBudgetMonthUpToNow(data, (y, m) => {
    total += getMonthSavingsTotal(data, y, m);
  });
  return total;
}

/** 예산 관리 시작 이후 전체 월의 누적 절약액 (월 예산 - 실적, 양수만 합산) */
export function getCumulativeBudgetSavings(data) {
  if (!data.budget?.setupDone) return 0;
  let total = 0;
  eachBudgetMonthUpToNow(data, (y, m) => {
    total += getMonthBudgetSavings(data, y, m);
  });
  return total;
}

export function getLatestValuation(item) {
  const vals = item.valuations || [];
  if (!vals.length) return null;
  return vals[vals.length - 1];
}

const APPRAISED_ASSET_TYPES = new Set(['invest', 'realestate']);

/** 투자·부동산은 최신 평가금액, 그 외는 등록 금액 */
export function getEffectiveAssetAmount(item) {
  if (APPRAISED_ASSET_TYPES.has(item.type)) {
    const latest = getLatestValuation(item);
    if (latest) return Number(latest.amount) || 0;
  }
  return Number(item.amount) || 0;
}

/** 투자·부동산 평가 손익에 쓸 「사용자 평가」인지 (자산 탭에서 직접 기록한 것만) */
export function isUserAppraisalValuation(v) {
  if (!v || Number(v.amount) <= 0) return false;
  return v.source === 'manual';
}

/** amount 0인 평가 찌꺼기 제거 (0원 저장 시 −전월잔액 손익 오류 방지) */
export function pruneZeroValuations(data) {
  for (const item of data.assets?.items || []) {
    if (!item.valuations?.length) continue;
    item.valuations = item.valuations.filter((v) => Number(v.amount) > 0);
  }
}

function valuationAtMonthEnd(item, ym) {
  const vals = (item.valuations || []).filter((v) => v.ym <= ym);
  if (!vals.length) {
    return Number(item.history?.[0]?.amount ?? item.amount) || 0;
  }
  vals.sort((a, b) => String(a.ym).localeCompare(String(b.ym)));
  return Number(vals[vals.length - 1].amount) || 0;
}

function valuationBaselineAmount(item, prevYmStr, curYm) {
  const vals = item.valuations || [];
  const prevVal = vals.find((v) => v.ym === prevYmStr);
  if (prevVal) return Number(prevVal.amount);
  const older = vals.filter((v) => v.ym < curYm);
  if (older.length) return Number(older[older.length - 1].amount);
  return Number(item.history?.[0]?.amount ?? item.amount) || 0;
}

export function syncAppraisedAssetAmount(item) {
  const latest = getLatestValuation(item);
  if (latest) item.amount = Number(latest.amount) || 0;
  else item.amount = Number(item.history?.[0]?.amount ?? item.amount) || 0;
}

/** @deprecated syncAppraisedAssetAmount 사용 */
export function syncInvestAssetAmount(item) {
  syncAppraisedAssetAmount(item);
}

export function syncAppraisedAssetAmounts(data) {
  for (const item of data.assets?.items || []) {
    if (APPRAISED_ASSET_TYPES.has(item.type) && (item.valuations || []).length) {
      syncAppraisedAssetAmount(item);
    }
  }
}

/** @deprecated syncAppraisedAssetAmounts 사용 */
export function syncInvestAssetAmounts(data) {
  syncAppraisedAssetAmounts(data);
}

export function getInvestmentPnLForMonth(data, year, month) {
  const curYm = ymStr(year, month);
  const prev = prevYm(year, month);
  const items = (data.assets?.items || []).filter((i) => APPRAISED_ASSET_TYPES.has(i.type));
  const perAsset = [];
  let pnl = 0;

  for (const it of items) {
    const vals = it.valuations || [];
    const curVal = vals.find((v) => v.ym === curYm);
    if (!isUserAppraisalValuation(curVal)) continue;
    const previous = valuationAtMonthEnd(it, prev.ym);
    const current = Number(curVal.amount);
    const delta = current - previous;
    if (!Number.isFinite(delta)) continue;
    pnl += delta;
    perAsset.push({
      assetId: it.id,
      name: it.name,
      ym: curYm,
      prevYm: prev.ym,
      current,
      previous,
      delta,
    });
  }
  return { pnl, perAsset, ym: curYm, prevYm: prev.ym };
}

export const DEFAULT = {
  version: DATA_VERSION,
  auth: {
    loggedIn: false,
    userName: '',
    userEmail: '',
    spouseName: '',
    spouseConnected: false,
    inviteCode: null,
    inviteExpiresAt: null,
    householdId: null,
    appPasswordSet: false,
    policyAccepted: false,
    policyVersion: '1.0',
    onboardingDone: false,
    /** 설정 → 시작 화면으로 일 때 가족 코드·암호 입력 화면 유지 */
    atStartScreen: false,
  },
  settings: {
    lockOnLaunch: true,
    snapshotDay: 28,
    hiddenCategories: [],
    /** 홈 탭에 표시할 소유자 필터: all | self | spouse | joint */
    homeOwnerFilters: ['all', 'self', 'spouse', 'joint'],
    /** 홈 탭에서 마지막으로 선택한 소유자 필터 */
    homeOwnerFilter: 'all',
  },
  policyConsents: [],
  assets: { items: [], snapshots: [] },
  goals: [],
  budget: {
    setupDone: false,
    recordSchedule: 'next_month_first_sunday',
    defaultRecordDay: 25,
    startYear: null,
    startMonth: null,
    categories: DEFAULT_CATEGORIES.map((name, i) => ({
      id: `cat-${i}`, name, hidden: false, recordDay: null, payer: 'joint',
    })),
    subItemsByCategory: {
      'cat-9': DEFAULT_SAVINGS_ITEM_NAMES.map((name, i) => ({
        id: `sav-${i}`, name, hidden: false, payer: 'joint',
      })),
    },
    subMonthlyPlan: {},
    subActuals: {},
    monthlyPlan: {},
    actuals: {},
  },
  transactions: [],
  recurring: [],
  memos: [],
  guideChecks: {},
};

function now() {
  return new Date().toISOString();
}

/** 자산·목표·거래·예산 설정 등 사용자가 입력한 금융 데이터가 있는지 */
export function hasUserFinancialData(data) {
  if (!data) return false;
  if (data.assets?.items?.length) return true;
  if (data.goals?.length) return true;
  if (data.transactions?.length) return true;
  if (data.budget?.setupDone) return true;
  const plan = data.budget?.monthlyPlan;
  if (plan && Object.keys(plan).length > 0) return true;
  return false;
}

/** 동기화·복구 판단용 대략적 입력량 */
export function dataFootprint(data) {
  if (!data) return 0;
  return (data.assets?.items?.length || 0)
    + (data.goals?.length || 0)
    + (data.transactions?.length || 0)
    + (data.assets?.items || []).reduce((s, a) => s + (a.savingsLog?.length || 0), 0)
    + (data.assets?.items || []).reduce((s, a) => s + (a.repaymentLog?.length || 0), 0)
    + countBudgetActualEntries(data);
}

export function saveSafetyBackup(data) {
  if (!hasUserFinancialData(data)) return;
  try {
    localStorage.setItem(SAFETY_KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

function tryRestoreSafetyBackup(data) {
  if (hasUserFinancialData(data) || !data.auth?.onboardingDone) return data;
  try {
    const raw = localStorage.getItem(SAFETY_KEY);
    if (!raw) return data;
    const backup = JSON.parse(raw);
    if (!hasUserFinancialData(backup)) return data;
    const email = data.auth.userEmail?.trim();
    const backupEmail = backup.auth?.userEmail?.trim();
    if (email && backupEmail && email !== backupEmail) return data;
    ensureBudgetStructure(backup);
    migrateBudgetModel(backup);
    backup.auth.loggedIn = data.auth.loggedIn;
    backup.auth.userName = data.auth.userName || backup.auth.userName;
    backup.auth.userEmail = data.auth.userEmail || backup.auth.userEmail;
    backup.auth.onboardingDone = data.auth.onboardingDone ?? backup.auth.onboardingDone;
    return backup;
  } catch {
    return data;
  }
}

export function restoreFromSafetyBackup() {
  const raw = localStorage.getItem(SAFETY_KEY);
  if (!raw) return null;
  const backup = JSON.parse(raw);
  if (!hasUserFinancialData(backup)) return null;
  ensureBudgetStructure(backup);
  migrateBudgetModel(backup);
  return backup;
}

export function hasSafetyBackup() {
  try {
    const raw = localStorage.getItem(SAFETY_KEY);
    if (!raw) return false;
    return hasUserFinancialData(JSON.parse(raw));
  } catch {
    return false;
  }
}

/** 백업에 실적이 더 많으면 세부·항목 실적을 자동 복구 */
function recoverBudgetActualsFromSafety(data) {
  try {
    const raw = localStorage.getItem(SAFETY_KEY);
    if (!raw) return data;
    const backup = JSON.parse(raw);
    const curCount = countBudgetActualEntries(data);
    const bakCount = countBudgetActualEntries(backup);
    if (bakCount <= curCount) return data;

    ensureBudgetStructure(data);
    data.budget.subActuals = mergeBudgetMonthMaps(
      data.budget.subActuals,
      backup.budget?.subActuals,
    );
    data.budget.actuals = mergeBudgetMonthMaps(
      data.budget.actuals,
      backup.budget?.actuals,
    );
    if (backup.budget?.setupDone) data.budget.setupDone = true;

    for (const cat of data.budget.categories || []) {
      if (!hasSubItems(data, cat.id)) continue;
      for (const key of Object.keys(data.budget.subActuals || {})) {
        const m = key.match(/^(\d{4})-(\d{2})$/);
        if (!m) continue;
        syncSubEnvelopeActual(data, Number(m[1]), Number(m[2]), cat.id);
      }
    }
    save(data);
  } catch {
    /* quota / parse */
  }
  return data;
}

function normalizeAuthHousehold(data) {
  const hid = data.auth?.householdId?.toString().trim().toUpperCase();
  if (!hid) return;
  data.auth.householdId = hid;
  if (data.auth.inviteCode) {
    data.auth.inviteCode = data.auth.inviteCode.toString().trim().toUpperCase();
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    let data = raw
      ? deepMerge(structuredClone(DEFAULT), JSON.parse(raw))
      : structuredClone(DEFAULT);
    ensureBudgetStructure(data);
    migrateBudgetModel(data);
    ensureAppSettings(data);
    ensureMemos(data);
    ensureAppLockAuth(data);
    normalizeAuthHousehold(data);
    data = tryRestoreSafetyBackup(data);
    ensureAppSettings(data);
    ensureMemos(data);
    ensureAppLockAuth(data);
    normalizeAuthHousehold(data);
    syncAppraisedAssetAmounts(data);
    reconcileAllSavingsBudgetSync(data);
    for (const item of data.assets?.items || []) ensureLoanFields(item);
    reconcileAllLoanBudgetSync(data);
    pruneZeroValuations(data);
    data = recoverBudgetActualsFromSafety(data);
    return data;
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function save(data) {
  pruneZeroValuations(data);
  data.version = DATA_VERSION;
  localStorage.setItem(KEY, JSON.stringify(data));
  saveSafetyBackup(data);
}

export function getVisibleCategories(data) {
  return data.budget.categories.filter((c) => !c.hidden && !data.settings.hiddenCategories.includes(c.id));
}

export function getHiddenCategories(data) {
  const visibleIds = new Set(getVisibleCategories(data).map((c) => c.id));
  return data.budget.categories.filter((c) => !visibleIds.has(c.id));
}

export function computeNetWorth(data, ownerFilter = 'all') {
  let assets = 0;
  let liabilities = 0;
  for (const item of data.assets.items) {
    if (ownerFilter !== 'all' && item.owner !== ownerFilter) continue;
    const type = ASSET_TYPES.find((t) => t.id === item.type);
    if (!type) continue;
    const amount = getEffectiveAssetAmount(item);
    if (type.group === 'asset') assets += amount;
    else liabilities += amount;
  }
  return { assets, liabilities, net: assets - liabilities };
}

/** 저축·대출 원금 반영 월별 순자산 자동 기록 */
export function refreshAutoSnapshots(data) {
  return rebuildAutoSnapshots(data, computeNetWorth);
}

function onSavingsBudgetSync(data, year, month, itemId, amount) {
  syncSavingsSubActualToAsset(data, year, month, itemId, amount);
}

function onLoanBudgetSync(data, year, month, itemId, amount) {
  syncLoanSubActualToAsset(data, year, month, itemId, amount);
}

setOnSavingsSubActualSet(onSavingsBudgetSync);
setOnLoanSubActualSet(onLoanBudgetSync);

export function computeGoalProgress(goal) {
  const current = goal.contributions?.reduce((s, c) => s + c.amount, 0) ?? goal.currentAmount ?? 0;
  const rate = goal.targetAmount > 0 ? current / goal.targetAmount : 0;
  return { current, rate: Math.min(rate, 1) };
}

export function calcMonthlyContribution(targetAmount, months, mode = 'equal') {
  if (!months || months <= 0) return 0;
  if (mode === 'equal') return Math.ceil(targetAmount / months);
  if (mode === 'accelerating') {
    const totalWeight = (months * (months + 1)) / 2;
    return Math.ceil((targetAmount * months) / totalWeight);
  }
  return Math.ceil(targetAmount / months);
}

export function monthsBetween(startISO, endISO) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
}

export function getMonthBudget(data, year, month) {
  ensureBudgetStructure(data);
  const map = {};
  for (const cat of getVisibleCategories(data)) {
    map[cat.id] = getMonthlyPlanAmount(data, year, month, cat.id);
  }
  return map;
}

export function getMonthTransactions(data, year, month) {
  return data.transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

export function getCategorySpend(data, year, month) {
  const map = {};
  const key = ymKey(year, month);
  const actuals = data.budget?.actuals?.[key];
  if (actuals && data.budget?.setupDone) {
    for (const [catId, entry] of Object.entries(actuals)) {
      if (entry?.amount != null) map[catId] = entry.amount;
    }
    if (Object.keys(map).length) return map;
  }
  const txs = getMonthTransactions(data, year, month).filter((t) => t.type === 'expense');
  for (const t of txs) {
    map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
  }
  return map;
}

/** 카테고리별 예산 대비 과다 사용 (실적 입력·예산 있는 항목, 저축 제외) */
export function getCategoryBudgetOveruse(data, year, month, limit = 5) {
  const savingsCat = getSavingsCategory(data);
  const excludeId = savingsCat?.id;
  const rows = [];
  for (const cat of getVisibleCategories(data)) {
    if (cat.id === excludeId || cat.name === '저축') continue;
    const s = getCategoryPeriodSummary(data, year, month, cat.id);
    if (!s.hasActual || s.actual <= 0) continue;
    const usedPct = s.monthlyPlanned > 0 ? s.actual / s.monthlyPlanned : 1;
    rows.push({
      catId: cat.id,
      name: cat.name,
      actual: s.actual,
      available: s.monthlyPlanned,
      usedPct,
      overAmount: s.monthDelta ?? 0,
    });
  }
  return rows.sort((a, b) => {
    if (a.overAmount > 0 && b.overAmount <= 0) return -1;
    if (b.overAmount > 0 && a.overAmount <= 0) return 1;
    if (a.overAmount > 0 && b.overAmount > 0) return b.overAmount - a.overAmount;
    return b.usedPct - a.usedPct;
  }).slice(0, limit);
}

export function createSnapshot(data, year, month) {
  const { assets, liabilities, net } = computeNetWorthAtMonth(data, year, month, computeNetWorth);
  const snap = { id: uid(), year, month, assets, liabilities, net, source: 'manual', createdAt: now(), updatedAt: now() };
  const idx = data.assets.snapshots.findIndex((s) => s.year === year && s.month === month);
  if (idx >= 0) data.assets.snapshots[idx] = snap;
  else data.assets.snapshots.push(snap);
  data.assets.snapshots.sort((a, b) => a.year - b.year || a.month - b.month);
  return snap;
}

/** Firestore household 문서 ID · 가족 코드 길이 (신규 발급) */
export const HOUSEHOLD_CODE_LENGTH = 6;

const HOUSEHOLD_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(HOUSEHOLD_CODE_LENGTH));
  return Array.from(bytes, (b) => HOUSEHOLD_CODE_ALPHABET[b % HOUSEHOLD_CODE_ALPHABET.length]).join('');
}

export function getOwnerDisplayLabel(_data, ownerId) {
  return OWNERS.find((o) => o.id === ownerId)?.label || ownerId;
}

export function getSubPayerLabel(data, catId) {
  const items = getVisibleSubItems(data, catId);
  const payers = new Set(items.map((i) => i.payer || 'joint'));
  if (payers.size <= 1) {
    return getOwnerDisplayLabel(data, [...payers][0] || 'joint');
  }
  return '항목별';
}

export function getSavingsPayerLabel(data) {
  const cat = getSavingsCategory(data);
  return cat ? getSubPayerLabel(data, cat.id) : '공동';
}

export function getOwnerMonthlySummary(data, year, month) {
  ensureBudgetStructure(data);
  const income = { self: 0, spouse: 0, total: 0 };
  for (const tx of getMonthTransactions(data, year, month)) {
    if (tx.type !== 'income') continue;
    const owner = tx.owner === 'spouse' ? 'spouse' : 'self';
    income[owner] += tx.amount;
    income.total += tx.amount;
  }

  const expense = { self: 0, spouse: 0, joint: 0, total: 0 };

  function addExpense(payer, amt) {
    if (amt <= 0) return;
    if (payer === 'self' || payer === 'spouse') expense[payer] += amt;
    else expense.joint += amt;
    expense.total += amt;
  }

  const cats = getVisibleCategories(data);
  for (const cat of cats) {
    if (hasSubItems(data, cat.id)) {
      for (const item of getVisibleSubItems(data, cat.id)) {
        const amt = getSubActualAmount(data, year, month, item.id) || 0;
        addExpense(item.payer || cat.payer || 'joint', amt);
      }
      continue;
    }
    const entry = getActualEntry(data, year, month, cat.id);
    const amt = entry?.amount;
    if (amt == null || amt <= 0) continue;
    const payer = (cat.name === '기타' && entry.payer) ? entry.payer : (cat.payer || 'joint');
    addExpense(payer, amt);
  }

  return { income, expense };
}

export { countBudgetActualEntries } from './budget-data.js';

export {
  getVisibleSavingsItems, getSavingsCategory, getVisibleSubItems, hasSubItems,
} from './budget-engine.js';

export function addCategory(data, name, recordDay = null) {
  const id = uid();
  data.budget.categories.push({
    id, name: name.trim(), hidden: false, recordDay, payer: 'joint',
  });
  return id;
}

export function guideExecutionRate(data) {
  const checks = Object.values(data.guideChecks || {});
  if (!checks.length) return 0;
  const done = checks.filter((v) => v === 'done').length;
  return done / checks.length;
}

export function ensureMemos(data) {
  if (!Array.isArray(data.memos)) data.memos = [];
}

export function listMemos(data) {
  ensureMemos(data);
  return [...data.memos].sort(
    (a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)),
  );
}

export function recordPolicyConsent(data) {
  data.policyConsents = data.policyConsents || [];
  data.policyConsents.push({
    version: data.auth.policyVersion,
    at: now(),
  });
}
