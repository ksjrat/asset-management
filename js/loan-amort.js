export const LOAN_REPAYMENT_METHODS = [
  { id: 'equal_payment', label: '원리금균등' },
  { id: 'equal_principal', label: '원금균등' },
];

export function getLoanRepaymentLabel(methodId) {
  return LOAN_REPAYMENT_METHODS.find((m) => m.id === methodId)?.label || '원리금균등';
}

export function monthlyRate(annualRatePct) {
  return (Number(annualRatePct) || 0) / 100 / 12;
}

export function calcMonthlyInterest(balance, annualRatePct) {
  const bal = Math.max(0, Number(balance) || 0);
  return Math.round(bal * monthlyRate(annualRatePct));
}

/**
 * 월 상환액을 원금·이자로 분리한다.
 * @param {number} balance 상환 전 잔액
 * @param {number} payment 이번 달 납부 원리금
 */
export function splitLoanPayment(balance, payment, loan) {
  const bal = Math.max(0, Number(balance) || 0);
  const pay = Math.max(0, Number(payment) || 0);
  if (bal <= 0 || pay <= 0) {
    return { principal: 0, interest: 0, payment: pay };
  }

  const interest = calcMonthlyInterest(bal, loan?.annualRate);
  const principal = Math.min(bal, Math.max(0, pay - interest));
  return { principal, interest, payment: pay };
}

/** 예상 월 상환액 (안내용) */
export function calcScheduledPayment(balance, loan) {
  const bal = Math.max(0, Number(balance) || 0);
  const r = monthlyRate(loan?.annualRate);
  const n = Math.max(0, Number(loan?.termMonths) || 0);
  if (n <= 0 || bal <= 0) return null;

  if (loan?.repaymentMethod === 'equal_principal') {
    const orig = Math.max(bal, Number(loan.originalPrincipal) || bal);
    const principalPart = orig / n;
    return Math.round(principalPart + bal * r);
  }

  if (r <= 0) return Math.round(bal / n);
  const factor = Math.pow(1 + r, n);
  return Math.round((bal * r * factor) / (factor - 1));
}

export function formatLoanSplitSummary(split) {
  if (!split || split.payment <= 0) return '';
  return `원금 ${split.principal.toLocaleString('ko-KR')} · 이자 ${split.interest.toLocaleString('ko-KR')}`;
}
