import { state, persist, setMonth } from '../state.js';
import { addCategory, getVisibleCategories, getOwnerDisplayLabel, OWNERS } from '../store.js';
import {
  setMonthlyPlanAmount, getMonthlyPlanAmount, setBudgetStart, getBudgetStart,
  getVisibleSavingsItems, getSavingsMonthlyPlanAmount, setSavingsMonthlyPlanAmount,
  syncSavingsEnvelopeMonthlyPlan,
} from '../budget-engine.js';
import { esc, toast, bindAmountPreviewsIn } from '../ui.js';
import { fmtMoney, fmtMonth } from '../format.js';

const STEPS = [
  { n: 1, title: '항목 설정', desc: '관리할 지출 항목을 만드세요' },
  { n: 2, title: '월간 예산', desc: '항목별 매월 예산 (언제든 수정 가능)' },
  { n: 3, title: '시작 월', desc: '가계부 관리를 시작할 달' },
  { n: 4, title: '실적 입력일', desc: '매달 실제 사용액을 입력할 날짜' },
];

function stepHeader(step) {
  const cur = STEPS.find((s) => s.n === step);
  const pct = Math.round((step / STEPS.length) * 100);
  return `
    <div class="setup-progress" aria-hidden="true">
      <div class="step-bar"><div class="step-fill" style="width:${pct}%"></div></div>
      <p class="setup-step-label">단계 ${step} / ${STEPS.length}</p>
      <h1>${cur?.title}</h1>
      <p class="muted">${cur?.desc}</p>
    </div>`;
}

function payerOpts(cat) {
  return OWNERS.map((o) =>
    `<option value="${o.id}" ${(cat.payer || 'joint') === o.id ? 'selected' : ''}>${esc(getOwnerDisplayLabel(state.data, o.id))}</option>`).join('');
}

function renderStep1() {
  const cats = getVisibleCategories(state.data);
  const list = cats.map((c) => `
    <div class="setup-item-row setup-item-row--payer">
      <span class="setup-item-name">${esc(c.name)}</span>
      <div class="setup-item-actions">
        <select class="input input-sm setup-item-payer" name="payer-${c.id}" data-cat-payer="${c.id}">${payerOpts(c)}</select>
        <button type="button" class="text-btn danger-text setup-item-delete" data-remove-cat="${c.id}">삭제</button>
      </div>
    </div>`).join('');
  return `
    ${stepHeader(1)}
    <div class="setup-list">${list || '<p class="muted setup-empty">아직 항목이 없습니다</p>'}</div>
    <form id="setup-add-cat" class="setup-add-form">
      <input class="input" name="name" placeholder="예: 식비, 주거, 교통" required />
      <button type="submit" class="btn btn-primary">추가</button>
    </form>
    <p class="field-hint">카테고리마다 누가 부담하는지(본인/배우자/공동) 지정할 수 있습니다.</p>`;
}

function renderStep2() {
  const y = new Date().getFullYear();
  const cats = getVisibleCategories(state.data);
  const savingsItems = getVisibleSavingsItems(state.data);
  const rows = cats.map((c) => {
    if (c.name === '저축' && savingsItems.length) {
      const subRows = savingsItems.map((item) => {
        const monthly = getSavingsMonthlyPlanAmount(state.data, y, item.id);
        return `<label class="setup-budget-row setup-budget-row--sub">
          <span class="setup-budget-name">${esc(item.name)}</span>
          <div class="setup-budget-inputs">
            <input class="input input-amount" name="sav-${item.id}" type="number" min="0" step="10000" value="${monthly || ''}" placeholder="월간" />
          </div>
        </label>`;
      }).join('');
      return `<div class="setup-savings-group">
        <p class="field-label">${esc(c.name)} (세부 항목)</p>
        ${subRows}
      </div>`;
    }
    const monthly = getMonthlyPlanAmount(state.data, y, c.id);
    return `
      <label class="setup-budget-row">
        <span class="setup-budget-name">${esc(c.name)}</span>
        <div class="setup-budget-inputs">
          <input class="input input-amount" name="${c.id}" type="number" min="0" step="10000" value="${monthly || ''}" placeholder="월간" />
          <span class="setup-budget-monthly">연 ${fmtMoney(monthly * 12)}</span>
        </div>
      </label>`;
  }).join('');
  return `
    ${stepHeader(2)}
    <p class="field-hint">${y}년 기준 · 저축은 세부 항목별로 나눠 입력할 수 있습니다.</p>
    <form id="setup-monthly-form" class="form-stack">${rows}</form>`;
}

function renderStep3() {
  const now = new Date();
  const start = getBudgetStart(state.data) || { year: now.getFullYear(), month: now.getMonth() + 1 };
  const years = [start.year - 1, start.year, start.year + 1];
  const yearOpts = years.map((y) =>
    `<option value="${y}" ${y === start.year ? 'selected' : ''}>${y}년</option>`).join('');
  const monthOpts = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return `<option value="${m}" ${m === start.month ? 'selected' : ''}>${m}월</option>`;
  }).join('');
  return `
    ${stepHeader(3)}
    <form id="setup-start-form" class="form-stack">
      <label class="field">
        <span class="field-label">가계부 시작 월</span>
        <div class="setup-start-row">
          <select class="input" name="startYear">${yearOpts}</select>
          <select class="input" name="startMonth">${monthOpts}</select>
        </div>
      </label>
      <p class="field-hint"><strong>${fmtMonth(start.year, start.month)}</strong>부터 예산·이월을 관리합니다. 그 이전 달(예: 1~4월)은 이월되지 않습니다.</p>
    </form>`;
}

