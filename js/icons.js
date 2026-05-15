/** SF Symbols–style line icons (thin stroke, round caps) */

const S = 'class="sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

export const TAB_SVG = {
  dashboard: `<svg ${S}><path d="M5 11.5 12 5.5l7 6V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.5Z"/><path d="M10 20v-6h4v6"/></svg>`,
  goals: `<svg ${S}><circle cx="12" cy="12" r="7.25"/><circle cx="12" cy="12" r="2.25"/></svg>`,
  budget: `<svg ${S}><rect x="4" y="7" width="16" height="12" rx="2.25"/><path d="M4 11h16"/><path d="M8.5 15.5h3"/></svg>`,
  reports: `<svg ${S}><path d="M7 19V11M12 19V5M17 19v-5"/></svg>`,
  settings: `<svg ${S}><circle cx="12" cy="12" r="2.25"/><path d="M12 4.5v1.75M12 17.75V19.5M5.56 5.56l1.24 1.24M17.2 17.2l1.24 1.24M4.5 12h1.75M17.75 12H19.5M5.56 18.44l1.24-1.24M17.2 6.8l1.24-1.24"/></svg>`,
};

export const ASSET_SVG = {
  cash: `<svg ${S}><rect x="5" y="7" width="14" height="10" rx="1.5"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>`,
  deposit: `<svg ${S}><path d="M5 10h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9Z"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
  savings: `<svg ${S}><path d="M12 4v2M6.5 9.5 12 14l5.5-4.5"/><path d="M6 14v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5"/></svg>`,
  invest: `<svg ${S}><path d="M5 17V12l4-3 4 4 5-6 1 1.5"/></svg>`,
  realestate: `<svg ${S}><path d="M5 11.5 12 5l7 6.5V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.5Z"/><path d="M10 20v-5h4v5"/></svg>`,
  loan: `<svg ${S}><path d="M7 8h10M7 12h7M7 16h4"/><rect x="4" y="5" width="16" height="14" rx="2"/></svg>`,
  card: `<svg ${S}><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M4 10h16"/></svg>`,
};

export function assetIcon(typeId, group = 'asset') {
  return ASSET_SVG[typeId]
    || (group === 'liability'
      ? `<svg ${S}><path d="M7 7l10 10M17 7 7 17"/></svg>`
      : `<svg ${S}><circle cx="12" cy="12" r="7"/></svg>`);
}
