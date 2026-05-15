import { deepMerge } from './merge.js';

export const DATA_VERSION = 2;
export const KEY = 'sej-ledger-2026';

export const DEFAULT = {
  version: DATA_VERSION,
  year: 2026,
  settings: {
    title: '승재·은지 가계부',
    names: ['승재', '은지'],
    monthlySavingsGoal: 3000000,
    monthlySavingsRateGoal: 0.5,
    autoCarryOver: true,
    incomeCategories: ['급여', '부수입', '이자·배당', '기타수입'],
    expenseCategories: ['식비', '주거', '교통', '통신', '보험', '의료', '교육', '문화', '쇼핑', '저축성', '기타'],
    subCategories: {},
    paymentMethods: ['현금', '체크', '신용카드', '계좌이체'],
    cards: ['공용카드', '승재카드', '은지카드'],
    financialGoals: [],
    financialSchedule: [],
    recentTransactions: [],
    sync: {
      enabled: false,
      provider: 'firestore',
      apiKey: '',
      projectId: '',
      collection: 'household_ledgers',
      docId: 'sej-2026',
      lastSyncAt: null,
    },
  },
  months: {},
  budget: {},
  assets: {
    summary: [],
    accounts: [],
    emergency: [],
    deposits: [],
    savings: [],
    investments: [],
    trades: [],
  },
  liabilities: {
    debts: [],
    loans: [
      { name: '대출1', lender: '', balance: 0, rate: 0, payment: 0, dueDay: 0 },
      { name: '대출2', lender: '', balance: 0, rate: 0, payment: 0, dueDay: 0 },
      { name: '대출3', lender: '', balance: 0, rate: 0, payment: 0, dueDay: 0 },
      { name: '대출4', lender: '', balance: 0, rate: 0, payment: 0, dueDay: 0 },
      { name: '대출5', lender: '', balance: 0, rate: 0, payment: 0, dueDay: 0 },
    ],
  },
};

