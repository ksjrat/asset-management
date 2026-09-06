import { ymKey } from './format.js';
import {
  findSubItemCategoryId,
  getSubItems,
  getSubActualEntry,
  readBudgetAmount,
  getCategoryPeriodSummary,
} from './budget-engine.js';
import { splitLoanPayment, formatLoanSplitSummary } from './loan-amort.js';

export function budgetLoanLogId(itemId, year, month) {
  return `budget-loan-${itemId}-${ymKey(year, month)}`;
}

function getSubActualPayment(data, year, month, itemId) {
  return readBudgetAmount(getSubActualEntry(data, year, month, itemId));
}

function housingCategory(data) {
  return data.budget?.categories?.find((c) => c.name === '주거') || null;
}

function isHousingSubItem(data, itemId) {
  const catId = findSubItemCategoryId(data, itemId);
  if (!catId) return false;
  const cat = data.budget?.categories?.find((c) => c.id === catId);
  return cat?.name === '주거';
}

function collectHousingLoanItems(data) {
  const itemById = new Map();
  const housingCat = housingCategory(data);
  if (housingCat) {
    for (const item of getSubItems(data, housingCat.id)) {
      if (item.loanId) itemById.set(item.id, item);
    }
  }
  return { housingCat, itemById };
}

function loanItemPrincipalForMonth(data, year, month, item, loan) {
  const payment = getSubActualPayment(data, year, month, item.id);
  if (payment > 0) {
    const preview = previewLoanSplit(data, item.id, year, month, payment);
    if (preview) return Number(preview.principal) || 0;
  }
  const logEntry = findBudgetLoanLogEntry(loan, item.id, year, month);
  if (logEntry) return Number(logEntry.principal) || 0;
  return 0;
}

function findSubItem(data, itemId) {
  const catId = findSubItemCategoryId(data, itemId);
  if (!catId) return null;
  const item = getSubItems(data, catId).find((i) => i.id === itemId);
  return item ? { catId, item } : null;
}

export function getLoanForSubItem(data, itemId) {
  const found = findSubItem(data, itemId);
  if (!found?.item?.loanId) return null;
  const loan = data.assets?.items?.find((x) => x.id === found.item.loanId && x.type === 'loan');
  return loan || null;
}

function findBudgetLoanLogEntry(loan, itemId, year, month) {
  const id = budgetLoanLogId(itemId, year, month);
  return (loan.repaymentLog || []).find((e) => e.id === id) || null;
}

function prevSyncedPrincipal(loan, itemId, year, month) {
  const entry = findBudgetLoanLogEntry(loan, itemId, year, month);
  return entry ? Number(entry.principal) || 0 : 0;
}

export function previewLoanSplit(data, itemId, year, month, payment) {
  const loan = getLoanForSubItem(data, itemId);
  if (!loan || loan.annualRate == null || Number.isNaN(Number(loan.annualRate))) return null;
  const prevPrincipal = prevSyncedPrincipal(loan, itemId, year, month);
  const balanceBefore = (loan.amount || 0) + prevPrincipal;
  const split = splitLoanPayment(balanceBefore, payment, loan);
  return { ...split, loan, balanceBefore };
}

export function syncLoanSubActualToAsset(data, year, month, itemId, paymentAmount) {
  const found = findSubItem(data, itemId);
  if (!found?.item?.loanId) return { ok: false, reason: 'no-link' };

  const loan = data.assets?.items?.find((x) => x.id === found.item.loanId && x.type === 'loan');
  if (!loan) return { ok: false, reason: 'no-loan' };
  if (loan.annualRate == null || Number.isNaN(Number(loan.annualRate))) {
    return { ok: false, reason: 'no-rate' };
  }

  const payment = Math.max(0, Number(paymentAmount) || 0);
  const entryId = budgetLoanLogId(itemId, year, month);
  loan.repaymentLog = loan.repaymentLog || [];

  const existing = findBudgetLoanLogEntry(loan, itemId, year, month);
  const prevPrincipal = existing ? Number(existing.principal) || 0 : 0;
  const balanceBefore = (loan.amount || 0) + prevPrincipal;

  let principal = 0;
  let interest = 0;
  if (payment > 0 && balanceBefore > 0) {
    ({ principal, interest } = splitLoanPayment(balanceBefore, payment, loan));
  }

  const delta = principal - prevPrincipal;
  loan.amount = Math.max(0, (loan.amount || 0) - delta);

  if (payment === 0) {
    if (existing) loan.repaymentLog = loan.repaymentLog.filter((e) => e.id !== entryId);
  } else {
    const entry = {
      id: entryId,
      subItemId: itemId,
      year,
      month,
      payment,
      principal,
      interest,
      balanceAfter: loan.amount,
      memo: found.item.name,
      source: 'budget',
      at: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, entry);
    else loan.repaymentLog.push(entry);
  }

  if (delta !== 0) {
    loan.history = loan.history || [];
    loan.history.push({
      amount: loan.amount,
      at: new Date().toISOString(),
      source: 'budget-sync',
      subItemId: itemId,
      principal,
      interest,
      year,
      month,
    });
  }

  return { ok: true, principal, interest, payment, delta, loan, itemId };
}

export function reconcileAllLoanBudgetSync(data) {
  if (!data.budget?.subActuals) return;
  for (const [key, bucket] of Object.entries(data.budget.subActuals)) {
    const m = key.match(/^(\d{4})-(\d{2})$/);
    if (!m) continue;
    const year = Number(m[1]);
    const month = Number(m[2]);
    for (const itemId of Object.keys(bucket || {})) {
      if (!findSubItem(data, itemId)?.item?.loanId) continue;
      const amt = getSubActualPayment(data, year, month, itemId);
      syncLoanSubActualToAsset(data, year, month, itemId, amt);
    }
  }
}

export function ensureLoanFields(item) {
  if (item.type !== 'loan') return;
  if (item.originalPrincipal == null && item.amount != null) {
    item.originalPrincipal = item.history?.[0]?.amount ?? item.amount;
  }
  if (!item.repaymentMethod) item.repaymentMethod = 'equal_payment';
}

export { formatLoanSplitSummary };

/** 주거(주택) 대출 세부 실적의 당월 원금 상환 합계 */
export function getMonthHousingPrincipalTotal(data, year, month) {
  const { housingCat, itemById } = collectHousingLoanItems(data);
  const key = ymKey(year, month);
  const bucket = data.budget?.subActuals?.[key];
  if (bucket) {
    for (const itemId of Object.keys(bucket)) {
      if (!isHousingSubItem(data, itemId)) continue;
      const found = findSubItem(data, itemId);
      if (found?.item?.loanId) itemById.set(found.item.id, found.item);
    }
  }

  let total = 0;
  for (const item of itemById.values()) {
    const loan = data.assets?.items?.find((x) => x.id === item.loanId && x.type === 'loan');
    if (!loan) continue;
    ensureLoanFields(loan);
    total += loanItemPrincipalForMonth(data, year, month, item, loan);
  }
  if (total > 0 || !housingCat) return total;

  const s = getCategoryPeriodSummary(data, year, month, housingCat.id);
  if (!s.hasActual || s.actual <= 0) return 0;
  const loanItems = [...itemById.values()];
  if (loanItems.length === 1 && getSubActualPayment(data, year, month, loanItems[0].id) <= 0) {
    const preview = previewLoanSplit(data, loanItems[0].id, year, month, s.actual);
    if (preview) return Number(preview.principal) || 0;
  }
  return 0;
}
