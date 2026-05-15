import { monthsBetween } from './store.js';
import { todayISO } from './format.js';

export function validateGoalInput({ title, targetAmount, startDate, endDate }) {
  const errors = [];
  if (!title?.trim()) errors.push('목표명을 입력하세요.');
  if (!targetAmount || targetAmount <= 0) errors.push('목표 금액은 0원보다 커야 합니다.');
  if (!startDate) errors.push('시작일을 선택하세요.');
  if (!endDate) errors.push('목표일을 선택하세요.');
  if (startDate && endDate && endDate <= startDate) errors.push('목표일은 시작일 이후여야 합니다.');
  if (endDate && endDate < todayISO()) errors.push('목표일이 과거입니다.');
  const months = startDate && endDate ? monthsBetween(startDate, endDate) : 0;
  if (months > 600) errors.push('목표 기간이 너무 깁니다 (최대 50년).');
  return errors;
}

export function projectGoalImpact(targetAmount, currentAmount, monthlyContribution, endDate) {
  const remaining = Math.max(0, targetAmount - currentAmount);
  if (!monthlyContribution || monthlyContribution <= 0) {
    return { text: '월 기여금을 입력하면 예상 달성 시점을 계산합니다.' };
  }
  const monthsNeeded = Math.ceil(remaining / monthlyContribution);
  const projected = new Date();
  projected.setMonth(projected.getMonth() + monthsNeeded);
  const projectedISO = projected.toISOString().slice(0, 10);

  if (endDate) {
    const end = new Date(endDate);
    const onTrack = projected <= end;
    const diffMonths = monthsBetween(todayISO(), endDate);
    const plannedTotal = monthlyContribution * Math.max(1, diffMonths);
    const gap = targetAmount - currentAmount - plannedTotal;
    if (!onTrack) {
      return {
        text: `이 속도면 ${projectedISO}쯤 달성 · 목표일보다 늦어질 수 있어요`,
        warn: true,
        gap,
      };
    }
    if (gap < 0) {
      return {
        text: `목표일 전 달성 가능 · 약 ${Math.abs(Math.round(gap / 10000))}만원 여유`,
        warn: false,
      };
    }
    return {
      text: `목표일(${endDate}) 전 달성 가능해 보여요`,
      warn: false,
    };
  }
  return { text: `약 ${monthsNeeded}개월 후 (${projectedISO}쯤) 달성 예상` };
}

export function parseTags(raw) {
  if (!raw?.trim()) return [];
  return raw.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
}
