import { fmtShort } from './format.js';

export function lineChart(points, { width = 320, height = 140, color = '#1e4d3a' } = {}) {
  if (!points.length) {
    return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <text x="${width/2}" y="${height/2}" text-anchor="middle" fill="#6b7a72" font-size="12">데이터 없음</text>
    </svg>`;
  }
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = 12;
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((p.value - min) / range) * (height - pad * 2);
    return { x, y, ...p };
  });
  const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${path} L${coords[coords.length-1].x},${height-pad} L${coords[0].x},${height-pad} Z`;
  const dots = coords.map((c) =>
    `<circle cx="${c.x}" cy="${c.y}" r="4" fill="${color}" data-label="${c.label}"/>`
  ).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="추이 그래프">
    <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#chartGrad)"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
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
