import { uid, defaultTxDate } from './store.js';
import { parseAmount } from './format.js';

/**
 * CSV: date, type(income|expense), category, amount, name, owner, card, subCategory
 */
export function parseTransactionsCsv(text, year, month) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { income: [], expenses: [] };

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1);
  const income = [];
  const expenses = [];

  for (const line of rows) {
    const cols = line.split(',').map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = cols[i] || ''; });

    const type = (row.type || row.구분 || 'expense').toLowerCase();
    const amount = parseAmount(row.amount || row.금액);
    if (!amount) continue;

    const entry = {
      id: uid(),
      date: row.date || row.날짜 || defaultTxDate(year, month),
      name: row.name || row.내용 || '',
      category: row.category || row.항목 || '기타',
      subCategory: row.subcategory || row.세부항목 || '',
      amount,
      owner: row.owner || row.소유 || '공동',
      card: row.card || row.카드 || '',
      payment: row.payment || row.결재 || '',
      type: row.saving === '1' || row.저축성 === '1' ? 'saving' : 'consumption',
    };

    if (type === 'income' || type === '수입') income.push(entry);
    else expenses.push(entry);
  }

  return { income, expenses };
}
