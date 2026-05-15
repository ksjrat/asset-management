import { state, persist } from '../state.js';
import { addCategory, getVisibleCategories } from '../store.js';
import { setAnnualAmount } from '../budget-engine.js';
import { esc, toast } from '../ui.js';
import { fmtMoney } from '../format.js';

const STEPS = [
  { n: 1, title: '항목 설정', desc: '관리할 지출 항목을 만드세요' },
  { n: 2, title: '연간 예산', desc: '항목별 1년 예산 (언제든 수정 가능)' },
  { n: 3, title: '실적 입력일', desc: '매달 실제 사용액을 입력할 날짜' },
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

function renderStep1() {
  const cats = getVisibleCategories(state.data);
  const list = cats.map((c) => `
    <div class="setup-item-row">
      <span>${esc(c.name)}</span>
      <button type="button" class="text-btn danger-text" data-remove-cat="${c.id}">삭제</button>
    </div>`).join('');
  return `
    ${stepHeader(1)}
    <div class="setup-list">${list || '<p class="muted setup-empty">아직 항목이 없습니다</p>'}</div>
    <form id="setup-add-cat" class="setup-add-form">
      <input class="input" name="name" placeholder="예: 식비, 주거, 교통" required />
      <button type="submit" class="btn btn-primary">추가</button>
    </form>
    <p class="field-hint">토스·가계부처럼 쓰실 카테고리를 자유롭게 추가하세요.</p>`;
}

function renderStep2() {
  const y = new Date().getFullYear();
  const cats = getVisibleCategories(state.data);
  const rows = cats.map((c) => {
    const annual = state.data.budget.annual[String(y)]?.[c.id] ?? 0;
    const monthly = Math.round(annual / 12);
    return `
      <label class="setup-budget-row">
        <span class="setup-budget-name">${esc(c.name)}</span>
        <div class="setup-budget-inputs">
          <input class="input" name="${c.id}" type="number" min="0" step="10000" value="${annual || ''}" placeholder="연간" />
          <span class="setup-budget-monthly">월 ${fmtMoney(monthly)}</span>
        </div>
      </label>`;
  }).join('');
  return `
    ${stepHeader(2)}
    <p class="field-hint">${y}년 기준 · 월 환산은 자동 계산됩니다.</p>
    <form id="setup-annual-form" class="form-stack">${rows}</form>`;
}

function renderStep3() {
  const day = state.data.budget.defaultRecordDay ?? 25;
  const cats = getVisibleCategories(state.data);
  const preview = cats.slice(0, 3).map((c) => esc(c.name)).join(', ');
  return `
    ${stepHeader(3)}
    <form id="setup-record-form" class="form-stack">
      <label class="field">
        <span class="field-label">매달 실적 입력일 (1~28일)</span>
        <input class="input input-lg" name="recordDay" type="number" min="1" max="28" value="${day}" required />
      </label>
      <p class="field-hint">설정한 날짜가 되면 <strong>${preview}${cats.length > 3 ? '…' : ''}</strong> 등 항목별 실제 사용 금액을 입력할 수 있습니다.</p>
      <div class="setup-info-card">
        <h3>이후 흐름</h3>
        <ol class="setup-flow-list">
          <li>정산일 이후 → 항목별 <strong>실제 사용액</strong> 입력</li>
          <li>예산과 비교 → 초과·절약 확인</li>
          <li>남은 금액 → <strong>다음 달로 이월</strong></li>
        </ol>
      </div>
    </form>`;
}

export function renderSetup() {
  const step = state.setupStep;
  let body = '';
  if (step === 1) body = renderStep1();
  else if (step === 2) body = renderStep2();
  else body = renderStep3();

  const nextLabel = step === 3 ? '시작하기' : '다음';
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

  document.querySelectorAll('#setup-annual-form input').forEach((input) => {
    input.addEventListener('input', () => {
      const row = input.closest('.setup-budget-row');
      const hint = row?.querySelector('.setup-budget-monthly');
      if (hint) hint.textContent = `월 ${fmtMoney(Math.round((Number(input.value) || 0) / 12))}`;
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
      state.setupStep = 2;
      rerender();
      return;
    }
    if (state.setupStep === 2) {
      const form = document.getElementById('setup-annual-form');
      if (form) {
        const fd = new FormData(form);
        for (const c of cats) {
          setAnnualAmount(state.data, y, c.id, Number(fd.get(c.id)) || 0);
        }
      }
      const hasAny = cats.some((c) => (state.data.budget.annual[String(y)]?.[c.id] || 0) > 0);
      if (!hasAny) {
        toast('연간 예산을 1개 이상 입력해 주세요', 'error');
        return;
      }
      state.setupStep = 3;
      rerender();
      return;
    }
    if (state.setupStep === 3) {
      const form = document.getElementById('setup-record-form');
      const day = Number(new FormData(form).get('recordDay')) || 25;
      state.data.budget.defaultRecordDay = Math.min(28, Math.max(1, day));
      state.data.budget.setupDone = true;
      state.setupStep = 1;
      persist();
      toast('예산 설정이 완료되었습니다', 'success');
      state.tab = 'budget';
      rerender();
    }
  });
}
