import { state, persist } from '../state.js';
import {
  ASSET_TYPES, OWNERS, GOAL_TEMPLATES, getVisibleCategories, getMonthBudget,
  calcMonthlyContribution, monthsBetween, computeGoalProgress,
} from '../store.js';
import { fmtMonth, todayISO, uid } from '../format.js';
import { openModal, toast, formField, esc } from '../ui.js';

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
  if (!res) return;
  const form = document.getElementById('asset-form');
  if (!form) return;
  if (res === 'delete' && item) {
    state.data.assets.items = state.data.assets.items.filter((i) => i.id !== item.id);
    persist(); toast('삭제되었습니다'); rerender(); return;
  }
  if (res !== 'save') return;
  const fd = new FormData(form);
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
          <option value="equal">월별 균등</option><option value="accelerating">후반 가속</option></select>`)}
        ${formField('월 기여금', '<input class="input" name="monthlyContribution" type="number" min="0" />')}
      </form>`,
    actions: [{ label: '취소', value: null }, { label: '제안하기', value: 'save', primary: true }],
  });
  if (res !== 'save') return;
  const form = document.getElementById('goal-form');
  const fd = new FormData(form);
  const target = Number(fd.get('targetAmount'));
  const months = monthsBetween(fd.get('startDate'), fd.get('endDate'));
  const mode = fd.get('mode') || 'equal';
  const goal = {
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
  };
  state.data.goals.push(goal);
  persist();
  toast(state.data.auth.spouseConnected ? '배우자에게 제안되었습니다' : '목표가 생성되었습니다', 'success');
  rerender();
}

export function bindGoalTemplatePicker() {
  document.querySelectorAll('[data-tpl]').forEach((tpl) => {
    tpl.addEventListener('click', () => {
      const t = GOAL_TEMPLATES.find((x) => x.id === tpl.dataset.tpl);
      const form = document.getElementById('goal-form');
      if (!form || !t) return;
      form.classList.remove('hidden');
      form.template.value = t.id;
      form.title.value = t.id === 'custom' ? '' : t.label;
      form.targetAmount.value = t.defaultAmount;
      const end = new Date();
      end.setMonth(end.getMonth() + t.defaultMonths);
      form.endDate.value = end.toISOString().slice(0, 10);
      form.monthlyContribution.value = calcMonthlyContribution(t.defaultAmount, t.defaultMonths, 'equal');
    });
  });
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
        <option value="현금">현금</option><option value="카드">카드</option><option value="이체">이체</option></select>`)}
      ${formField('메모', `<input class="input" name="memo" value="${esc(item?.memo || '')}" />`)}
      <label class="toggle-row"><span>배우자 공유</span>
        <input type="checkbox" name="shared" ${item?.shared !== false ? 'checked' : ''} /></label>
    </form>`,
    actions: [
      ...(item ? [{ label: '삭제', value: 'delete', danger: true }] : []),
      { label: '취소', value: null }, { label: '저장', value: 'save', primary: true },
    ],
  });
  if (!res) return;
  if (res === 'delete' && item) {
    state.data.transactions = state.data.transactions.filter((t) => t.id !== item.id);
    persist(); rerender(); return;
  }
  if (res !== 'save') return;
  const fd = new FormData(document.getElementById('tx-form'));
  const payload = {
    date: fd.get('date'), amount: Number(fd.get('amount')), type: fd.get('type'),
    categoryId: fd.get('categoryId'), paymentMethod: fd.get('paymentMethod'),
    memo: fd.get('memo'), shared: !!fd.get('shared'), createdBy: 'self',
  };
  if (item) Object.assign(item, payload);
  else state.data.transactions.push({ id: uid(), ...payload });
  persist(); toast('저장되었습니다', 'success'); rerender();
}

export async function showBudgetForm(y, m, rerender) {
  const mb = getMonthBudget(state.data, y, m);
  const cats = getVisibleCategories(state.data);
  const fields = cats.map((c) =>
    formField(c.name, `<input class="input" name="${c.id}" type="number" min="0" value="${mb[c.id] || 0}" />`)).join('');
  const res = await openModal({
    title: `${fmtMonth(y, m)} 예산 설정`,
    body: `<form id="budget-form" class="form-stack">${fields}</form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
  });
  if (res !== 'save') return;
  const fd = new FormData(document.getElementById('budget-form'));
  for (const c of cats) mb[c.id] = Number(fd.get(c.id)) || 0;
  persist(); toast('예산이 저장되었습니다', 'success'); rerender();
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
  if (res !== 'save') return;
  const g = state.data.goals.find((x) => x.id === goalId);
  if (!g) return;
  const fd = new FormData(document.getElementById('contrib-form'));
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
