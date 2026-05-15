import { DEFAULT, uid } from './store.js';
import { deepMerge } from './merge.js';
import { parseAmount } from './format.js';

const MONTH_SHEET = /^(\d{1,2})\s*월$/;
const LOAN_SHEET = /^대출\s*(\d)$/;

const ASSET_SHEETS = {
  '계좌현황': 'accounts',
  '계좌': 'accounts',
  '비상금관리': 'emergency',
  '비상금': 'emergency',
  '예금관리': 'deposits',
  '예금': 'deposits',
  '적금관리': 'savings',
  '적금': 'savings',
  '투자관리': 'investments',
  '투자': 'investments',
  '매매': 'trades',
  '부채관리': 'debts',
  '부채': 'debts',
};

const INCOME_COLS = { date: 1, cat: 2, sub: 3, name: 4, amt: 7 };
const EXPENSE_COLS = { date: 9, type: 10, cat: 11, sub: 12, name: 13, amt: 15, pay: 16, card: 17 };

const SAVING_CATS = /저축|적금|IRP|퇴직연금|청약|투자|여행\s*적금/;

function norm(s) {
  return String(s ?? '').trim().replace(/\s+/g, '');
}

function cellStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function colIndex(headers, names) {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (names.some((n) => h.includes(norm(n)))) return i;
  }
  return -1;
}

function formatDate(v, year, month) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellStr(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}[./]\d{1,2}/.test(s)) {
    const parts = s.split(/[./]/);
    const d = parts[1] || parts[0];
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function isSectionBreak(first) {
  if (!first) return false;
  return /^(총|고정|변동|부가|MEMO|날짜$|수입$|지출)/.test(first) && !/^\d{4}/.test(first);
}

function findTransactionHeaderRows(rows) {
  const found = [];
  for (let r = 0; r < rows.length; r++) {
    const headers = rows[r].map(cellStr);
    const line = headers.join('|');
    if (line.includes('날짜') && (line.includes('금액') || line.includes('결제금액') || line.includes('지출'))) {
      found.push(r);
    }
  }
  return found;
}

function readSide(row, cols, year, month, isIncome) {
  const amount = parseAmount(row[cols.amt]);
  if (!amount) return null;

  const cat = cellStr(row[cols.cat]);
  const sub = cellStr(row[cols.sub]);
  const name = cellStr(row[cols.name]);
  if (!cat && !sub && !name) return null;
  if (/합계|소계|total/i.test(cat + name)) return null;

  let typeRaw = isIncome ? '' : cellStr(row[cols.type]);
  if (!isIncome && !typeRaw && cat) {
    if (SAVING_CATS.test(cat) || SAVING_CATS.test(sub)) typeRaw = '저축성';
  }

  const isSaving = /저축/.test(typeRaw) || SAVING_CATS.test(cat);

  return {
    id: uid(),
    date: formatDate(row[cols.date], year, month),
    owner: '공동',
    name: name || sub || cat,
    category: cat || (isIncome ? '기타수입' : '기타'),
    subCategory: sub,
    amount,
    card: !isIncome && cols.card != null ? cellStr(row[cols.card]) : '',
    payment: !isIncome && cols.pay != null ? cellStr(row[cols.pay]) : '',
    type: isSaving ? 'saving' : 'consumption',
  };
}

function parseMonthTransactions(rows, year, month) {
  const income = [];
  const expenses = [];
  const headerRows = findTransactionHeaderRows(rows);

  for (const hr of headerRows) {
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => cellStr(c) === '')) continue;

      const first = cellStr(row[1]) || cellStr(row[9]);
      if (isSectionBreak(first)) break;
      if (norm(first) === '날짜') continue;

      const inc = readSide(row, INCOME_COLS, year, month, true);
      if (inc) income.push(inc);

      const exp = readSide(row, EXPENSE_COLS, year, month, false);
      if (exp) expenses.push(exp);
    }
  }
  return { income, expenses };
}