function emptyMonth() {
  return { carryOver: 0, income: [], expenses: [] };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT), parsed);
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function save(data) {
  data.version = DATA_VERSION;
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function replaceData(data) {
  return deepMerge(structuredClone(DEFAULT), data);
}

export function getMonth(data, year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (!data.months[key]) data.months[key] = emptyMonth();
  return data.months[key];
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 저축성 지출: 체크박스 또는 「저축성」·「저축성지출」 카테고리 */
export function isSavingExpense(t) {
  return t.type === 'saving' || t.category === '저축성' || t.category === '저축성지출';
}

const INCOME_BUDGET_KEY = /^(수입|급여|상여|투자수익|이자|부수익|기타\s*수입)/;
const SKIP_BUDGET_CAT = /^(소비성지출|수입\s*총|총계|합계|누계)/;

/** 예산·항목설정·결산에 쓰이는 지출 카테고리 목록 */
export function getExpenseCategoryList(data) {
  const set = new Set(data.settings.expenseCategories || []);
  for (const k of Object.keys(data.budget || {})) {
    if (k && !INCOME_BUDGET_KEY.test(k) && !SKIP_BUDGET_CAT.test(k)) set.add(k);
  }
  return [...set];
}

export function calcSettlement(data, year, month) {
  const m = getMonth(data, year, month);
  const income = m.income.reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpense = m.expenses.reduce((s, t) => s + (t.amount || 0), 0);
  const savingExpense = m.expenses.filter(isSavingExpense).reduce((s, t) => s + (t.amount || 0), 0);
  const consumptionExpense = totalExpense - savingExpense;
  const netIncome = income - totalExpense;
  const balance = (m.carryOver || 0) + netIncome;
  const savingsRate = income > 0 ? savingExpense / income : 0;
  const consumptionRate = income > 0 ? consumptionExpense / income : 0;
  const goal = data.settings.monthlySavingsGoal || 0;
  const goalRate = data.settings.monthlySavingsRateGoal || 0;

  return {
    carryOver: m.carryOver || 0,
    income,
    totalExpense,
    savingExpense,
    consumptionExpense,
    netIncome,
    balance,
    savingsRate,
    consumptionRate,
    savingsGoalProgress: goal > 0 ? savingExpense / goal : 0,
    savingsRateGoalProgress: goalRate > 0 ? savingsRate / goalRate : 0,
  };
}

export function applyAutoCarryOver(data, year, month) {
  if (!data.settings.autoCarryOver || month <= 1) return;
  const m = getMonth(data, year, month);
  if (m.carryOverSetManually) return;
  const prev = calcSettlement(data, year, month - 1);
  m.carryOver = prev.balance;
}

export function setCarryOver(data, year, month, amount, manual = true) {
  const m = getMonth(data, year, month);
  m.carryOver = amount;
  if (manual) m.carryOverSetManually = true;
}

export function getBudgetForMonth(data, category, month) {
  return (data.budget[category] || {})[month] || 0;
}

export function getActualExpenseByCategory(data, year, month, category) {
  const m = getMonth(data, year, month);
  return m.expenses.filter((t) => t.category === category).reduce((s, t) => s + (t.amount || 0), 0);
}

export function getBudgetVsActual(data, year, month) {
  return getExpenseCategoryList(data).map((cat) => {
    const budget = getBudgetForMonth(data, cat, month);
    const actual = getActualExpenseByCategory(data, year, month, cat);
    const pct = budget > 0 ? actual / budget : (actual > 0 ? 1 : 0);
    return { category: cat, budget, actual, pct, over: actual > budget && budget > 0 };
  });
}

export function totalAssets(data) {
  const summary = data.assets.summary || [];
  const totalRow = summary.find((s) => /총자산/.test(s.label || ''));
  if (totalRow?.balance) return totalRow.balance;

  const lists = [
    ...data.assets.accounts,
    ...data.assets.emergency,
    ...data.assets.deposits,
    ...data.assets.savings,
    ...data.assets.investments,
    ...data.assets.trades,
  ];
  const listTotal = lists.reduce((s, a) => s + (a.balance || 0), 0);
  if (listTotal > 0) return listTotal;

  return summary.reduce((s, a) => s + (a.balance || 0), 0);
}

export function totalLiabilities(data) {
  const debts = data.liabilities.debts.reduce((s, d) => s + (d.balance || 0), 0);
  const loans = data.liabilities.loans.reduce((s, l) => s + (l.balance || 0), 0);
  return debts + loans;
}

export function assetBreakdown(data) {
  const fromLists = [
    { id: 'accounts', label: '계좌', total: sumList(data.assets.accounts) },
    { id: 'emergency', label: '비상금', total: sumList(data.assets.emergency) },
    { id: 'deposits', label: '예금', total: sumList(data.assets.deposits) },
    { id: 'savings', label: '적금', total: sumList(data.assets.savings) },
    { id: 'investments', label: '투자', total: sumList(data.assets.investments) },
    { id: 'trades', label: '매매', total: sumList(data.assets.trades) },
  ];

  const summary = data.assets.summary || [];
  if (!summary.length) return fromLists;

  const sheetMap = {
    금융자산: 'accounts',
    부동자산: 'deposits',
    비상금: 'emergency',
    예금: 'deposits',
    적금: 'savings',
    투자: 'investments',
  };

  return summary
    .filter((s) => s.balance && !/총자산|순자산|부채/.test(s.label || ''))
    .map((s) => {
      const key = Object.entries(sheetMap).find(([k]) => (s.label || '').includes(k))?.[1] || 'accounts';
      return { id: key, label: s.label, total: s.balance };
    })
    .concat(fromLists.filter((r) => r.total > 0 && !summary.some((s) => (s.label || '').includes(r.label))));
}

function sumList(list) {
  return list.reduce((s, a) => s + (a.balance || 0), 0);
}

export function annualByCategory(data, year, type) {
  const map = {};
  for (let month = 1; month <= 12; month++) {
    const m = getMonth(data, year, month);
    const list = type === 'income' ? m.income : m.expenses;
    for (const t of list) {
      const cat = t.category || '기타';
      map[cat] = (map[cat] || 0) + (t.amount || 0);
    }
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function annualBySubCategory(data, year) {
  const map = {};
  for (let month = 1; month <= 12; month++) {
    const m = getMonth(data, year, month);
    for (const t of m.expenses) {
      const key = t.subCategory ? `${t.category} › ${t.subCategory}` : t.category || '기타';
      map[key] = (map[key] || 0) + (t.amount || 0);
    }
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function annualByCard(data, year) {
  const map = {};
  for (let month = 1; month <= 12; month++) {
    const m = getMonth(data, year, month);
    for (const t of m.expenses) {
      const card = t.card || t.payment || '미지정';
      map[card] = (map[card] || 0) + (t.amount || 0);
    }
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function monthlyTrend(data, year) {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => {
    const s = calcSettlement(data, year, month);
    return { month, netIncome: s.netIncome, totalExpense: s.totalExpense };
  });
}

export function getNetWorth(data) {
  return totalAssets(data) - totalLiabilities(data);
}

export function expensesByOwner(data, year, month) {
  const m = getMonth(data, year, month);
  const map = {};
  for (const t of m.expenses) {
    const o = t.owner || '공동';
    map[o] = (map[o] || 0) + (t.amount || 0);
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function pushRecentTx(data, entry) {
  if (!data.settings.recentTransactions) data.settings.recentTransactions = [];
  const sig = `${entry.kind}|${entry.name}|${entry.category}|${entry.amount}|${entry.owner}`;
  const list = data.settings.recentTransactions.filter(
    (x) => `${x.kind}|${x.name}|${x.category}|${x.amount}|${x.owner}` !== sig
  );
  list.unshift({ ...entry, at: Date.now() });
  data.settings.recentTransactions = list.slice(0, 12);
}

export function expensesByCategoryForMonth(data, year, month) {
  const m = getMonth(data, year, month);
  const map = {};
  for (const t of m.expenses) {
    const cat = t.category || '기타';
    map[cat] = (map[cat] || 0) + (t.amount || 0);
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function defaultTxDate(year, month) {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) {
    return now.toISOString().slice(0, 10);
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export const SHEET_MENU = [
  { section: '가계', items: [
    { id: 'home', label: '메인 (2026년 가계부)' },
    { id: 'goals', label: '재무목표·일정' },
    { id: 'items', label: '항목설정' },
    { id: 'payment', label: '결재 방식' },
  ]},
  { section: '월별', items: [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({ id: `month-${m}`, label: `${m}월` })),
  ]},
  { section: '예산·결산', items: [
    { id: 'budget', label: '예산' },
    { id: 'settlement', label: '결산' },
    { id: 'monthly-report', label: '월별 리포트' },
  ]},
  { section: '연간', items: [
    { id: 'annual-income', label: '연간 항목별 수입' },
    { id: 'annual-card', label: '연간 카드별 지출' },
    { id: 'annual-expense', label: '연간 항목별 지출' },
    { id: 'annual-sub-expense', label: '연간 세부항목별 지출' },
  ]},
  { section: '자산', items: [
    { id: 'asset-summary', label: '자산현황' },
    { id: 'accounts', label: '계좌현황' },
    { id: 'emergency', label: '비상금관리' },
    { id: 'deposits', label: '예금관리' },
    { id: 'savings', label: '적금관리' },
    { id: 'investments', label: '투자관리' },
    { id: 'trades', label: '매매' },
    { id: 'debts', label: '부채관리' },
    { id: 'loans', label: '대출 (1~5)' },
  ]},
];
