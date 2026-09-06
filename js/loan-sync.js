import { ymKey } from './format.js';
import {
  findSubItemCategoryId,
  getSubItems,
  getSubActualAmount,
  getVisibleSubItems,
} from './budget-engine.js';
import { splitLoanPayment, formatLoanSplitSummary } from './loan-amort.js';

export function budgetLoanLogId(itemId, year, month) {
  return `budget-loan-${itemId}-${ymKey(year, month)}`;
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
  if (!loan || !loan.annualRate) return null;
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
      const amt = getSubActualAmount(data, year, month, itemId) || 0;
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
  const housingCat = data.budget?.categories?.find((c) => c.name === '주거');
  if (!housingCat) return 0;
  let total = 0;
  for (const item of getVisibleSubItems(data, housingCat.id)) {
    if (!item.loanId) continue;
    const loan = data.assets?.items?.find((x) => x.id === item.loanId && x.type === 'loan');
    if (!loan) continue;
    const entry = findBudgetLoanLogEntry(loan, item.id, year, month);
    if (entry) {
      total += Number(entry.principal) || 0;
      continue;
    }
    const payment = getSubActualAmount(data, year, month, item.id) || 0;
    if (payment > 0) {
      const preview = previewLoanSplit(data, item.id, year, month, payment);
      if (preview) total += Number(preview.principal) || 0;
    }
  }
  return total;
}
