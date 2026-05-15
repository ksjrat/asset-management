import { deepMerge } from './merge.js';
import { uid, todayISO, ymKey } from './format.js';
import { ensureBudgetStructure, migrateBudgetModel } from './budget-engine.js';

export const DATA_VERSION = 1;
export const KEY = 'couple-asset-app-v1';

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
  { id: 'card', label: '카드 미결제', group: 'liability' },
];

export const OWNERS = [
  { id: 'self', label: '본인' },
  { id: 'spouse', label: '배우자' },
  { id: 'joint', label: '공동' },
];

export const DEFAULT_CATEGORIES = [
  '식비', '주거', '교통', '통신', '보험', '의료', '교육', '문화', '쇼핑', '저축', '기타',
];

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
    biometricEnabled: false,
    appPasswordSet: false,
    policyAccepted: false,
    policyVersion: '1.0',
    onboardingDone: false,
  },
  settings: {
    lockOnLaunch: true,
    snapshotDay: 28,
    hiddenCategories: [],
  },
  policyConsents: [],
  assets: { items: [], snapshots: [] },
  goals: [],
  budget: {
    setupDone: false,
    defaultRecordDay: 25,
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: `cat-${i}`, name, hidden: false, recordDay: null })),
    annual: {},
    actuals: {},
    monthly: {},
  },
  transactions: [],
  recurring: [],
  guideChecks: {},
};

function now() {
  return new Date().toISOString();
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw
      ? deepMerge(structuredClone(DEFAULT), JSON.parse(raw))
      : structuredClone(DEFAULT);
    ensureBudgetStructure(data);
    migrateBudgetModel(data);
    return data;
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function save(data) {
  data.version = DATA_VERSION;
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getVisibleCategories(data) {
  return data.budget.categories.filter((c) => !c.hidden && !data.settings.hiddenCategories.includes(c.id));
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

export function getMonthBudget(data, year, month) {
  const key = ymKey(year, month);
  if (!data.budget.monthly) data.budget.monthly = {};
  if (!data.budget.monthly[key]) {
    data.budget.monthly[key] = {};
    for (const cat of getVisibleCategories(data)) {
      data.budget.monthly[key][cat.id] = 0;
    }
  }
  return data.budget.monthly[key];
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

export function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
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
  const nw = computeNetWorth(data);
  const lines = [
    `[우리 자산] ${year}년 ${month}월 보고서`,
    `순자산: ${nw.net.toLocaleString('ko-KR')}원`,
    `수입: ${income.toLocaleString('ko-KR')}원 / 지출: ${expense.toLocaleString('ko-KR')}원`,
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
