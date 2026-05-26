import { deepMerge } from './merge.js';
import { uid, todayISO, ymKey } from './format.js';
import { ensureBudgetStructure, migrateBudgetModel, getMonthlyPlanAmount } from './budget-engine.js';

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
  { id: 'self', label: '본인' },
  { id: 'spouse', label: '배우자' },
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
}

export function getVisibleHomeOwnerFilters(data) {
  ensureAppSettings(data);
  const set = new Set(data.settings.homeOwnerFilters);
  return HOME_OWNER_FILTERS.filter((o) => set.has(o.id));
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

/** 저축 실행으로 돈을 넣을 수 있는 자산 (예금·적금) */
export const SAVINGS_ASSET_TYPES = new Set(['deposit', 'savings']);

export function getSavingsEligibleAssets(data) {
  return (data.assets?.items || []).filter(
    (i) => SAVINGS_ASSET_TYPES.has(i.type)
      && ASSET_TYPES.find((t) => t.id === i.type)?.group === 'asset',
  );
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

function prevYm(year, month) {
  let y = year;
  let m = month - 1;
  if (m < 1) { m = 12; y -= 1; }
  return { year: y, month: m, ym: ymStr(y, m) };
}

export function getMonthCashflowSummary(data, year, month) {
  const txs = getMonthTransactions(data, year, month);
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const savings = getMonthSavingsTotal(data, year, month);
  const investPnL = getInvestmentPnLForMonth(data, year, month).pnl;
  return { income, expense, savings, investPnL };
}

export function getMonthSavingsTotal(data, year, month) {
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

export function getInvestmentPnLForMonth(data, year, month) {
  const curYm = ymStr(year, month);
  const prev = prevYm(year, month);
  const items = (data.assets?.items || []).filter((i) => i.type === 'invest');
  const perAsset = [];
  let pnl = 0;

  for (const it of items) {
    const vals = it.valuations || [];
    const curVal = vals.find((v) => v.ym === curYm);
    const prevVal = vals.find((v) => v.ym === prev.ym);
    if (!curVal || !prevVal) continue;
    const delta = Number(curVal.amount) - Number(prevVal.amount);
    if (!Number.isFinite(delta)) continue;
    pnl += delta;
    perAsset.push({
      assetId: it.id,
      name: it.name,
      ym: curYm,
      prevYm: prev.ym,
      current: Number(curVal.amount),
      previous: Number(prevVal.amount),
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
  },
  settings: {
    lockOnLaunch: true,
    snapshotDay: 28,
    hiddenCategories: [],
    /** 홈 탭에 표시할 소유자 필터: all | self | spouse | joint */
    homeOwnerFilters: ['all', 'self', 'spouse', 'joint'],
  },
  policyConsents: [],
  assets: { items: [], snapshots: [] },
  goals: [],
  budget: {
    setupDone: false,
    defaultRecordDay: 25,
    startYear: null,
    startMonth: null,
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: `cat-${i}`, name, hidden: false, recordDay: null })),
    monthlyPlan: {},
    actuals: {},
  },
  transactions: [],
  recurring: [],
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
    + (data.assets?.items || []).reduce((s, a) => s + (a.savingsLog?.length || 0), 0);
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

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    let data = raw
      ? deepMerge(structuredClone(DEFAULT), JSON.parse(raw))
      : structuredClone(DEFAULT);
    ensureBudgetStructure(data);
    migrateBudgetModel(data);
    ensureAppSettings(data);
    data = tryRestoreSafetyBackup(data);
    ensureAppSettings(data);
    return data;
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function save(data) {
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
    if (type.group === 'asset') assets += item.amount;
    else liabilities += item.amount;
  }
  return { assets, liabilities, net: assets - liabilities };
}

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

export function getMonthBudget(data, year, _month) {
  ensureBudgetStructure(data);
  const map = {};
  for (const cat of getVisibleCategories(data)) {
    map[cat.id] = getMonthlyPlanAmount(data, year, cat.id);
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

export function createSnapshot(data, year, month) {
  const { assets, liabilities, net } = computeNetWorth(data);
  const snap = { id: uid(), year, month, assets, liabilities, net, createdAt: now() };
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

export function addCategory(data, name, recordDay = null) {
  const id = uid();
  data.budget.categories.push({ id, name: name.trim(), hidden: false, recordDay });
  return id;
}

export function guideExecutionRate(data) {
  const checks = Object.values(data.guideChecks || {});
  if (!checks.length) return 0;
  const done = checks.filter((v) => v === 'done').length;
  return done / checks.length;
}

export function buildReportShareText(data, year, month) {
  const txs = getMonthTransactions(data, year, month);
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const investPnL = getInvestmentPnLForMonth(data, year, month).pnl;
  const nw = computeNetWorth(data);
  const lines = [
    `[우리 자산] ${year}년 ${month}월 보고서`,
    `순자산: ${nw.net.toLocaleString('ko-KR')}원`,
    `수입: ${income.toLocaleString('ko-KR')}원 / 지출: ${expense.toLocaleString('ko-KR')}원`,
    ...(investPnL ? [`투자 손익(평가): ${(investPnL >= 0 ? '+' : '') + investPnL.toLocaleString('ko-KR')}원`] : []),
    `목표 ${data.goals.length}개 · 배우자 ${data.auth.spouseConnected ? '연결됨' : '미연결'}`,
  ];
  return lines.join('\n');
}

export function recordPolicyConsent(data) {
  data.policyConsents = data.policyConsents || [];
  data.policyConsents.push({
    version: data.auth.policyVersion,
    at: now(),
  });
}
