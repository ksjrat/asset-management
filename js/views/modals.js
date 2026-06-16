import { state, persist } from '../state.js';
import {
  ASSET_TYPES, OWNERS, GOAL_TEMPLATES, getVisibleCategories, getHiddenCategories,
  calcMonthlyContribution, monthsBetween, computeGoalProgress,
  addCategory, getOwnerDisplayLabel, getSubPayerLabel,
  getIncomeCategories, getSavingsEligibleAssets, findSavingsContribution,
  getVisibleSavingsItems, hasSubItems, getVisibleSubItems, SAVINGS_ASSET_TYPES,
  syncInvestAssetAmount, getSavingsCategory, getLoanAssets, LOAN_REPAYMENT_METHODS,
} from '../store.js';
import { previewLoanSplit, formatLoanSplitSummary } from '../loan-sync.js';
import {
  getMonthlyPlanAmount, setMonthlyPlanAmount,
  getActualAmount, setActualAmount, getCategoryPeriodSummary,
  getRecordSchedule, RECORD_SCHEDULE_FIXED, RECORD_SCHEDULE_NEXT_MONTH_FIRST_SUNDAY,
  RECORD_SCHEDULES,
  getBudgetStart, setBudgetStart,
  getSubMonthlyPlanAmount, setSubMonthlyPlanAmount, syncSubEnvelopeMonthlyPlan,
  getSubActualAmount, setSubActualAmount, getSubItems,
} from '../budget-engine.js';
import { fmtMonth, fmtMoney, todayISO, uid } from '../format.js';
import { openModal, toast, formField, esc, modalValue, modalForm } from '../ui.js';
import { validateGoalInput, projectGoalImpact } from '../validators.js';

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
  const repayOpts = LOAN_REPAYMENT_METHODS.map((m) =>
    `<option value="${m.id}" ${(item?.repaymentMethod || 'equal_payment') === m.id ? 'selected' : ''}>${m.label}</option>`).join('');
  const isLoan = item?.type === 'loan';
  const res = await openModal({
    title: item ? '항목 수정' : '자산/부채 등록',
    body: `<form id="asset-form" class="form-stack">
      ${formField('유형', `<select name="type" class="input" id="asset-type-select">${typeOpts}</select>`)}
      ${formField('이름', `<input class="input" name="name" required value="${esc(item?.name || '')}" />`)}
      ${formField('금액', `<input class="input" name="amount" type="number" required min="0" value="${item?.amount ?? ''}" />
        <span class="field-hint" id="amount-hint">${isLoan ? '현재 대출 잔액(원금)' : ''}</span>`)}
      <div id="loan-term-fields" class="${isLoan ? '' : 'hidden'}">
        ${formField('연 이율 (%)', `<input class="input" name="annualRate" type="number" min="0" step="0.01" value="${item?.annualRate ?? ''}" placeholder="예: 3.5" />`)}
        ${formField('상환 방식', `<select name="repaymentMethod" class="input">${repayOpts}</select>`)}
        ${formField('대출 기간 (월)', `<input class="input" name="termMonths" type="number" min="1" value="${item?.termMonths ?? ''}" placeholder="예: 360" />`)}
        ${formField('최초 대출원금', `<input class="input" name="originalPrincipal" type="number" min="0" value="${item?.originalPrincipal ?? item?.amount ?? ''}" />
          <span class="field-hint">원금균등 상환 시 월 원금 계산에 사용</span>`)}
      </div>
      ${formField('소유', `<select name="owner" class="input">${ownerOpts}</select>`)}
      <label class="toggle-row"><span>${esc(getOwnerDisplayLabel(state.data, 'spouse'))}에게 비공개</span>
        <input type="checkbox" name="private" ${item?.private ? 'checked' : ''} /></label>
    </form>`,
    actions: [
      ...(item ? [{ label: '삭제', value: 'delete', danger: true }] : []),
      { label: '취소', value: null },
      { label: '저장', value: 'save', primary: true },
    ],
    onOpen: (sheet) => {
      const typeSel = sheet.querySelector('#asset-type-select');
      const loanFields = sheet.querySelector('#loan-term-fields');
      const amountHint = sheet.querySelector('#amount-hint');
      const toggleLoan = () => {
        const loan = typeSel?.value === 'loan';
        loanFields?.classList.toggle('hidden', !loan);
        if (amountHint) amountHint.textContent = loan ? '현재 대출 잔액(원금)' : '';
      };
      typeSel?.addEventListener('change', toggleLoan);
      toggleLoan();
    },
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
  if (payload.type === 'loan') {
    payload.annualRate = Number(fd.get('annualRate'));
    payload.repaymentMethod = fd.get('repaymentMethod') || 'equal_payment';
    payload.termMonths = Number(fd.get('termMonths')) || null;
    payload.originalPrincipal = Number(fd.get('originalPrincipal')) || payload.amount;
  } else if (item) {
    delete item.annualRate;
    delete item.repaymentMethod;
    delete item.termMonths;
    delete item.originalPrincipal;
    delete item.repaymentLog;
  }
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

export async function showAssetValuationForm(assetId, rerender) {
  const item = state.data.assets.items.find((x) => x.id === assetId);
  if (!item) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const ym = `${y}-${String(m).padStart(2, '0')}`;
  const existing = (item.valuations || []).find((v) => v.ym === ym);

  const res = await openModal({
    title: '투자 평가금액 기록',
    body: `<form id="asset-val-form" class="form-stack">
      <p class="field-hint">투자 자산의 <strong>${esc(ym)}</strong> 평가금액을 기록합니다. (월별 1회)</p>
      ${formField('평가금액', `<input class="input" name="amount" type="number" required min="0" value="${existing?.amount ?? ''}" />`)}
    </form>`,
    actions: [
      ...(existing ? [{ label: '삭제', value: 'delete', danger: true }] : []),
      { label: '취소', value: null },
      { label: '저장', value: 'save', primary: true },
    ],
  });
  const action = modalValue(res);
  if (!action) return;

  item.valuations = item.valuations || [];
  if (action === 'delete') {
    item.valuations = item.valuations.filter((v) => v.ym !== ym);
    syncInvestAssetAmount(item);
    item.updatedAt = new Date().toISOString();
    persist();
    toast('삭제되었습니다', 'success');
    rerender();
    return;
  }
  if (action !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  const amount = Number(fd.get('amount'));
  if (!Number.isFinite(amount) || amount < 0) {
    toast('평가금액을 올바르게 입력하세요', 'error');
    return;
  }

  const entry = { ym, amount, at: new Date().toISOString() };
  const idx = item.valuations.findIndex((v) => v.ym === ym);
  if (idx >= 0) item.valuations[idx] = entry;
  else item.valuations.push(entry);
  item.valuations.sort((a, b) => String(a.ym).localeCompare(String(b.ym)));
  syncInvestAssetAmount(item);
  item.updatedAt = entry.at;
  persist();
  toast('기록되었습니다', 'success');
  rerender();
}

function payerSelect(name, value, data) {
  const opts = OWNERS.map((o) =>
    `<option value="${o.id}" ${value === o.id ? 'selected' : ''}>${esc(getOwnerDisplayLabel(data, o.id))}</option>`).join('');
  return `<select name="${name}" class="input input-sm">${opts}</select>`;
}

function incomeOwnerSelect(value, data) {
  const opts = OWNERS.filter((o) => o.id !== 'joint').map((o) =>
    `<option value="${o.id}" ${value === o.id ? 'selected' : ''}>${esc(getOwnerDisplayLabel(data, o.id))}</option>`).join('');
  return `<select name="owner" class="input">${opts}</select>`;
}

export async function showSavingsForm(rerender, entryId = null) {
  const existing = entryId ? findSavingsContribution(state.data, entryId) : null;
  if (existing?.entry?.source === 'budget') {
    const { entry } = existing;
    const y = entry.year ?? new Date(entry.date).getFullYear();
    const m = entry.month ?? new Date(entry.date).getMonth() + 1;
    toast('지출 탭에서 저축 세부 실적을 수정하세요', 'info');
    const { setTab, setMonth } = await import('../state.js');
    setMonth(y, m);
    setTab('expense');
    rerender();
    return;
  }

  const eligible = getSavingsEligibleAssets(state.data);
  if (!existing) {
    toast('저축은 지출 탭 → 저축 → 세부 실적 입력으로 기록하세요', 'info');
    return;
  }

  if (!eligible.length) {
    toast('예금·적금 자산을 먼저 등록해 주세요', 'info');
    return;
  }

  const assetOpts = eligible.map((a) => {
    const type = ASSET_TYPES.find((t) => t.id === a.type);
    const selected = existing ? existing.asset.id === a.id : false;
    return `<option value="${a.id}" ${selected ? 'selected' : ''}>${esc(a.name)} (${type?.label || ''} · ${fmtMoney(a.amount)})</option>`;
  }).join('');

  const savingsItems = getVisibleSavingsItems(state.data);
  const itemOpts = savingsItems.map((i) =>
    `<option value="${i.id}" ${existing?.entry.savingsItemId === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('');

  const res = await openModal({
    title: existing ? '저축 실행 수정' : '저축 실행',
    body: `<form id="savings-form" class="form-stack">
      <p class="field-hint">이체한 예·적금 계좌와 금액을 입력하면 <strong>자산 잔액이 올라갑니다</strong>. 저축 실적에도 반영됩니다.</p>
      ${formField('넣을 계좌', `<select name="assetId" class="input" required>${assetOpts}</select>`)}
      ${savingsItems.length ? formField('저축 항목', `<select name="savingsItemId" class="input" required>${itemOpts}</select>`) : ''}
      ${formField('날짜', `<input class="input" name="date" type="date" value="${existing?.entry.date || todayISO()}" required />`)}
      ${formField('금액', `<input class="input" name="amount" type="number" required min="1" value="${existing?.entry.amount ?? ''}" />`)}
      ${formField('메모', `<input class="input" name="memo" value="${esc(existing?.entry.memo || '')}" placeholder="급여일 저축 등" />`)}
    </form>`,
    actions: [
      ...(existing ? [{ label: '삭제', value: 'delete', danger: true }] : []),
      { label: '취소', value: null },
      { label: '저장', value: 'save', primary: true },
    ],
  });
  const action = modalValue(res);
  if (!action) return;

  if (action === 'delete' && existing) {
    const { asset, entry } = existing;
    asset.amount = Math.max(0, (asset.amount || 0) - entry.amount);
    asset.savingsLog = (asset.savingsLog || []).filter((e) => e.id !== entry.id);
    persist();
    toast('삭제되었습니다', 'success');
    rerender();
    return;
  }
  if (action !== 'save') return;

  const fd = modalForm(res);
  if (!fd) return;
  const assetId = fd.get('assetId');
  const asset = state.data.assets.items.find((x) => x.id === assetId);
  if (!asset || !SAVINGS_ASSET_TYPES.has(asset.type)) {
    toast('예금·적금 계좌를 선택해 주세요', 'error');
    return;
  }
  const amount = Number(fd.get('amount'));
  const date = fd.get('date');
  const memo = fd.get('memo')?.toString().trim() || '';
  const savingsItemId = fd.get('savingsItemId')?.toString() || null;
  if (!Number.isFinite(amount) || amount < 1 || !date) {
    toast('금액과 날짜를 확인해 주세요', 'error');
    return;
  }

  if (existing) {
    const { asset: oldAsset, entry } = existing;
    const delta = amount - entry.amount;
    const oldItemId = entry.savingsItemId;
    const newItemId = savingsItemId || oldItemId;
    if (oldAsset.id !== asset.id) {
      oldAsset.amount = Math.max(0, (oldAsset.amount || 0) - entry.amount);
      asset.amount = (asset.amount || 0) + amount;
      oldAsset.savingsLog = (oldAsset.savingsLog || []).filter((e) => e.id !== entry.id);
      asset.savingsLog = asset.savingsLog || [];
      Object.assign(entry, {
        date, amount, memo, savingsItemId: newItemId, at: new Date().toISOString(),
      });
      asset.savingsLog.push(entry);
    } else {
      oldAsset.amount = Math.max(0, (oldAsset.amount || 0) + delta);
      Object.assign(entry, {
        date, amount, memo, savingsItemId: newItemId, at: new Date().toISOString(),
      });
    }
  } else {
    asset.amount = (asset.amount || 0) + amount;
    asset.savingsLog = asset.savingsLog || [];
    asset.savingsLog.push({
      id: uid(), date, amount, memo, savingsItemId, at: new Date().toISOString(),
    });
  }

  asset.history = asset.history || [];
  asset.history.push({ amount: asset.amount, at: new Date().toISOString() });
  persist();
  toast('저축이 반영되었습니다', 'success');
  rerender();
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

function txMemoDisplay(item) {
  const memo = item?.memo?.toString().trim() || '';
  if (memo) return memo;
  const tags = item?.tags;
  if (Array.isArray(tags) && tags.length) return tags.join(', ');
  return '';
}

export async function showTxForm(type, item, rerender, opts = {}) {
  const cats = type === 'income' ? getIncomeCategories(state.data) : getVisibleCategories(state.data);
  const presetCatId = opts?.presetCategoryId;
  const catOpts = cats.map((c) =>
    `<option value="${c.id}" ${(item?.categoryId === c.id || (!item && presetCatId === c.id)) ? 'selected' : ''}>${c.name}</option>`).join('');
  const memoPlaceholder = type === 'income' ? '예: 5월 급여, 배당' : '예: 외식, 데이트';
  const ownerField = type === 'income'
    ? formField('수입자', incomeOwnerSelect(item?.owner || 'self', state.data))
    : '';
  const res = await openModal({
    title: item ? '거래 수정' : (type === 'income' ? '수익 입력' : '지출 입력'),
    body: `<form id="tx-form" class="form-stack">
      <input type="hidden" name="type" value="${type}" />
      ${formField('날짜', `<input class="input" name="date" type="date" value="${item?.date || todayISO()}" required />`)}
      ${formField('금액', `<input class="input" name="amount" type="number" required min="1" value="${item?.amount ?? ''}" />`)}
      ${ownerField}
      ${formField('카테고리', `<select name="categoryId" class="input">${catOpts}</select>`)}
      ${formField('결제수단', `<select name="paymentMethod" class="input">
        <option value="현금" ${item?.paymentMethod === '현금' ? 'selected' : ''}>현금</option>
        <option value="카드" ${item?.paymentMethod === '카드' ? 'selected' : ''}>카드</option>
        <option value="이체" ${item?.paymentMethod === '이체' ? 'selected' : ''}>이체</option></select>`)}
      ${formField('메모', `<input class="input" name="memo" placeholder="${esc(memoPlaceholder)}" value="${esc(txMemoDisplay(item))}" />`)}
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
    memo: fd.get('memo')?.toString().trim() || '',
    shared: !!fd.get('shared'), createdBy: item?.createdBy || 'self',
    ...(type === 'income' ? { owner: fd.get('owner') || 'self' } : {}),
  };
  if (item) {
    Object.assign(item, payload);
    delete item.tags;
  } else state.data.transactions.push({ id: uid(), ...payload });
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

export async function showRecordScheduleForm(rerender) {
  const schedule = state.data.budget.recordSchedule ?? RECORD_SCHEDULE_NEXT_MONTH_FIRST_SUNDAY;
  const day = state.data.budget.defaultRecordDay ?? 25;
  const isFixed = schedule === RECORD_SCHEDULE_FIXED;
  const scheduleOpts = RECORD_SCHEDULES.map((s) =>
    `<label class="record-schedule-opt">
      <input type="radio" name="recordSchedule" value="${s.id}" ${schedule === s.id ? 'checked' : ''} />
      <span>${esc(s.label)}</span>
    </label>`).join('');
  const res = await openModal({
    title: '실적 입력 시점',
    body: `<form id="record-schedule-form" class="form-stack">
      <p class="field-hint">해당 월 실적을 언제부터 입력할지 정합니다.</p>
      <fieldset class="record-schedule-fieldset">
        <div class="record-schedule-options">${scheduleOpts}</div>
      </fieldset>
      <label class="field record-schedule-fixed ${isFixed ? '' : 'hidden'}" id="record-day-wrap">
        <span class="field-label">매달 고정일 (1~28일)</span>
        <input class="input" name="recordDay" type="number" min="1" max="28" value="${day}" ${isFixed ? 'required' : ''} />
      </label>
    </form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
    onOpen: (sheet) => {
      sheet.querySelectorAll('input[name="recordSchedule"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          const fixed = radio.value === RECORD_SCHEDULE_FIXED && radio.checked;
          sheet.querySelector('#record-day-wrap')?.classList.toggle('hidden', !fixed);
          const dayInput = sheet.querySelector('[name="recordDay"]');
          if (dayInput) {
            if (fixed) dayInput.setAttribute('required', '');
            else dayInput.removeAttribute('required');
          }
        });
      });
    },
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  const next = fd.get('recordSchedule')?.toString() || RECORD_SCHEDULE_NEXT_MONTH_FIRST_SUNDAY;
  state.data.budget.recordSchedule = next;
  if (next === RECORD_SCHEDULE_FIXED) {
    state.data.budget.defaultRecordDay = Math.min(28, Math.max(1, Number(fd.get('recordDay')) || 25));
  }
  persist();
  toast('실적 입력 시점이 저장되었습니다', 'success');
  rerender();
}

export async function showMonthlyBudgetForm(year, rerender) {
  const cats = getVisibleCategories(state.data);
  const fields = cats.map((c) => {
    const payerLabel = hasSubItems(state.data, c.id)
      ? getSubPayerLabel(state.data, c.id)
      : getOwnerDisplayLabel(state.data, c.payer || 'joint');
    if (hasSubItems(state.data, c.id)) {
      const subItems = getVisibleSubItems(state.data, c.id);
      const subRows = subItems.map((item) => {
        const monthly = getSubMonthlyPlanAmount(state.data, year, item.id);
        return `<label class="savings-budget-row savings-budget-row--payer">
          <span>${esc(item.name)}</span>
          ${payerSelect(`sub-payer-${item.id}`, item.payer || 'joint', state.data)}
          <input class="input input-amount" name="sub-${item.id}" type="number" min="0" step="10000" value="${monthly || ''}" />
        </label>`;
      }).join('');
      return `<div class="savings-budget-group">
        <p class="field-label">${esc(c.name)} (월) · ${esc(payerLabel)}</p>
        ${subRows}
        <p class="field-hint">세부 항목 합계가 월 예산으로 반영됩니다</p>
      </div>`;
    }
    const monthly = getMonthlyPlanAmount(state.data, year, c.id);
    return formField(
      `${c.name} (월) · ${payerLabel}`,
      `<input class="input input-amount" name="${c.id}" type="number" min="0" step="10000" value="${monthly || ''}" />
       <span class="field-hint">연 ${fmtMoney(monthly * 12)}</span>`,
    );
  }).join('');
  const res = await openModal({
    title: `${year}년 월간 예산`,
    body: `<form id="monthly-plan-form" class="form-stack"><p class="field-hint">세부 항목이 있는 카테고리는 항목별 예산·부담자를 지정합니다.</p>${fields}</form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  for (const c of cats) {
    if (hasSubItems(state.data, c.id)) {
      for (const item of getVisibleSubItems(state.data, c.id)) {
        item.payer = fd.get(`sub-payer-${item.id}`) || 'joint';
        setSubMonthlyPlanAmount(state.data, year, c.id, item.id, Number(fd.get(`sub-${item.id}`)) || 0);
      }
    } else {
      setMonthlyPlanAmount(state.data, year, c.id, Number(fd.get(c.id)) || 0);
    }
  }
  for (const c of cats) {
    if (hasSubItems(state.data, c.id)) syncSubEnvelopeMonthlyPlan(state.data, year, c.id);
  }
  persist();
  toast('월간 예산이 저장되었습니다', 'success');
  rerender();
}

export async function showSubActualForm(catId, year, month, rerender) {
  const cat = state.data.budget.categories.find((c) => c.id === catId);
  const items = getVisibleSubItems(state.data, catId);
  if (!cat || !items.length) {
    if (cat) showActualForm(catId, year, month, rerender);
    return;
  }
  const s = getCategoryPeriodSummary(state.data, year, month, catId);
  const rows = items.map((item) => {
    const current = getSubActualAmount(state.data, year, month, item.id);
    const payer = getOwnerDisplayLabel(state.data, item.payer || 'joint');
    const loan = item.loanId ? state.data.assets.items.find((x) => x.id === item.loanId) : null;
    const loanTag = loan
      ? `<span class="muted"> → ${esc(loan.name)}${loan.annualRate != null ? ` · ${loan.annualRate}%` : ''}</span>`
      : '';
    const splitPreview = loan
      ? `<span class="muted loan-split-preview" data-loan-item="${item.id}"></span>`
      : '';
    return `<label class="savings-actual-row" data-item-id="${item.id}" ${loan ? `data-has-loan="1"` : ''}>
      <span class="savings-actual-name">${esc(item.name)} <span class="muted savings-actual-payer">${esc(payer)}</span>${loanTag}</span>
      <input class="input input-amount savings-actual-amt" name="${item.id}" type="number" min="0" step="1000" value="${current ?? ''}" placeholder="0" />
      ${splitPreview}
    </label>`;
  }).join('');
  const isSavings = getSavingsCategory(state.data)?.id === catId;
  const hasLoanLink = items.some((i) => i.loanId);
  const savingsHint = isSavings
    ? '<p class="field-hint">입력한 금액은 <strong>예금·적금 잔액에 자동 반영</strong>됩니다.</p>'
    : '';
  const loanHint = hasLoanLink
    ? '<p class="field-hint">대출 연결 항목은 <strong>원리금 중 원금만 대출 잔액에서 차감</strong>됩니다. (연 이율·상환 방식은 대출 등록 시 설정)</p>'
    : '';
  const res = await openModal({
    title: `${fmtMonth(year, month)} · ${cat.name} 실적`,
    body: `<form id="sub-actual-form" class="form-stack">
      <p class="field-hint">사용 가능 ${fmtMoney(s.available)} (월 예산 ${fmtMoney(s.monthlyPlanned)} + 이월 ${fmtMoney(s.rolloverIn)})</p>
      <p class="field-hint">세부 항목별 금액을 입력하세요. 합계가 실적으로 반영됩니다.</p>
      ${savingsHint}
      ${loanHint}
      <div class="savings-actual-list">${rows}</div>
      <p class="savings-actual-sum">합계 <strong id="sub-sum-preview">0원</strong></p>
    </form>`,
    actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', primary: true }],
    onOpen: (sheet) => {
      const form = sheet.querySelector('#sub-actual-form');
      const preview = sheet.querySelector('#sub-sum-preview');
      const updateLoanPreviews = () => {
        form?.querySelectorAll('[data-has-loan]').forEach((row) => {
          const itemId = row.dataset.itemId;
          const inp = row.querySelector('.savings-actual-amt');
          const el = row.querySelector('.loan-split-preview');
          if (!el || !inp) return;
          const pay = Number(inp.value) || 0;
          if (pay <= 0) {
            el.textContent = '';
            return;
          }
          const split = previewLoanSplit(state.data, itemId, year, month, pay);
          if (!split) {
            el.textContent = '대출에 연 이율을 설정하세요';
            return;
          }
          el.textContent = formatLoanSplitSummary(split);
        });
      };
      const update = () => {
        let sum = 0;
        form?.querySelectorAll('.savings-actual-amt').forEach((inp) => {
          sum += Number(inp.value) || 0;
        });
        if (preview) preview.textContent = fmtMoney(sum);
        updateLoanPreviews();
      };
      form?.querySelectorAll('.savings-actual-amt').forEach((inp) => {
        inp.addEventListener('input', update);
      });
      update();
    },
  });
  if (modalValue(res) !== 'save') return;
  const fd = modalForm(res);
  if (!fd) return;
  for (const item of items) {
    setSubActualAmount(state.data, year, month, catId, item.id, Number(fd.get(item.id)) || 0);
  }
  persist();
  const after = getCategoryPeriodSummary(state.data, year, month, catId);
  if (isSavings) {
    const hasAsset = getSavingsEligibleAssets(state.data).length > 0;
    toast(hasAsset
      ? `저장됨 · 합계 ${fmtMoney(after.actual)} · 예금·적금 잔액에 반영`
      : `저장됨 · 합계 ${fmtMoney(after.actual)} · 예금·적금 자산을 등록하면 잔액에 반영됩니다`,
    hasAsset ? 'success' : 'info');
  } else if (hasLoanLink) {
    const missingRate = items.filter((i) => {
      if (!i.loanId) return false;
      const loan = state.data.assets.items.find((x) => x.id === i.loanId);
      return loan && loan.annualRate == null;
    });
    toast(missingRate.length
      ? `저장됨 · 연결 대출에 이율이 없어 잔액 연동이 안 된 항목이 있습니다`
      : `저장됨 · 합계 ${fmtMoney(after.actual)} · 대출 잔액에 원금 상환 반영`,
    missingRate.length ? 'info' : 'success');
  } else {
    toast(after.remaining >= 0
      ? `저장됨 · 합계 ${fmtMoney(after.actual)} · 잔액 ${fmtMoney(after.remaining)}`
      : `저장됨 · ${fmtMoney(-after.remaining)} 초과`, after.remaining >= 0 ? 'success' : 'error');
  }
  rerender();
}

export async function showSavingsActualForm(year, month, rerender) {
  const cat = state.data.budget.categories.find((c) => c.name === '저축');
  if (cat) return showSubActualForm(cat.id, year, month, rerender);
}

export async function showActualForm(catId, year, month, rerender) {
  if (hasSubItems(state.data, catId)) {
    return showSubActualForm(catId, year, month, rerender);
  }
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
    return formField(c.name, `<input class="input input-amount" name="${c.id}" type="number" min="0" value="${monthly || 0}" />`);
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

function subManageButtonLabel(data, catId) {
  const n = getVisibleSubItems(data, catId).length;
  return n ? `세부 ${n}` : '세부 나누기';
}

function categoryManageRows(cats, data) {
  return cats.map((c) => {
    const payer = hasSubItems(data, c.id)
      ? getSubPayerLabel(data, c.id)
      : getOwnerDisplayLabel(data, c.payer || 'joint');
    return `<div class="cat-manage-row">
      <span>${esc(c.name)} <span class="muted">· ${esc(payer)}</span></span>
      <span class="cat-manage-actions">
        <button type="button" class="text-btn" data-sub-manage="${c.id}">${subManageButtonLabel(data, c.id)}</button>
        <button type="button" class="text-btn" data-cat-edit="${c.id}">편집</button>
      </span>
    </div>`;
  }).join('');
}

function setCategoryHidden(data, cat, hidden) {
  cat.hidden = hidden;
  if (!hidden) {
    const ids = data.settings.hiddenCategories;
    const i = ids.indexOf(cat.id);
    if (i >= 0) ids.splice(i, 1);
  }
}

async function openCategoryEdit(cat, rerender) {
  const subdivided = hasSubItems(state.data, cat.id);
  const useFixedDay = getRecordSchedule(state.data, cat) === RECORD_SCHEDULE_FIXED;
  const recordDayField = useFixedDay
    ? formField('정산일 (비우면 기본)', `<input class="input" name="recordDay" type="number" min="1" max="28" placeholder="${state.data.budget.defaultRecordDay}" value="${cat.recordDay ?? ''}" />`)
    : '<p class="field-hint">실적 입력은 다음 달 첫째 주 일요일부터 가능합니다 (전역 설정).</p>';
  const editRes = await openModal({
    title: '카테고리 편집',
    body: `<form id="cat-form" class="form-stack">
      ${formField('이름', `<input class="input" name="name" value="${esc(cat.name)}" required />`)}
      ${subdivided
    ? '<p class="field-hint">세부 항목이 있어 부담자는 세부 항목에서 지정합니다.</p>'
    : formField('부담자', payerSelect('payer', cat.payer || 'joint', state.data))}
      <label class="toggle-row"><span>숨김</span>
        <input type="checkbox" name="hidden" ${cat.hidden ? 'checked' : ''} /></label>
      ${recordDayField}
    </form>`,
    actions: [
      { label: '세부 항목', value: 'sub' },
      { label: '숨기기', value: 'delete', danger: true },
      { label: '저장', value: 'save', primary: true },
    ],
  });
  const ea = modalValue(editRes);
  if (ea === 'sub') {
    showSubItemsManage(cat.id, rerender);
    return;
  }
  if (ea === 'delete') {
    setCategoryHidden(state.data, cat, true);
    persist();
    toast('숨김 처리');
    rerender();
    showCategoryManage(rerender);
    return;
  }
  if (ea !== 'save') return;
  const efd = modalForm(editRes);
  if (!efd) return;
  cat.name = efd.get('name');
  if (!hasSubItems(state.data, cat.id)) cat.payer = efd.get('payer') || 'joint';
  setCategoryHidden(state.data, cat, !!efd.get('hidden'));
  if (getRecordSchedule(state.data, cat) === RECORD_SCHEDULE_FIXED) {
    const rd = efd.get('recordDay');
    cat.recordDay = rd ? Math.min(28, Math.max(1, Number(rd))) : null;
  }
  persist();
  toast('저장됨', 'success');
  rerender();
  showCategoryManage(rerender);
}

function bindCategoryManageSheet(sheet, allCats, hiddenCount, rerender) {
  sheet.querySelectorAll('[data-cat-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cat = allCats.find((c) => c.id === btn.dataset.catEdit);
      if (cat) await openCategoryEdit(cat, rerender);
    });
  });
  sheet.querySelectorAll('[data-sub-manage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showSubItemsManage(btn.dataset.subManage, rerender);
    });
  });
  const toggle = sheet.querySelector('#btn-toggle-hidden-cats');
  const section = sheet.querySelector('.cat-manage-hidden-section');
  if (!toggle || !section) return;
  toggle.addEventListener('click', () => {
    section.classList.toggle('hidden');
    toggle.textContent = section.classList.contains('hidden')
      ? `숨긴 항목 ${hiddenCount}개 보기`
      : '숨긴 항목 접기';
  });
}

function subItemManageRows(items, data) {
  return items.map((item) => {
    const payer = getOwnerDisplayLabel(data, item.payer || 'joint');
    const loan = item.loanId ? data.assets?.items?.find((x) => x.id === item.loanId) : null;
    const link = loan ? ` · ${esc(loan.name)}` : '';
    return `<div class="cat-manage-row">
      <span>${esc(item.name)} <span class="muted">· ${esc(payer)}${link}</span></span>
      <button type="button" class="text-btn" data-sub-edit="${item.id}">편집</button>
    </div>`;
  }).join('');
}

async function openSubItemEdit(catId, item, rerender) {
  const cat = state.data.budget.categories.find((c) => c.id === catId);
  const isSavings = cat?.name === '저축';
  const eligible = isSavings ? getSavingsEligibleAssets(state.data) : [];
  const loans = getLoanAssets(state.data);
  const assetField = isSavings && eligible.length > 1
    ? formField('연결 계좌', `<select name="assetId" class="input">
        <option value="">기본 계좌 (${esc(eligible[0]?.name || '')})</option>
        ${eligible.map((a) => `<option value="${a.id}" ${item.assetId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>
      <span class="field-hint">지출 실적 입력 시 이 계좌 잔액에 반영됩니다</span>`)
    : '';
  const loanField = loans.length
    ? formField('연결 대출', `<select name="loanId" class="input">
        <option value="">없음</option>
        ${loans.map((l) => `<option value="${l.id}" ${item.loanId === l.id ? 'selected' : ''}>${esc(l.name)}${l.annualRate != null ? ` · ${l.annualRate}%` : ''}</option>`).join('')}
      </select>
      <span class="field-hint">주담대·대출 원리금 실적 입력 시 잔액에서 원금만 차감</span>`)
    : '';
  const editRes = await openModal({
    title: '세부 항목 편집',
    body: `<form id="sub-form" class="form-stack">
      ${formField('이름', `<input class="input" name="name" value="${esc(item.name)}" required />`)}
      ${formField('부담자', payerSelect('payer', item.payer || 'joint', state.data))}
      ${loanField}
      ${assetField}
      <label class="toggle-row"><span>숨김</span>
        <input type="checkbox" name="hidden" ${item.hidden ? 'checked' : ''} /></label>
    </form>`,
    actions: [{ label: '저장', value: 'save', primary: true }],
  });
  if (modalValue(editRes) !== 'save') return;
  const efd = modalForm(editRes);
  if (!efd) return;
  item.name = efd.get('name');
  item.payer = efd.get('payer') || 'joint';
  item.hidden = !!efd.get('hidden');
  if (isSavings) {
    const assetId = efd.get('assetId')?.toString();
    item.assetId = assetId || null;
  }
  if (loans.length) {
    const loanId = efd.get('loanId')?.toString();
    item.loanId = loanId || null;
  }
  persist();
  toast('저장됨', 'success');
  showSubItemsManage(catId, rerender);
}

export async function showSubItemsManage(catId, rerender) {
  const cat = state.data.budget.categories.find((c) => c.id === catId);
  if (!cat) return;
  const isSavings = cat.name === '저축';
  const isHousing = cat.name === '주거';
  const items = getSubItems(state.data, catId);
  const visible = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);
  const res = await openModal({
    title: `${cat.name} · 세부 항목`,
    body: `<div class="cat-manage-panel">
      <p class="field-hint">${isSavings
    ? '지출 실적 입력 시 연결된 예금·적금 계좌 잔액에 자동 반영됩니다. 계좌가 여러 개면 항목별로 연결 계좌를 지정하세요.'
    : isHousing
      ? '주담대 원리금 항목은 대출을 연결하고, 지출 실적 입력 시 대출 잔액에서 원금만 차감됩니다.'
      : '실적 입력 시 세부 항목별로 금액·부담자를 기록합니다.'}</p>
      <div class="list-group">${subItemManageRows(visible, state.data) || '<p class="muted">항목이 없습니다</p>'}</div>
      ${hidden.length ? `<p class="muted cat-manage-section-label">숨긴 항목 ${hidden.length}개</p>
        <div class="list-group">${subItemManageRows(hidden, state.data)}</div>` : ''}
    </div>`,
    actions: [
      { label: '항목 추가', value: 'add' },
      { label: '닫기', value: null, primary: true },
    ],
    onOpen: (sheet) => {
      sheet.querySelectorAll('[data-sub-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = items.find((i) => i.id === btn.dataset.subEdit);
          if (item) openSubItemEdit(catId, item, rerender);
        });
      });
    },
  });
  if (modalValue(res) === 'add') {
    const addRes = await openModal({
      title: '세부 항목 추가',
      body: `<form id="sub-add-form" class="form-stack">
        ${formField('이름', '<input class="input" name="name" required placeholder="예: 생명보험, 관리비" />')}
        ${formField('부담자', payerSelect('payer', 'joint', state.data))}
      </form>`,
      actions: [{ label: '취소', value: null }, { label: '추가', value: 'save', primary: true }],
    });
    if (modalValue(addRes) === 'save') {
      const fd = modalForm(addRes);
      const name = fd?.get('name')?.toString().trim();
      if (name) {
        getSubItems(state.data, catId).push({
          id: uid(), name, hidden: false, payer: fd.get('payer') || 'joint',
        });
        persist();
        toast('추가되었습니다', 'success');
        showSubItemsManage(catId, rerender);
        return;
      }
    }
  }
  rerender();
}

/** 원하는 카테고리를 고른 뒤 세부 항목 관리 화면으로 이동 */
export async function showSubItemsCategoryPicker(rerender) {
  const cats = getVisibleCategories(state.data);
  if (!cats.length) {
    toast('먼저 카테고리를 추가해 주세요', 'error');
    return;
  }
  const opts = cats.map((c) => {
    const n = getVisibleSubItems(state.data, c.id).length;
    const suffix = n ? ` · 세부 ${n}개` : '';
    return `<option value="${c.id}">${esc(c.name)}${suffix}</option>`;
  }).join('');
  const res = await openModal({
    title: '세부 항목 나누기',
    body: `<form id="sub-cat-pick-form" class="form-stack">
      <p class="field-hint">보험·주거·저축 등 원하는 카테고리를 선택한 뒤 세부 항목을 추가하세요.</p>
      ${formField('카테고리', `<select class="input" name="catId" required>${opts}</select>`)}
    </form>`,
    actions: [{ label: '취소', value: null }, { label: '다음', value: 'pick', primary: true }],
  });
  if (modalValue(res) !== 'pick') return;
  const fd = modalForm(res);
  const catId = fd?.get('catId')?.toString();
  if (catId) await showSubItemsManage(catId, rerender);
}

export async function showSavingsItemsManage(rerender) {
  const cat = state.data.budget.categories.find((c) => c.name === '저축');
  if (cat) showSubItemsManage(cat.id, rerender);
}

export async function showCategoryManage(rerender) {
  const allCats = state.data.budget.categories;
  const visibleCats = getVisibleCategories(state.data);
  const hiddenCats = getHiddenCategories(state.data);
  const visibleRows = categoryManageRows(visibleCats, state.data);
  const hiddenBlock = hiddenCats.length
    ? `<button type="button" class="text-btn cat-manage-toggle-hidden" id="btn-toggle-hidden-cats">숨긴 항목 ${hiddenCats.length}개 보기</button>
       <div class="cat-manage-hidden-section hidden">
         <p class="cat-manage-section-label muted">숨긴 항목</p>
         <div class="list-group">${categoryManageRows(hiddenCats, state.data)}</div>
       </div>`
    : '';
  const res = await openModal({
    title: '카테고리 관리',
    body: `<div class="cat-manage-panel">
      <p class="field-hint">각 항목의 「세부 나누기」로 원하는 카테고리에 세부 내역을 추가할 수 있습니다.</p>
      <div class="list-group">${visibleRows || '<p class="muted cat-manage-empty">사용 중인 카테고리가 없습니다.</p>'}</div>
      ${hiddenBlock}
    </div>`,
    actions: [
      { label: '세부 나누기', value: 'sub-pick' },
      { label: '카테고리 추가', value: 'add' },
      { label: '닫기', value: null, primary: true },
    ],
    onOpen: (sheet) => bindCategoryManageSheet(sheet, allCats, hiddenCats.length, rerender),
  });
  if (modalValue(res) === 'sub-pick') {
    await showSubItemsCategoryPicker(rerender);
    return;
  }
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