function renderStep4() {
  const day = state.data.budget.defaultRecordDay ?? 25;
  const start = getBudgetStart(state.data);
  const cats = getVisibleCategories(state.data);
  const preview = cats.slice(0, 3).map((c) => esc(c.name)).join(', ');
  return `
    ${stepHeader(4)}
    <form id="setup-record-form" class="form-stack">
      <label class="field">
        <span class="field-label">매달 실적 입력일 (1~28일)</span>
        <input class="input input-lg" name="recordDay" type="number" min="1" max="28" value="${day}" required />
      </label>
      <p class="field-hint">설정한 날짜가 되면 <strong>${preview}${cats.length > 3 ? '…' : ''}</strong> 등 항목별 실제 사용 금액을 입력할 수 있습니다.</p>
      ${start ? `<p class="field-hint">관리 시작: <strong>${fmtMonth(start.year, start.month)}</strong></p>` : ''}
      <div class="setup-info-card">
        <h3>이후 흐름</h3>
        <ol class="setup-flow-list">
          <li>정산일 이후 → 항목별 <strong>실제 사용액</strong> 입력</li>
          <li>월간 예산과 비교 → 초과·절약 확인</li>
          <li>남은 금액 → <strong>다음 달로 이월</strong> (시작 월 이후만)</li>
        </ol>
      </div>
    </form>`;
}

export function renderSetup() {
  const step = state.setupStep;
  let body = '';
  if (step === 1) body = renderStep1();
  else if (step === 2) body = renderStep2();
  else if (step === 3) body = renderStep3();
  else body = renderStep4();

  const nextLabel = step === 4 ? '시작하기' : '다음';
  return `
    <div class="setup-screen">
      ${body}
      <div class="setup-actions">
        ${step > 1 ? '<button type="button" class="btn btn-ghost" id="setup-prev">이전</button>' : '<span></span>'}
        <button type="button" class="btn btn-primary" id="setup-next">${nextLabel}</button>
      </div>
    </div>`;
}

export function bindSetup() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  const y = new Date().getFullYear();

  document.getElementById('setup-add-cat')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name')?.toString().trim();
    if (!name) return;
    addCategory(state.data, name);
    persist();
    toast('항목이 추가되었습니다', 'success');
    rerender();
  });

  document.querySelectorAll('[data-remove-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = state.data.budget.categories.find((c) => c.id === btn.dataset.removeCat);
      if (cat) cat.hidden = true;
      persist();
      rerender();
    });
  });

  const monthlyForm = document.getElementById('setup-monthly-form');
  bindAmountPreviewsIn(monthlyForm);
  monthlyForm?.querySelectorAll('.input-amount').forEach((input) => {
    input.addEventListener('input', () => {
      const row = input.closest('.setup-budget-row');
      const hint = row?.querySelector('.setup-budget-monthly');
      if (hint) hint.textContent = `연 ${fmtMoney((Number(input.value) || 0) * 12)}`;
    });
  });

  document.getElementById('setup-prev')?.addEventListener('click', () => {
    state.setupStep = Math.max(1, state.setupStep - 1);
    rerender();
  });

  document.getElementById('setup-next')?.addEventListener('click', () => {
    const cats = getVisibleCategories(state.data);
    if (state.setupStep === 1) {
      if (!cats.length) {
        toast('항목을 1개 이상 추가해 주세요', 'error');
        return;
      }
      document.querySelectorAll('[data-cat-payer]').forEach((sel) => {
        const cat = state.data.budget.categories.find((c) => c.id === sel.dataset.catPayer);
        if (cat) cat.payer = sel.value || 'joint';
      });
      persist();
      state.setupStep = 2;
      rerender();
      return;
    }
    if (state.setupStep === 2) {
      const form = document.getElementById('setup-monthly-form');
      const savingsItems = getVisibleSavingsItems(state.data);
      if (form) {
        const fd = new FormData(form);
        for (const c of cats) {
          if (c.name === '저축' && savingsItems.length) {
            for (const item of savingsItems) {
              setSavingsMonthlyPlanAmount(state.data, y, item.id, Number(fd.get(`sav-${item.id}`)) || 0);
            }
          } else {
            setMonthlyPlanAmount(state.data, y, c.id, Number(fd.get(c.id)) || 0);
          }
        }
        syncSavingsEnvelopeMonthlyPlan(state.data, y);
      }
      const hasAny = cats.some((c) => getMonthlyPlanAmount(state.data, y, c.id) > 0);
      if (!hasAny) {
        toast('월간 예산을 1개 이상 입력해 주세요', 'error');
        return;
      }
      state.setupStep = 3;
      rerender();
      return;
    }
    if (state.setupStep === 3) {
      const form = document.getElementById('setup-start-form');
      if (form) {
        const fd = new FormData(form);
        const sy = Number(fd.get('startYear'));
        const sm = Number(fd.get('startMonth'));
        if (!sy || !sm) {
          toast('시작 월을 선택해 주세요', 'error');
          return;
        }
        setBudgetStart(state.data, sy, sm);
        persist();
      }
      state.setupStep = 4;
      rerender();
      return;
    }
    if (state.setupStep === 4) {
      const form = document.getElementById('setup-record-form');
      const day = Number(new FormData(form).get('recordDay')) || 25;
      state.data.budget.defaultRecordDay = Math.min(28, Math.max(1, day));
      if (!getBudgetStart(state.data)) {
        const now = new Date();
        setBudgetStart(state.data, now.getFullYear(), now.getMonth() + 1);
      }
      state.data.budget.setupDone = true;
      state.setupStep = 1;
      persist();
      toast('예산 설정이 완료되었습니다', 'success');
      state.tab = 'expense';
      setMonth(state.data.budget.startYear, state.data.budget.startMonth);
      rerender();
    }
  });
}
