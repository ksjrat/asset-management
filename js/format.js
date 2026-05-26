const won = new Intl.NumberFormat('ko-KR');

export function fmtMoney(n) {
  if (n == null || Number.isNaN(n)) return '0원';
  return `${won.format(Math.round(n))}원`;
}

export function fmtShort(n) {
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${Math.round(n / 10000)}만`;
  return won.format(Math.round(n));
}

/** 금액 입력 중 크기 파악용 — "350만원", "1.2억원" (1만 미만은 5,000원) */
export function fmtAmountHint(raw) {
  const num = Number(raw);
  if (raw === '' || raw == null || Number.isNaN(num) || num <= 0) return '';
  const n = Math.round(num);
  if (n >= 100_000_000) {
    const eok = n / 100_000_000;
    const label = eok >= 10 || eok % 1 === 0
      ? `${Math.round(eok)}억`
      : `${eok.toFixed(1).replace(/\.0$/, '')}억`;
    return `${label}원`;
  }
  if (n >= 10_000) {
    const man = n / 10_000;
    const label = man >= 1000 || man % 1 === 0
      ? `${Math.round(man)}만`
      : `${man.toFixed(1).replace(/\.0$/, '')}만`;
    return `${label}원`;
  }
  return `${won.format(n)}원`;
}

export function fmtPct(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '0%';
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtMonth(year, month) {
  return `${year}년 ${month}월`;
}

export function ymKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseYm(key) {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
