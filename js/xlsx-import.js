import { DEFAULT, uid } from './store.js';
import { deepMerge } from './merge.js';
import { parseAmount } from './format.js';

const MONTH_SHEET = /^(\d{1,2})\s*월$/;
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

const LOAN_SHEET = /^대출\s*(\d)$/;

function norm(s) {
  return String(s ?? '').trim().replace(/\s+/g, '');
}

function cellStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function findHeaderRow(rows) {
  const keys = ['날짜', '일자', '항목', '금액', '구분', '수입', '지출', '내용', '적요'];
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const line = rows[r].map(cellStr).join('|');
    const hits = keys.filter((k) => line.includes(k)).length;
    if (hits >= 2) return r;
  }
  return -1;
}

function colIndex(headers, names) {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (names.some((n) => h.includes(norm(n)))) return i;
  }
  return -1;
}

function parseMonthSheet(rows, year, month) {
  const income = [];
  const expenses = [];
  const hr = findHeaderRow(rows);
  if (hr < 0) return { income, expenses };

  const headers = rows[hr].map(cellStr);
  const iDate = colIndex(headers, ['날짜', '일자', 'date']);
  const iType = colIndex(headers, ['구분', '수입지출', 'type']);
  const iCat = colIndex(headers, ['항목', '카테고리', '대분류', 'category']);
  const iSub = colIndex(headers, ['세부', '세부항목']);
  const iAmt = colIndex(headers, ['금액', 'amount']);
  const iName = colIndex(headers, ['내용', '적요', '메모', 'name']);
  const iCard = colIndex(headers, ['카드']);
  const iPay = colIndex(headers, ['결제', '결재']);
  const iOwner = colIndex(headers, ['소유', '담당', '이름']);

  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => cellStr(c) === '')) continue;

    const amount = parseAmount(iAmt >= 0 ? row[iAmt] : 0);
    if (!amount) continue;

    let typeRaw = iType >= 0 ? cellStr(row[iType]) : '';
    const cat = iCat >= 0 ? cellStr(row[iCat]) : '';
    if (!typeRaw && cat) {
      if (/수입|급여|이자/.test(cat)) typeRaw = '수입';
    }
    const isIncome = /수입|income/i.test(typeRaw) || /^\+/.test(cellStr(row[iAmt]));

    let date = iDate >= 0 ? cellStr(row[iDate]) : '';
    if (date && /^\d{1,2}[./]\d{1,2}/.test(date)) {
      const parts = date.split(/[./]/);
      date = `${year}-${String(month).padStart(2, '0')}-${String(parts[1] || parts[0]).padStart(2, '0')}`;
    } else if (!date || !/^\d{4}/.test(date)) {
      date = `${year}-${String(month).padStart(2, '0')}-01`;
    }

    const entry = {
      id: uid(),
      date,
      owner: iOwner >= 0 ? cellStr(row[iOwner]) || '공동' : '공동',
      name: iName >= 0 ? cellStr(row[iName]) : '',
      category: cat || '기타',
      subCategory: iSub >= 0 ? cellStr(row[iSub]) : '',
      amount,
      card: iCard >= 0 ? cellStr(row[iCard]) : '',
      payment: iPay >= 0 ? cellStr(row[iPay]) : '',
      type: cat === '저축성' ? 'saving' : 'consumption',
    };

    if (isIncome) income.push(entry);
    else expenses.push(entry);
  }
  return { income, expenses };
}

function parseAssetSheet(rows, sheetName) {
  const list = [];
  const hr = findHeaderRow(rows);
  const start = hr >= 0 ? hr + 1 : 0;
  const headers = hr >= 0 ? rows[hr].map(cellStr) : [];

  const iName = colIndex(headers, ['이름', '계좌', '상품', '적요']);
  const iInst = colIndex(headers, ['금융', '은행', '기관']);
  const iBal = colIndex(headers, ['잔액', '평가', '금액']);
  const iOwner = colIndex(headers, ['소유', '담당']);

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const balance = parseAmount(iBal >= 0 ? row[iBal] : row[row.length - 1]);
    const name = iName >= 0 ? cellStr(row[iName]) : cellStr(row[0]);
    if (!name && !balance) continue;
    if (/합계|소계|total/i.test(name)) continue;

    list.push({
      id: uid(),
      name: name || sheetName,
      institution: iInst >= 0 ? cellStr(row[iInst]) : '',
      owner: iOwner >= 0 ? cellStr(row[iOwner]) || '공동' : '공동',
      balance,
    });
  }
  return list;
}

function parseBudgetSheet(rows, year) {
  const budget = {};
  for (const row of rows) {
    if (!row || !row.length) continue;
    const cat = cellStr(row[0]);
    if (!cat || /항목|구분|예산/i.test(cat)) continue;
    budget[cat] = {};
    for (let m = 1; m <= 12; m++) {
      const v = parseAmount(row[m]);
      if (v) budget[cat][m] = v;
    }
  }
  return budget;
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
  const data = deepMerge(structuredClone(DEFAULT), { year, months: {}, budget: {}, assets: structuredClone(DEFAULT.assets), liabilities: structuredClone(DEFAULT.liabilities) });

  const stats = { months: 0, income: 0, expenses: 0, assets: 0, sheets: [] };

  for (const sheetName of wb.SheetNames) {
    const rows = sheetToRows(wb.Sheets[sheetName]);
    if (!rows.length) continue;

    const monthM = sheetName.match(MONTH_SHEET);
    if (monthM) {
      const month = parseInt(monthM[1], 10);
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const { income, expenses } = parseMonthSheet(rows, year, month);
      if (income.length || expenses.length) {
        data.months[key] = { carryOver: 0, income, expenses };
        stats.months++;
        stats.income += income.length;
        stats.expenses += expenses.length;
        stats.sheets.push(`${sheetName}: 수입 ${income.length}, 지출 ${expenses.length}`);
      }
      continue;
    }

    if (sheetName.includes('예산')) {
      Object.assign(data.budget, parseBudgetSheet(rows, year));
      stats.sheets.push('예산 시트 반영');
      continue;
    }

    const assetKey = ASSET_SHEETS[sheetName] || ASSET_SHEETS[sheetName.replace(/\s/g, '')];
    if (assetKey) {
      const items = parseAssetSheet(rows, sheetName);
      data.assets[assetKey].push(...items);
      stats.assets += items.length;
      stats.sheets.push(`${sheetName}: ${items.length}건`);
      continue;
    }

    const loanM = sheetName.match(LOAN_SHEET);
    if (loanM) {
      const idx = parseInt(loanM[1], 10) - 1;
      const items = parseAssetSheet(rows, sheetName);
      if (items[0] && data.liabilities.loans[idx]) {
        Object.assign(data.liabilities.loans[idx], {
          lender: items[0].institution,
          balance: items[0].balance,
          name: data.liabilities.loans[idx].name,
        });
        stats.sheets.push(`${sheetName} 반영`);
      }
    }
  }

  return { data, stats };
}

export function saveImportedData(data) {
  data.version = 2;
  localStorage.setItem('sej-ledger-2026', JSON.stringify(data));
}
