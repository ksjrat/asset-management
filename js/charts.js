import { fmtShort } from './format.js';

const AXIS = {
  left: 52,
  right: 12,
  top: 14,
  bottom: 32,
};

/** Y축 눈금 간격 (1·2·5×10^n) */
function niceStep(span, tickCount = 4) {
  const rough = span / tickCount;
  if (rough <= 0 || !Number.isFinite(rough)) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const frac = rough / base;
  if (frac <= 1) return base;
  if (frac <= 2) return 2 * base;
  if (frac <= 5) return 5 * base;
  return 10 * base;
}

function computeYDomain(vals) {
  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);

  if (dataMin === dataMax) {
    const margin = Math.max(Math.abs(dataMin) * 0.06, 10000);
    const step = niceStep(margin * 2);
    const min = Math.floor((dataMin - margin) / step) * step;
    const max = Math.ceil((dataMax + margin) / step) * step;
    return { min, max, step };
  }

  const span = dataMax - dataMin;
  const pad = Math.max(span * 0.12, Math.abs(dataMax) * 0.002, 10000);
  let min = dataMin - pad;
  let max = dataMax + pad;

  // 부호가 섞인 경우(증감 그래프)만 0 포함
  if (dataMin < 0 && dataMax > 0) {
    min = Math.min(min, -pad);
    max = Math.max(max, pad);
  }

  const step = niceStep(max - min);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  return { min, max, step };
}

function yTicks(min, max, step) {
  const ticks = [];
  for (let t = min; t <= max + step * 0.001; t += step) {
    ticks.push(t);
    if (ticks.length > 8) break;
  }
  return ticks;
}

function plotY(value, min, max, plotTop, plotHeight) {
  return plotTop + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;
}

function plotX(index, count, plotLeft, plotWidth) {
  if (count <= 1) return plotLeft + plotWidth / 2;
  return plotLeft + (index / (count - 1)) * plotWidth;
}

export function lineChart(points, { width = 340, height = 200, color = '#1e4d3a', yMin = null, yMax = null } = {}) {
  if (!points.length) {
    return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#6b7a72" font-size="12">데이터 없음</text>
    </svg>`;
  }

  const vals = points.map((p) => p.value);
  let { min, max, step } = computeYDomain(vals);
  if (yMin != null && Number.isFinite(yMin)) min = Math.min(min, yMin);
  if (yMax != null && Number.isFinite(yMax)) max = Math.max(max, yMax);
  if (min !== max || yMin != null) {
    step = niceStep(max - min);
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
  }
  const plotLeft = AXIS.left;
  const plotTop = AXIS.top;
  const plotWidth = width - AXIS.left - AXIS.right;
  const plotHeight = height - AXIS.top - AXIS.bottom;
  const plotBottom = plotTop + plotHeight;

  const ticks = yTicks(min, max, step);
  const gridLines = ticks.map((t) => {
    const y = plotY(t, min, max, plotTop, plotHeight);
    return `<line x1="${plotLeft}" y1="${y.toFixed(1)}" x2="${width - AXIS.right}" y2="${y.toFixed(1)}"
      stroke="#dde5e0" stroke-width="1"/>`;
  }).join('');

  const yLabels = ticks.map((t) => {
    const y = plotY(t, min, max, plotTop, plotHeight);
    return `<text x="${plotLeft - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end"
      font-size="9" fill="#6b7a72">${fmtShort(t)}</text>`;
  }).join('');

  const zeroLine = min < 0 && max > 0
    ? `<line x1="${plotLeft}" y1="${plotY(0, min, max, plotTop, plotHeight).toFixed(1)}"
        x2="${width - AXIS.right}" y2="${plotY(0, min, max, plotTop, plotHeight).toFixed(1)}"
        stroke="#9aab9f" stroke-width="1" stroke-dasharray="4 3"/>`
    : '';

  const coords = points.map((p, i) => {
    const x = plotX(i, points.length, plotLeft, plotWidth);
    const y = plotY(p.value, min, max, plotTop, plotHeight);
    return { x, y, ...p };
  });

  const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${plotBottom} L${coords[0].x.toFixed(1)},${plotBottom} Z`;

  const xStep = points.length > 8 ? 2 : 1;
  const xLabels = coords.map((c, i) => {
    if (i % xStep !== 0 && i !== points.length - 1) return '';
    return `<text x="${c.x.toFixed(1)}" y="${height - 8}" text-anchor="middle"
      font-size="9" fill="#6b7a72">${c.label}</text>`;
  }).join('');

  const dots = coords.map((c) =>
    `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>`,
  ).join('');

  const axes = `
    <line x1="${plotLeft}" y1="${plotTop}" x2="${plotLeft}" y2="${plotBottom}" stroke="#b8c4bc" stroke-width="1"/>
    <line x1="${plotLeft}" y1="${plotBottom}" x2="${width - AXIS.right}" y2="${plotBottom}" stroke="#b8c4bc" stroke-width="1"/>
  `;

  return `<svg class="chart-svg chart-svg--axis" viewBox="0 0 ${width} ${height}" role="img" aria-label="추이 그래프">
    <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${gridLines}
    ${zeroLine}
    ${axes}
    ${yLabels}
    ${xLabels}
    <path d="${area}" fill="url(#chartGrad)"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

export function barChart(items, { width = 320, height = 120, color = '#1e4d3a' } = {}) {
  if (!items.length) return '';
  const max = Math.max(...items.map((i) => i.value), 1);
  const barW = (width - 24) / items.length - 6;
  const bars = items.map((item, i) => {
    const h = (item.value / max) * (height - 30);
    const x = 12 + i * (barW + 6);
    const y = height - 20 - h;
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${item.color || color}" opacity="${item.highlight ? 1 : 0.7}"/>
      <text x="${x + barW/2}" y="${height - 4}" text-anchor="middle" font-size="9" fill="#6b7a72">${item.label.slice(0,4)}</text>
    </g>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}">${bars}</svg>`;
}

export function progressRing(pct, { size = 88, stroke = 8, color = '#1e4d3a' } = {}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 1));
  return `<svg class="progress-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#dde5e0" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"
      transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="${size/2}" y="${size/2 + 5}" text-anchor="middle" font-size="16" font-weight="700" fill="${color}">${Math.round(pct*100)}%</text>
  </svg>`;
}

export function budgetBar(used, budget, color) {
  const pct = budget > 0 ? Math.min(used / budget, 1.2) : 0;
  const warn = pct >= 0.8;
  const over = pct >= 1;
  return `<div class="budget-bar-wrap">
    <div class="budget-bar ${over ? 'over' : warn ? 'warn' : ''}" style="width:${Math.min(pct*100,100)}%;background:${over?'var(--danger)':warn?'var(--accent)':color}"></div>
  </div>`;
}

export function legend(items) {
  return `<div class="chart-legend">${items.map((i) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}: ${fmtShort(i.value)}</span>`
  ).join('')}</div>`;
}
