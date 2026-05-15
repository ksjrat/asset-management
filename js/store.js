import { deepMerge } from './merge.js';
import { uid, todayISO, ymKey } from './format.js';

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
    lockOnSensitive: false,
    alertQuietStart: '22:00',
    alertQuietEnd: '08:00',
    snapshotDay: 28,
    hiddenCategories: [],
    categoryThresholds: {},
  },
  assets: { items: [], snapshots: [] },
  goals: [],
  budget: {
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: `cat-${i}`, name, hidden: false })),
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
    if (!raw) return structuredClone(DEFAULT);
    return deepMerge(structuredClone(DEFAULT), JSON.parse(raw));
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
  const txs = getMonthTransactions(data, year, month).filter((t) => t.type === 'expense');
  const map = {};
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

export function seedDemoData(data) {
  if (data.assets.items.length) return data;
  const demo = [
    { type: 'deposit', name: '공동 예금', amount: 45000000, owner: 'joint' },
    { type: 'savings', name: '적금', amount: 12000000, owner: 'joint' },
    { type: 'invest', name: '투자 계좌', amount: 28000000, owner: 'self' },
    { type: 'cash', name: '비상금', amount: 5000000, owner: 'self', private: true },
    { type: 'deposit', name: '급여 통장', amount: 8500000, owner: 'spouse' },
    { type: 'loan', name: '주택담보대출', amount: 180000000, owner: 'joint' },
  ];
  for (const d of demo) {
    data.assets.items.push({
      id: uid(),
      ...d,
      updatedAt: now(),
      history: [{ amount: d.amount, at: now() }],
    });
  }
  const today = todayISO();
  const end = new Date();
  end.setMonth(end.getMonth() + 36);
  data.goals.push({
    id: uid(),
    title: '첫 아파트 마련',
    template: 'house',
    targetAmount: 100000000,
    currentAmount: 15000000,
    startDate: today,
    endDate: end.toISOString().slice(0, 10),
    status: 'active',
    monthlyContribution: 2500000,
    contributionMode: 'equal',
    milestones: [25, 50, 75].map((p) => ({ percent: p, reached: p <= 15 })),
    contributions: [
      { id: uid(), date: today, amount: 5000000, memo: '초기 저축' },
      { id: uid(), date: today, amount: 10000000, memo: '보너스' },
    ],
    proposedBy: 'self',
    approvedBy: 'spouse',
    history: [],
    createdAt: now(),
  });
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const mb = getMonthBudget(data, y, m);
  const cats = getVisibleCategories(data);
  const budgets = [800000, 1500000, 300000, 150000, 400000, 200000, 0, 300000, 400000, 2500000, 200000];
  cats.forEach((c, i) => { mb[c.id] = budgets[i] ?? 300000; });

  const samples = [
    { type: 'income', amount: 5500000, catIdx: 0, memo: '급여', day: 25 },
    { type: 'expense', amount: 420000, catIdx: 0, memo: '마트', day: 5 },
    { type: 'expense', amount: 1200000, catIdx: 1, memo: '월세', day: 1 },
    { type: 'expense', amount: 85000, catIdx: 3, memo: '통신비', day: 12 },
    { type: 'expense', amount: 180000, catIdx: 4, memo: '보험', day: 15 },
  ];
  for (const s of samples) {
    const d = new Date(y, m - 1, s.day);
    data.transactions.push({
      id: uid(),
      date: d.toISOString().slice(0, 10),
      amount: s.amount,
      type: s.type,
      categoryId: cats[s.catIdx]?.id || cats[0].id,
      paymentMethod: s.type === 'income' ? '이체' : '카드',
      memo: s.memo,
      shared: true,
      createdBy: 'self',
    });
  }

  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    createSnapshot(data, d.getFullYear(), d.getMonth() + 1);
  }
  return data;
}