function parseMonthCategorySummary(rows, year, month) {
  const items = [];
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

  for (let r = 8; r < Math.min(rows.length, 28); r++) {
    const row = rows[r];
    if (!row) continue;
    const cat = cellStr(row[9]);
    if (!cat || /항목|분석|MEMO|지출|예산/i.test(cat)) continue;

    const spent = parseAmount(row[10]);
    const budget = parseAmount(row[11]);
    const actual = parseAmount(row[12]) || spent;
    if (!actual && !budget) continue;

    items.push({ category: cat, budget, actual, spent });
  }

  return { items, lastDay };
}

function synthesizeFromCategorySummary(summary, lastDay) {
  const expenses = [];
  for (const { category, actual } of summary) {
    if (!actual || actual <= 0) continue;
    expenses.push({
      id: uid(),
      date: lastDay,
      owner: '공동',
      name: '(시트 카테고리 합계)',
      category,
      subCategory: '',
      amount: actual,
      card: '',
      payment: '',
      type: SAVING_CATS.test(category) ? 'saving' : 'consumption',
    });
  }
  return expenses;
}

function synthesizeIncomeFromBudget(budget, year, month) {
  const income = [];
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  const incomeCats = ['급여', '상여', '투자수익', '이자', '부수익', '기타 수입', '기타수입'];

  for (const cat of incomeCats) {
    const amt = (budget[cat] || {})[month];
    if (!amt || amt <= 0) continue;
    income.push({
      id: uid(),
      date: lastDay,
      owner: '공동',
      name: '(예산 시트)',
      category: cat.replace(/\s/g, ''),
      subCategory: '',
      amount: amt,
      card: '',
      payment: '',
      type: 'consumption',
    });
  }
  return income;
}

function parseBudgetSheet(rows) {
  const budget = {};
  let headerRow = -1;
  let monthCols = [];

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const v = cellStr(row[c]);
      const m = v.match(/^(\d{1,2})월$/);
      if (m) {
        headerRow = r;
        monthCols = [];
        for (let c2 = 0; c2 < row.length; c2++) {
          const mv = cellStr(row[c2]).match(/^(\d{1,2})월$/);
          if (mv) monthCols.push({ col: c2, month: parseInt(mv[1], 10) });
        }
        break;
      }
    }
    if (headerRow >= 0) break;
  }

  if (headerRow < 0) return budget;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    let cat = '';
    for (let c = 0; c < Math.min(3, row.length); c++) {
      const v = cellStr(row[c]);
      if (v && !/nan/i.test(v)) {
        cat = v;
        break;
      }
    }
    if (!cat || /예산|구분|총계|합계/i.test(cat)) continue;

    budget[cat] = budget[cat] || {};
    for (const { col, month } of monthCols) {
      const v = parseAmount(row[col]);
      if (v) budget[cat][month] = v;
    }
  }
  return budget;
}

function parseCategoriesSheet(rows) {
  const incomeCategories = [];
  const expenseCategories = [];
  const subCategories = {};
  const header = rows[2];
  if (!header) return { incomeCategories, expenseCategories, subCategories };

  const colParents = [];
  for (let c = 2; c < header.length; c++) colParents.push(cellStr(header[c]));

  for (const parent of colParents) {
    if (!parent || parent === '수입' || parent === '추가항목') continue;
    expenseCategories.push(parent);
    subCategories[parent] = [];
  }

  for (let r = 3; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 2; c < colParents.length; c++) {
      const parent = colParents[c];
      const sub = cellStr(row[c]);
      if (!parent || !sub) continue;
      if (parent === '수입') {
        if (!incomeCategories.includes(sub)) incomeCategories.push(sub);
      } else if (subCategories[parent] && !subCategories[parent].includes(sub)) {
        subCategories[parent].push(sub);
      }
    }
  }

  return { incomeCategories, expenseCategories, subCategories };
}

const SETTLEMENT_SKIP = /^(소비성지출|수입\s*총|총계|합계|누계|총\s*예산)/;

