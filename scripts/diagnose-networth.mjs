/**
 * 순자산·총자산 불일치 진단
 *
 * 사용법:
 *   node scripts/diagnose-networth.mjs path/to/export.json
 *   node scripts/diagnose-networth.mjs path/to/export.json 2026 5
 *
 * 브라우저에서 JSON 내보내기: 개발자 도구 콘솔
 *   copy(JSON.stringify(JSON.parse(localStorage.getItem('couple-asset-app-v1'))))
 */
import { readFileSync } from 'node:fs';
import { computeNetWorth, getEffectiveAssetAmount, ASSET_TYPES } from '../js/store.js';
import { computeNetWorthAtMonth } from '../js/snapshot-engine.js';
import { getBudgetStart } from '../js/budget-engine.js';
import { ymKey } from '../js/format.js';

function fmt(n) {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

function baseAmountAfterReset(item) {
  if (item.type === 'loan') {
    const base = item.originalPrincipal ?? item.history?.find((h) => h.source !== 'budget-sync')?.amount
      ?? item.history?.[0]?.amount ?? item.amount;
    return Math.max(0, Number(base) || 0);
  }
  const h = (item.history || []).find((x) => x.source !== 'budget-sync') || item.history?.[0];
  return h ? Math.max(0, Number(h.amount) || 0) : Math.max(0, Number(item.amount) || 0);
}

function budgetSyncDelta(item) {
  let delta = 0;
  for (const e of item.savingsLog || []) {
    if (e.source === 'budget') delta += Number(e.amount) || 0;
  }
  for (const e of item.repaymentLog || []) {
    if (e.source === 'budget') delta -= Number(e.principal) || 0;
  }
  return delta;
}

function perAssetRows(data, ownerFilter, throughYm) {
  return (data.assets?.items || []).flatMap((item) => {
    if (ownerFilter !== 'all' && item.owner !== ownerFilter) return [];
    const type = ASSET_TYPES.find((t) => t.id === item.type);
    if (!type) return [];
    const current = getEffectiveAssetAmount(item);
    const atMonth = getEffectiveAssetAmount(item, throughYm);
    const base = baseAmountAfterReset(item);
    const synced = budgetSyncDelta(item);
    return {
      name: item.name,
      type: type.label,
      group: type.group,
      base,
      budgetSyncTotal: synced,
      currentAmount: item.amount,
      currentEffective: current,
      atMonthEffective: atMonth,
    }];
  });
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/diagnose-networth.mjs <data.json> [year] [month]');
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, 'utf8'));
const start = getBudgetStart(data);
const year = Number(process.argv[3]) || start?.year || new Date().getFullYear();
const month = Number(process.argv[4]) || start?.month || 1;
const throughYm = ymKey(year, month);
const ownerFilter = 'all';

const current = computeNetWorth(data, ownerFilter);
const atMonth = computeNetWorthAtMonth(
  data, year, month, (d, ym) => computeNetWorth(d, ownerFilter, ym),
);

console.log('\n=== 순자산·총자산 진단 ===\n');
console.log(`예산 시작: ${start ? `${start.year}년 ${start.month}월` : '미설정'}`);
console.log(`진단 월: ${year}년 ${month}월 (${throughYm})\n`);

console.log('【홈 — 자산 탭 현재값】');
console.log(`  총자산 ${fmt(current.assets)} · 부채 ${fmt(current.liabilities)} · 순자산 ${fmt(current.net)}`);

console.log(`\n【그래프 — ${year}년 ${month}월 말 replay】`);
console.log(`  총자산 ${fmt(atMonth.assets)} · 부채 ${fmt(atMonth.liabilities)} · 순자산 ${fmt(atMonth.net)}`);

const diff = current.assets - atMonth.assets;
console.log(`\n【차이】 총자산 ${diff >= 0 ? '+' : ''}${fmt(diff)}`);
if (Math.abs(diff) > 0) {
  console.log('  → 자산 탭 현재 잔액과 replay 결과가 다릅니다.');
  console.log('  → 예산 자동 반영·직접 수정·최신 평가( replay 월 이후 )가 원인일 수 있습니다.');
}

console.log('\n【항목별 breakdown】');
console.log('  (base=예산 반영 전 초기 등록액, sync=예산으로 누적 반영된 변화, current=지금, atMonth=해당 월말 replay)\n');

const rows = perAssetRows(data, ownerFilter, throughYm);
let baseAssets = 0;
let baseLiab = 0;
for (const r of rows) {
  if (r.group === 'asset') baseAssets += r.base;
  else baseLiab += r.base;
  const flag = r.currentEffective !== r.atMonthEffective ? ' ⚠' : '';
  console.log(`  ${r.name} (${r.type})`);
  console.log(`    base ${fmt(r.base)} · budget sync ${r.budgetSyncTotal >= 0 ? '+' : ''}${fmt(r.budgetSyncTotal)}`);
  console.log(`    current ${fmt(r.currentEffective)} · ${year}/${month}말 ${fmt(r.atMonthEffective)}${flag}`);
}

console.log(`\n  base 합계 — 자산 ${fmt(baseAssets)} · 부채 ${fmt(baseLiab)}`);
console.log(`  (${year}년 ${month}월 그래프 시작점 ≈ base + 해당월까지 예산 replay)\n`);
