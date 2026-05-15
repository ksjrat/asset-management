import { formatWon } from './format.js';
import { escapeHtml } from './ui.js';

const D = 'div';

export function barChartHtml(items, { maxBars = 8 } = {}) {
  const top = items.slice(0, maxBars);
  if (!top.length) return '<p class="empty">차트 데이터 없음</p>';
  const max = Math.max(...top.map(([, v]) => v), 1);
  const parts = ['<' + D + ' class="chart-bars">'];
  for (const [label, value] of top) {
    const pct = (value / max) * 100;
    parts.push('<' + D + ' class="chart-row">');
    parts.push('<span class="chart-label">' + escapeHtml(label) + '</span>');
    parts.push('<' + D + ' class="chart-bar-wrap"><' + D + ' class="chart-bar" style="width:' + pct + '%"></' + D + '></' + D + '>');
    parts.push('<span class="chart-val">' + formatWon(value).replace('원', '') + '</span>');
    parts.push('</' + D + '>');
  }
  parts.push('</' + D + '>');
  return parts.join('');
}

export function lineTrendSvg(trend, { width = 320, height = 120 } = {}) {
  if (!trend.length) return '';
  const pad = 8;
  const vals = trend.flatMap((t) => [t.netIncome, t.totalExpense]);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const range = max - min || 1;
  const step = (width - pad * 2) / (trend.length - 1 || 1);

  const pointLine = (key, color) => {
    const pts = trend.map((t, i) => {
      const x = pad + i * step;
      const y = height - pad - ((t[key] - min) / range) * (height - pad * 2);
      return x + ',' + y;
    });
    return '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + pts.join(' ') + '"/>';
  };

  return (
    '<svg class="trend-chart" viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="' + height + '">' +
    pointLine('netIncome', '#27ae60') +
    pointLine('totalExpense', '#c0392b') +
    '</svg><p class="chart-legend"><span class="dot income"></span>순수입 <span class="dot expense"></span>총지출</p>'
  );
}