function monthLastDay(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

function parseSettlementSheet(rows, year) {
  const months = {};
  let headerRow = -1;
  let monthCols = [];

  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (/^\d{1,2}월$/.test(cellStr(row[c]))) {
        headerRow = r;
        monthCols = [];
        for (let c2 = 0; c2 < row.length; c2++) {
          const m = cellStr(row[c2]).match(/^(\d{1,2})월$/);
          if (m) monthCols.push({ col: c2, month: parseInt(m[1], 10) });
        }
        break;
      }
    }
    if (headerRow >= 0) break;
  }
  if (headerRow < 0) return months;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const cat = cellStr(row[1]) || cellStr(row[0]);
    if (!cat || SETTLEMENT_SKIP.test(cat)) continue;

    for (const { col, month } of monthCols) {
      const amount = Math.abs(parseAmount(row[col]));
      if (!amount) continue;

      const key = `${year}-${String(month).padStart(2, '0')}`;
      const lastDay = monthLastDay(year, month);
      if (!months[key]) months[key] = { carryOver: 0, income: [], expenses: [] };

      if (cat === '수입' || /^수입\s*총/.test(cat)) {
        months[key].income.push({
          id: uid(),
          date: lastDay,
          owner: '공동',
          name: '(결산 시트)',
          category: '수입',
          subCategory: '',
          amount,
          card: '',
          payment: '',
          type: 'consumption',
        });
      } else if (cat === '저축성지출' || /^저축/.test(cat)) {
        months[key].expenses.push({
          id: uid(),
          date: lastDay,
          owner: '공동',
          name: '(결산 시트)',
          category: '저축성지출',
          subCategory: '',
          amount,
          card: '',
          payment: '',
          type: 'saving',
        });
      } else {
        months[key].expenses.push({
          id: uid(),
          date: lastDay,
          owner: '공동',
          name: '(결산 시트)',
          category: cat,
          subCategory: '',
          amount,
          card: '',
          payment: '',
          type: SAVING_CATS.test(cat) ? 'saving' : 'consumption',
        });
      }
    }
  }
  return months;
}

function findHeaderRow(rows, keys, maxRow = 30) {
  for (let r = 0; r < Math.min(rows.length, maxRow); r++) {
    const line = rows[r].map(cellStr).join('|');
    if (keys.filter((k) => line.includes(k)).length >= 2) return r;
  }
  return -1;
}

function parseAccountsSheet(rows) {
  const list = [];
  const hr = findHeaderRow(rows, ['은행', '계좌'], 15);
  if (hr < 0) return list;

  const headers = rows[hr].map(cellStr);
  const iBal = colIndex(headers, ['연동금액', '잔액', '금액']);

  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const no = cellStr(row[1]);
    const bank = cellStr(row[2]);
    const name = cellStr(row[5]) || cellStr(row[4]);
    if (!bank && !name) continue;
    if (/합계|No/i.test(no + bank)) continue;

    const balance = iBal >= 0 ? parseAmount(row[iBal]) : parseAmount(row[10]);

    list.push({
      id: uid(),
      name: name || bank,
      institution: bank,
      owner: /은지/.test(name + cellStr(row[7])) ? '은지' : /승재/.test(name + cellStr(row[7])) ? '승재' : '공동',
      balance,
      accountType: cellStr(row[3]),
      accountNo: cellStr(row[6]),
      purpose: cellStr(row[7]),
    });
  }
  return list;
}

function parseAssetSummarySheet(rows) {
  const summary = [];
  for (let r = 2; r < Math.min(rows.length, 12); r++) {
    const row = rows[r];
    if (!row) continue;
    const label = cellStr(row[3]) || cellStr(row[1]);
    const balance = parseAmount(row[4]);
    if (!label || !balance) continue;
    if (/◀|NaN/i.test(label)) continue;

    const clean = label.replace(/\s*계$/, '').trim();
    summary.push({
      id: uid(),
      label: clean,
      balance,
    });
  }
  return summary;
}

function parseInvestmentSheet(rows) {
  const list = [];
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const headers = rows[r].map(cellStr);
    if (!headers.some((h) => /평가금액/.test(h) && !/손익/.test(h))) continue;
    const dataRow = rows[r + 1] || rows[r];
    const iEval = headers.findIndex((h) => /평가금액/.test(h) && !/손익/.test(h));
    const balance = parseAmount(dataRow[iEval >= 0 ? iEval : 8]);
    if (balance > 100000) {
      list.push({
        id: uid(),
        name: '투자 평가 합계 (시트)',
        institution: '투자관리',
        owner: '공동',
        balance,
      });
    }
    break;
  }
  return list;
}

