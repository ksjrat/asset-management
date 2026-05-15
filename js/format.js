export function formatWon(n) {
  if (n == null || Number.isNaN(n)) return '-';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

export function formatPct(n) {
  if (n == null || Number.isNaN(n)) return '-';
  return (n * 100).toFixed(1) + '%';
}

export function parseAmount(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return Number(String(str).replace(/[^0-9.-]/g, '')) || 0;
}

export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthLabel(month) {
  return `${month}월`;
}

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const p = dateStr.split('-');
  if (p.length >= 3) return `${parseInt(p[1], 10)}/${parseInt(p[2], 10)}`;
  return dateStr;
}
