import { state, persist } from '../state.js';
import {
  ASSET_TYPES, OWNERS, GOAL_TEMPLATES, getVisibleCategories,
  calcMonthlyContribution, monthsBetween, computeGoalProgress,
  addCategory,
} from '../store.js';
import {
  getMonthlyPlanAmount, setMonthlyPlanAmount,
  getActualAmount, setActualAmount, getCategoryPeriodSummary, getRecordDay,
  getBudgetStart, setBudgetStart,
} from '../budget-engine.js';
import { fmtMonth, fmtMoney, todayISO, uid } from '../format.js';
import { openModal, toast, formField, esc, modalValue, modalForm } from '../ui.js';
import { validateGoalInput, projectGoalImpact, parseTags } from '../validators.js';

function bindGoalImpactPreview(form, current = 0) {
  const impactEl = form.querySelector('#goal-impact');
  if (!impactEl) return;
  const update = () => {
    const target = Number(form.targetAmount?.value) || 0;
    const monthly = Number(form.monthlyContribution?.value) || 0;
    const end = form.endDate?.value;
    const r = projectGoalImpact(target, current, monthly, end);
    impactEl.textContent = r.text;
    impactEl.className = `goal-impact field-hint ${r.warn ? 'warn' : ''}`;
  };
  ['targetAmount', 'monthlyContribution', 'endDate'].forEach((n) => {
    form[n]?.addEventListener('input', update);
  });
  form.mode?.addEventListener('change', () => {
    const mode = form.mode.value;
    const target = Number(form.targetAmount.value) || 0;
    const months = monthsBetween(form.startDate.value, form.endDate.value);
    if (mode !== 'custom' && months > 0) {
      form.monthlyContribution.value = calcMonthlyContribution(target, months, mode);
    }
    form.monthlyContribution.readOnly = mode !== 'custom';
    update();
  });
  update();
}