function parseSavingsSheet(rows) {
  const list = [];
  const hr = findHeaderRow(rows, ['은행', '적금'], 15);
  if (hr < 0) return list;

  const headers = rows[hr].map(cellStr);
  const iMonthly = colIndex(headers, ['월적립', '적립액']);

  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const name = cellStr(row[3]);
    const bank = cellStr(row[2]);
    if (!name || /No|합계|^\d+$/.test(name)) continue;
    if (!bank && !cellStr(row[4])) continue;

    list.push({
      id: uid(),
      name,
      institution: bank,
      owner: '공동',
      balance: 0,
      note: cellStr(row[4]),
      monthlyDeposit: iMonthly >= 0 ? parseAmount(row[iMonthly]) : parseAmount(row[11]),
    });
  }
  return list;
}

function parseDebtsSheet(rows) {
  const list = [];
  const hr = findHeaderRow(rows, ['기관', '대출'], 15);
  if (hr < 0) return list;
  const headers = rows[hr].map(cellStr);
  const iBal = colIndex(headers, ['대출금액', '잔액', '금액']);

  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const lender = cellStr(row[2]);
    const name = cellStr(row[3]);
    const balance = iBal >= 0 ? parseAmount(row[iBal]) : parseAmount(row[8]);
    if (!lender && !name) continue;
    if (!balance) continue;

    list.push({
      id: uid(),
      name: name || lender,
      institution: lender,
      owner: '공동',
      balance,
    });
  }
  return list;
}

function sheetToRows(ws) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      row.push(ws[addr]?.v);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * @param {ArrayBuffer} buffer
 * @param {number} year
 */
export function parseXlsxBuffer(buffer, year = 2026) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const data = deepMerge(structuredClone(DEFAULT), {
    year,
    months: {},
    budget: {},
    assets: structuredClone(DEFAULT.assets),
    liabilities: structuredClone(DEFAULT.liabilities),
  });

  const stats = {
    months: 0,
    income: 0,
    expenses: 0,
    assets: 0,
    budgetCats: 0,
    synthesized: 0,
    sheets: [],
  };

  let settlementMonths = {};

  for (const sheetName of wb.SheetNames) {
    const rows = sheetToRows(wb.Sheets[sheetName]);
    if (!rows.length) continue;

    if (sheetName.includes('항목') && !sheetName.includes('결재')) {
      const cats = parseCategoriesSheet(rows);
      if (cats.incomeCategories.length) data.settings.incomeCategories = cats.incomeCategories;
      if (cats.expenseCategories.length) data.settings.expenseCategories = cats.expenseCategories;
      if (Object.keys(cats.subCategories).length) {
        data.settings.subCategories = { ...data.settings.subCategories, ...cats.subCategories };
      }
      stats.sheets.push(`항목: 수입 ${cats.incomeCategories.length}, 지출 ${cats.expenseCategories.length}그룹`);
      continue;
    }

    if (sheetName.includes('예산')) {
      const b = parseBudgetSheet(rows);
      Object.assign(data.budget, b);
      stats.budgetCats = Object.keys(b).length;
      stats.sheets.push(`예산: ${stats.budgetCats}개 항목`);
      continue;
    }

    if (sheetName.includes('결산')) {
      settlementMonths = parseSettlementSheet(rows, year);
      const n = Object.keys(settlementMonths).length;
      if (n) stats.sheets.push(`결산: ${n}개월 반영`);
      continue;
    }
  }

  for (const sheetName of wb.SheetNames) {
    const rows = sheetToRows(wb.Sheets[sheetName]);
    if (!rows.length) continue;

    const monthM = sheetName.match(MONTH_SHEET);
    if (monthM) {
      const month = parseInt(monthM[1], 10);
      const key = `${year}-${String(month).padStart(2, '0')}`;
      let { income, expenses } = parseMonthTransactions(rows, year, month);
      const hasRealTx = [...income, ...expenses].some(
        (t) => t.name && !/^\((결산|시트|예산)/.test(t.name)
      );

      if (!hasRealTx && settlementMonths[key]) {
        data.months[key] = structuredClone(settlementMonths[key]);
        stats.synthesized += data.months[key].income.length + data.months[key].expenses.length;
      } else if (!hasRealTx) {
        const { items, lastDay } = parseMonthCategorySummary(rows, year, month);
        if (!expenses.length && items.some((i) => i.actual > 0)) {
          expenses = synthesizeFromCategorySummary(items, lastDay);
          stats.synthesized += expenses.length;
        }
        if (!income.length) {
          income = synthesizeIncomeFromBudget(data.budget, year, month);
          stats.synthesized += income.length;
        }
        if (income.length || expenses.length) {
          data.months[key] = { carryOver: 0, income, expenses };
        }
      } else {
        data.months[key] = { carryOver: 0, income, expenses };
      }

      if (data.months[key]) {
        stats.months++;
        stats.income += data.months[key].income.length;
        stats.expenses += data.months[key].expenses.length;
        stats.sheets.push(
          `${sheetName}: 수입 ${data.months[key].income.length}, 지출 ${data.months[key].expenses.length}`
        );
      }
      continue;
    }

    if (sheetName.includes('자산현황') || sheetName.replace(/\s/g, '') === '자산현황') {
      data.assets.summary = parseAssetSummarySheet(rows);
      stats.assets += data.assets.summary.length;
      stats.sheets.push(`자산현황: 요약 ${data.assets.summary.length}항목`);
      continue;
    }

    const assetKey = ASSET_SHEETS[sheetName] || ASSET_SHEETS[sheetName.replace(/\s/g, '')];
    if (assetKey === 'accounts') {
      const items = parseAccountsSheet(rows);
      data.assets.accounts.push(...items);
      stats.assets += items.length;
      stats.sheets.push(`${sheetName}: ${items.length}건`);
      continue;
    }
    if (assetKey === 'savings') {
      const items = parseSavingsSheet(rows);
      data.assets.savings.push(...items);
      stats.assets += items.length;
      stats.sheets.push(`${sheetName}: ${items.length}건`);
      continue;
    }
    if (assetKey === 'investments' || sheetName.includes('투자')) {
      const items = parseInvestmentSheet(rows);
      if (items.length) {
        data.assets.investments.push(...items);
        stats.assets += items.length;
        stats.sheets.push(`${sheetName}: 투자 ${items.length}건`);
      }
      continue;
    }
    if (assetKey === 'debts') {
      const items = parseDebtsSheet(rows);
      data.liabilities.debts.push(...items);
      if (items[0] && data.liabilities.loans[0]) {
        data.liabilities.loans[0] = {
          ...data.liabilities.loans[0],
          name: items[0].name,
          lender: items[0].institution,
          balance: items[0].balance,
        };
      }
      stats.assets += items.length;
      stats.sheets.push(`${sheetName}: ${items.length}건`);
      continue;
    }

    const loanM = sheetName.match(LOAN_SHEET);
    if (loanM) {
      const idx = parseInt(loanM[1], 10) - 1;
      const items = parseDebtsSheet(rows);
      if (items[0] && data.liabilities.loans[idx]) {
        Object.assign(data.liabilities.loans[idx], {
          lender: items[0].institution,
          balance: items[0].balance,
          name: items[0].name || data.liabilities.loans[idx].name,
        });
        stats.sheets.push(`${sheetName} 반영`);
      }
    }
  }

  for (const [key, mo] of Object.entries(settlementMonths)) {
    if (!data.months[key]) {
      data.months[key] = structuredClone(mo);
      stats.months++;
      stats.income += mo.income.length;
      stats.expenses += mo.expenses.length;
    }
  }

  const expenseSet = new Set(data.settings.expenseCategories || []);
  for (const k of Object.keys(data.budget)) {
    if (k && !/^(급여|상여|투자수익|이자|부수익|기타\s*수입|수입)/.test(k)) expenseSet.add(k);
  }
  data.settings.expenseCategories = [...expenseSet];

  return { data, stats };
}

export function saveImportedData(data) {
  data.version = 2;
  localStorage.setItem('sej-ledger-2026', JSON.stringify(data));
}