export async function showAssetForm(item, rerender) {
  const typeOpts = ASSET_TYPES.map((t) =>
    `<option value="${t.id}" ${item?.type === t.id ? 'selected' : ''}>${t.label}</option>`).join('');
  const ownerOpts = OWNERS.map((o) =>
    `<option value="${o.id}" ${item?.owner === o.id ? 'selected' : ''}>${o.label}</option>`).join('');
  const res = await openModal({
    title: item ? '항목 수정' : '자산/부채 등록',
    body: `<form id="asset-form" class="form-stack">
      ${formField('유형', `<select name="type" class="input">${typeOpts}</select>`)}
      ${formField('이름', `<input class="input" name="name" required value="${esc(item?.name || '')}" />`)}
      ${formField('금액', `<input class="input" name="amount" type="number" required min="0" value="${item?.amount ?? ''}" />`)}
      ${formField('소유', `<select name="owner" class="input">${ownerOpts}</select>`)}
      <label class="toggle-row"><span>배우자에게 비공개</span>
        <input type="checkbox" name="private" ${item?.private ? 'checked' : ''} /></label>
    </form>`,
    actions: [
      ...(item ? [{ label: '삭제', value: 'delete', danger: true }] : []),
      { label: '취소', value: null },
      { label: '저장', value: 'save', primary: true },
    ],
  });
  const action = modalValue(res);
  if (!action) return;
  if (action === 'delete' && item) {
    state.data.assets.items = state.data.assets.items.filter((i) => i.id !== item.id);
    persist(); toast('삭제되었습니다'); rerender(); return;
  }
  if (action !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  const payload = {
    type: fd.get('type'), name: fd.get('name'),
    amount: Number(fd.get('amount')), owner: fd.get('owner'),
    private: !!fd.get('private'), updatedAt: new Date().toISOString(),
  };
  if (item) {
    Object.assign(item, payload);
    item.history = item.history || [];
    item.history.push({ amount: payload.amount, at: payload.updatedAt });
  } else {
    state.data.assets.items.push({
      id: uid(), ...payload,
      history: [{ amount: payload.amount, at: payload.updatedAt }],
    });
  }
  persist(); toast('저장되었습니다', 'success'); rerender();
}

export async function showGoalForm(rerender) {
  const tplBtns = GOAL_TEMPLATES.map((t) =>
    `<button type="button" class="tpl-btn" data-tpl="${t.id}">${t.icon} ${t.label}</button>`).join('');
  const res = await openModal({
    title: '목표 생성',
    body: `<div class="tpl-grid" id="tpl-grid">${tplBtns}</div>
      <form id="goal-form" class="form-stack hidden">
        <input type="hidden" name="template" />
        ${formField('목표명', '<input class="input" name="title" required />')}
        ${formField('목표 금액', '<input class="input" name="targetAmount" type="number" required min="1" />')}
        ${formField('시작일', `<input class="input" name="startDate" type="date" value="${todayISO()}" required />`)}
        ${formField('목표일', '<input class="input" name="endDate" type="date" required />')}
        ${formField('월 기여 방식', `<select name="mode" class="input">
          <option value="equal">월별 균등</option>
          <option value="accelerating">후반 가속</option>
          <option value="custom">직접 입력</option></select>`)}
        ${formField('월 기여금', '<input class="input" name="monthlyContribution" type="number" min="0" />')}
        <p id="goal-impact" class="goal-impact field-hint"></p>
      </form>`,
    actions: [{ label: '취소', value: null }, { label: '제안하기', value: 'save', primary: true }],
    onOpen: (sheet) => {
      sheet.querySelectorAll('[data-tpl]').forEach((tpl) => {
        tpl.addEventListener('click', () => {
          const t = GOAL_TEMPLATES.find((x) => x.id === tpl.dataset.tpl);
          const form = sheet.querySelector('#goal-form');
          if (!form || !t) return;
          form.classList.remove('hidden');
          form.template.value = t.id;
          form.title.value = t.id === 'custom' ? '' : t.label;
          form.targetAmount.value = t.defaultAmount;
          const end = new Date();
          end.setMonth(end.getMonth() + t.defaultMonths);
          form.endDate.value = end.toISOString().slice(0, 10);
          form.monthlyContribution.value = calcMonthlyContribution(t.defaultAmount, t.defaultMonths, 'equal');
          bindGoalImpactPreview(form);
        });
      });
    },
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  const target = Number(fd.get('targetAmount'));
  const errors = validateGoalInput({
    title: fd.get('title'), targetAmount: target,
    startDate: fd.get('startDate'), endDate: fd.get('endDate'),
  });
  if (errors.length) { toast(errors[0], 'error'); return showGoalForm(rerender); }
  const months = monthsBetween(fd.get('startDate'), fd.get('endDate'));
  const mode = fd.get('mode') || 'equal';
  state.data.goals.push({
    id: uid(), title: fd.get('title'), template: fd.get('template') || 'custom',
    targetAmount: target, currentAmount: 0,
    startDate: fd.get('startDate'), endDate: fd.get('endDate'),
    status: state.data.auth.spouseConnected ? 'proposed' : 'active',
    monthlyContribution: Number(fd.get('monthlyContribution')) || calcMonthlyContribution(target, months, mode),
    contributionMode: mode,
    milestones: [25, 50, 75].map((p) => ({ percent: p, reached: false })),
    contributions: [], proposedBy: 'self', approvedBy: null,
    history: [{ at: new Date().toISOString(), text: '목표 생성' }],
    createdAt: new Date().toISOString(),
  });
  persist();
  toast(state.data.auth.spouseConnected ? '배우자에게 제안되었습니다' : '목표가 생성되었습니다', 'success');
  rerender();
}

export function bindGoalTemplatePicker() {}

export async function showGoalEditForm(goal, rerender) {
  const { current } = computeGoalProgress(goal);
  const res = await openModal({
    title: '목표 수정',
    body: `<form id="goal-edit-form" class="form-stack">
      ${formField('목표명', `<input class="input" name="title" required value="${esc(goal.title)}" />`)}
      ${formField('목표 금액', `<input class="input" name="targetAmount" type="number" required min="1" value="${goal.targetAmount}" />`)}
      ${formField('시작일', `<input class="input" name="startDate" type="date" value="${goal.startDate}" required />`)}
      ${formField('목표일', `<input class="input" name="endDate" type="date" value="${goal.endDate}" required />`)}
      ${formField('상태', `<select name="status" class="input">
        <option value="active" ${goal.status === 'active' ? 'selected' : ''}>진행</option>
        <option value="achieved" ${goal.status === 'achieved' ? 'selected' : ''}>달성</option>
        <option value="paused" ${goal.status === 'paused' ? 'selected' : ''}>보류</option>
        <option value="proposed" ${goal.status === 'proposed' ? 'selected' : ''}>제안됨</option>
      </select>`)}
      ${formField('월 기여금', `<input class="input" name="monthlyContribution" type="number" min="0" value="${goal.monthlyContribution}" />`)}
      <p id="goal-impact" class="goal-impact field-hint"></p>
      ${formField('마일스톤 (%)', `<input class="input" name="milestones" placeholder="25, 50, 75" value="${(goal.milestones || []).map((m) => m.percent).join(', ')}" />`, '쉼표로 구분')}
    </form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
    onOpen: (sheet) => bindGoalImpactPreview(sheet.querySelector('#goal-edit-form'), current),
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  const errors = validateGoalInput({
    title: fd.get('title'), targetAmount: Number(fd.get('targetAmount')),
    startDate: fd.get('startDate'), endDate: fd.get('endDate'),
  });
  if (errors.length) { toast(errors[0], 'error'); return; }
  const monthly = Number(fd.get('monthlyContribution'));
  const impact = projectGoalImpact(Number(fd.get('targetAmount')), current, monthly, fd.get('endDate'));
  goal.title = fd.get('title');
  goal.targetAmount = Number(fd.get('targetAmount'));
  goal.startDate = fd.get('startDate');
  goal.endDate = fd.get('endDate');
  goal.status = fd.get('status');
  goal.monthlyContribution = monthly;
  const ms = fd.get('milestones')?.toString().split(/[,，\s]+/).map(Number).filter((n) => n > 0 && n < 100);
  if (ms?.length) {
    const { rate } = computeGoalProgress(goal);
    goal.milestones = ms.map((p) => ({ percent: p, reached: rate * 100 >= p }));
  }
  goal.history = goal.history || [];
  goal.history.push({ at: new Date().toISOString(), text: `목표 수정 · ${impact.text}` });
  persist();
  toast('저장되었습니다', 'success');
  rerender();
}

export async function showTxForm(type, item, rerender) {
  const cats = getVisibleCategories(state.data);
  const catOpts = cats.map((c) =>
    `<option value="${c.id}" ${item?.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  const res = await openModal({
    title: item ? '거래 수정' : (type === 'income' ? '수입 입력' : '지출 입력'),
    body: `<form id="tx-form" class="form-stack">
      <input type="hidden" name="type" value="${type}" />
      ${formField('날짜', `<input class="input" name="date" type="date" value="${item?.date || todayISO()}" required />`)}
      ${formField('금액', `<input class="input" name="amount" type="number" required min="1" value="${item?.amount ?? ''}" />`)}
      ${formField('카테고리', `<select name="categoryId" class="input">${catOpts}</select>`)}
      ${formField('결제수단', `<select name="paymentMethod" class="input">
        <option value="현금" ${item?.paymentMethod === '현금' ? 'selected' : ''}>현금</option>
        <option value="카드" ${item?.paymentMethod === '카드' ? 'selected' : ''}>카드</option>
        <option value="이체" ${item?.paymentMethod === '이체' ? 'selected' : ''}>이체</option></select>`)}
      ${formField('메모', `<input class="input" name="memo" value="${esc(item?.memo || '')}" />`)}
      ${formField('태그', `<input class="input" name="tags" placeholder="외식, 데이트" value="${esc((item?.tags || []).join(', '))}" />`)}
      <label class="toggle-row"><span>공동 지출로 표시</span>
        <input type="checkbox" name="shared" ${item?.shared !== false ? 'checked' : ''} /></label>
    </form>`,
    actions: [
      ...(item ? [{ label: '삭제', value: 'delete', danger: true }] : []),
      { label: '취소', value: null }, { label: '저장', value: 'save', primary: true },
    ],
  });
  const action = modalValue(res);
  if (!action) return;
  if (action === 'delete' && item) {
    state.data.transactions = state.data.transactions.filter((t) => t.id !== item.id);
    persist(); rerender(); return;
  }
  if (action !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  const payload = {
    date: fd.get('date'), amount: Number(fd.get('amount')), type: fd.get('type'),
    categoryId: fd.get('categoryId'), paymentMethod: fd.get('paymentMethod'),
    memo: fd.get('memo'), tags: parseTags(fd.get('tags')),
    shared: !!fd.get('shared'), createdBy: item?.createdBy || 'self',
  };
  if (item) Object.assign(item, payload);
  else state.data.transactions.push({ id: uid(), ...payload });
  persist(); toast('저장되었습니다', 'success'); rerender();
}

export async function showBudgetStartForm(rerender) {
  const now = new Date();
  const start = getBudgetStart(state.data) || { year: now.getFullYear(), month: now.getMonth() + 1 };
  const years = [start.year - 1, start.year, start.year + 1];
  const yearOpts = years.map((y) =>
    `<option value="${y}" ${y === start.year ? 'selected' : ''}>${y}년</option>`).join('');
  const monthOpts = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return `<option value="${m}" ${m === start.month ? 'selected' : ''}>${m}월</option>`;
  }).join('');
  const res = await openModal({
    title: '가계부 시작 월',
    body: `<form id="budget-start-form" class="form-stack">
      <p class="field-hint">이 달부터 예산·이월을 관리합니다. 그 이전 달은 이월되지 않습니다.</p>
      <label class="field">
        <span class="field-label">시작 월</span>
        <div class="setup-start-row">
          <select class="input" name="startYear">${yearOpts}</select>
          <select class="input" name="startMonth">${monthOpts}</select>
        </div>
      </label>
    </form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  const sy = Number(fd.get('startYear'));
  const sm = Number(fd.get('startMonth'));
  if (!sy || !sm) return;
  setBudgetStart(state.data, sy, sm);
  persist();
  toast(`${fmtMonth(sy, sm)}부터 관리합니다`, 'success');
  rerender();
}

export async function showMonthlyBudgetForm(year, rerender) {
  const cats = getVisibleCategories(state.data);
  const fields = cats.map((c) => {
    const monthly = getMonthlyPlanAmount(state.data, year, c.id);
    return formField(
      `${c.name} (월)`,
      `<input class="input" name="${c.id}" type="number" min="0" step="10000" value="${monthly || ''}" />
       <span class="field-hint">연 ${fmtMoney(monthly * 12)}</span>`,
    );
  }).join('');
  const res = await openModal({
    title: `${year}년 월간 예산`,
    body: `<form id="monthly-plan-form" class="form-stack"><p class="field-hint">항목별 매월 예산 · 언제든 수정할 수 있습니다.</p>${fields}</form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  for (const c of cats) setMonthlyPlanAmount(state.data, year, c.id, Number(fd.get(c.id)) || 0);
  persist();
  toast('월간 예산이 저장되었습니다', 'success');
  rerender();
}

export async function showActualForm(catId, year, month, rerender) {
  const cat = state.data.budget.categories.find((c) => c.id === catId);
  if (!cat) return;
  const s = getCategoryPeriodSummary(state.data, year, month, catId);
  const current = getActualAmount(state.data, year, month, catId);
  const res = await openModal({
    title: `${fmtMonth(year, month)} · ${cat.name} 실적`,
    body: `<form id="actual-form" class="form-stack">
      <p class="field-hint">사용 가능 ${fmtMoney(s.available)} (월 예산 ${fmtMoney(s.monthlyPlanned)} + 이월 ${fmtMoney(s.rolloverIn)})</p>
      ${formField('실제 사용 금액', `<input class="input" name="amount" type="number" min="0" required value="${current ?? ''}" />`)}
      ${formField('메모', '<input class="input" name="memo" />')}
    </form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  setActualAmount(state.data, year, month, catId, Number(fd.get('amount')) || 0);
  persist();
  const after = getCategoryPeriodSummary(state.data, year, month, catId);
  toast(after.remaining >= 0
    ? `저장됨 · 잔액 ${fmtMoney(after.remaining)}이 다음 달로 이월됩니다`
    : `저장됨 · ${fmtMoney(-after.remaining)} 초과 사용`, after.remaining >= 0 ? 'success' : 'error');
  rerender();
}

export async function showBudgetForm(y, m, rerender) {
  const cats = getVisibleCategories(state.data);
  const fields = cats.map((c) => {
    const monthly = getMonthlyPlanAmount(state.data, y, c.id);
    return formField(c.name, `<input class="input" name="${c.id}" type="number" min="0" value="${monthly || 0}" />`);
  }).join('');
  const res = await openModal({
    title: `${fmtMonth(y, m)} 월간 예산`,
    body: `<form id="budget-form" class="form-stack">${fields}</form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  for (const c of cats) setMonthlyPlanAmount(state.data, y, c.id, Number(fd.get(c.id)) || 0);
  persist(); toast('월간 예산이 저장되었습니다', 'success'); rerender();
}

export async function showCategoryManage(rerender) {
  const cats = state.data.budget.categories;
    const rows = cats.map((c) =>
      `<div class="cat-manage-row ${c.hidden ? 'hidden-cat' : ''}">
        <span>${esc(c.name)}${c.hidden ? ' (숨김)' : ''}</span>
        <button type="button" class="text-btn" data-cat-edit="${c.id}">편집</button>
      </div>`).join('');
  const res = await openModal({
      title: '카테고리 관리',
      body: `<div class="list-group">${rows}</div>`,
      actions: [
        { label: '카테고리 추가', value: 'add' },
        { label: '닫기', value: null, primary: true },
      ],
      onOpen: (sheet) => {
        sheet.querySelectorAll('[data-cat-edit]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const cat = cats.find((c) => c.id === btn.dataset.catEdit);
            if (!cat) return;
            const editRes = await openModal({
              title: '카테고리 편집',
              body: `<form id="cat-form" class="form-stack">
                ${formField('이름', `<input class="input" name="name" value="${esc(cat.name)}" required />`)}
                <label class="toggle-row"><span>숨김</span>
                  <input type="checkbox" name="hidden" ${cat.hidden ? 'checked' : ''} /></label>
                ${formField('정산일 (비우면 기본)', `<input class="input" name="recordDay" type="number" min="1" max="28" placeholder="${state.data.budget.defaultRecordDay}" value="${cat.recordDay ?? ''}" />`)}
              </form>`,
              actions: [
                { label: '숨김', value: 'delete', danger: true },
                { label: '저장', value: 'save', primary: true },
              ],
            });
            const ea = modalValue(editRes);
            if (ea === 'delete') { cat.hidden = true; persist(); toast('숨김 처리'); rerender(); showCategoryManage(rerender); return; }
            if (ea !== 'save') return;
            const efd = modalForm(editRes);
            if (!efd) return;
            cat.name = efd.get('name');
            cat.hidden = !!efd.get('hidden');
            const rd = efd.get('recordDay');
            cat.recordDay = rd ? Math.min(28, Math.max(1, Number(rd))) : null;
            persist(); toast('저장됨', 'success'); rerender(); showCategoryManage(rerender);
          });
        });
      },
    });
  if (modalValue(res) === 'add') {
    const addRes = await openModal({
      title: '카테고리 추가',
      body: formField('이름', '<input class="input" name="name" required />'),
      actions: [{ label: '취소', value: null }, { label: '추가', value: 'save', primary: true }],
    });
    if (modalValue(addRes) === 'save') {
      const fd = modalForm(addRes);
      if (fd?.get('name')?.trim()) {
        addCategory(state.data, fd.get('name').trim());
        persist();
        toast('추가되었습니다', 'success');
        showCategoryManage(rerender);
        return;
      }
    }
  }
  rerender();
}

export async function showContributionForm(goalId, rerender) {
  const res = await openModal({
    title: '기여 기록',
    body: `<form id="contrib-form" class="form-stack">
      ${formField('날짜', `<input class="input" name="date" type="date" value="${todayISO()}" required />`)}
      ${formField('금액', '<input class="input" name="amount" type="number" required min="1" />')}
      ${formField('메모', '<input class="input" name="memo" />')}
    </form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  const g = state.data.goals.find((x) => x.id === goalId);
  if (!g) return;
  g.contributions = g.contributions || [];
  g.contributions.push({
    id: uid(), date: fd.get('date'), amount: Number(fd.get('amount')), memo: fd.get('memo'),
  });
  const { rate } = computeGoalProgress(g);
  for (const ms of g.milestones || []) {
    if (rate * 100 >= ms.percent) ms.reached = true;
  }
  persist(); rerender();
}
