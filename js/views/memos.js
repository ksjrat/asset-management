import { state, persist } from '../state.js';
import { ensureMemos, listMemos } from '../store.js';
import { fmtDate, uid } from '../format.js';
import { esc, emptyState, openModal, toast, confirmDialog, modalValue, modalForm } from '../ui.js';

function memoPreview(body) {
  const line = (body || '').trim().split(/\n/)[0] || '내용 없음';
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

function memoRow(memo) {
  const updated = memo.updatedAt || memo.createdAt;
  return `<button type="button" class="list-item memo-item" data-memo-id="${memo.id}">
    <span class="avatar avatar--icon" aria-hidden="true">📝</span>
    <span class="list-body">
      <span class="list-title">${esc(memoPreview(memo.body))}</span>
      <span class="list-meta">${fmtDate(updated)}</span>
    </span>
  </button>`;
}

async function showMemoForm(memo, rerender) {
  const isEdit = !!memo;
  const res = await openModal({
    title: isEdit ? '메모 수정' : '새 메모',
    body: `<form id="memo-form" class="form-stack">
      <label class="field"><span class="field-label">내용</span>
        <textarea class="input memo-textarea" name="body" rows="8" required placeholder="자유롭게 적어 두세요">${esc(memo?.body || '')}</textarea>
      </label>
    </form>`,
    actions: isEdit
      ? [
        { label: '삭제', value: 'delete', danger: true },
        { label: '취소', value: null },
        { label: '저장', value: 'save', primary: true },
      ]
      : [
        { label: '취소', value: null },
        { label: '저장', value: 'save', primary: true },
      ],
  });
  const action = modalValue(res);
  if (action === 'delete') {
    if (!(await confirmDialog('메모 삭제', '이 메모를 삭제할까요?'))) return;
    ensureMemos(state.data);
    const now = new Date().toISOString();
    const target = state.data.memos.find((m) => m.id === memo.id);
    if (target) {
      target.deletedAt = now;
      target.updatedAt = now;
    }
    persist();
    toast('메모가 삭제되었습니다', 'info');
    rerender();
    return;
  }
  if (action !== 'save') return;
  const fd = modalForm(res);
  const body = fd?.get('body')?.toString().trim() ?? '';
  if (!body) {
    toast('내용을 입력해 주세요', 'error');
    return;
  }
  const now = new Date().toISOString();
  ensureMemos(state.data);
  if (isEdit) {
    const target = state.data.memos.find((m) => m.id === memo.id);
    if (target) {
      target.body = body;
      target.updatedAt = now;
    }
  } else {
    state.data.memos.push({ id: uid(), body, createdAt: now, updatedAt: now });
  }
  persist();
  toast(isEdit ? '메모가 저장되었습니다' : '메모가 추가되었습니다', 'success');
  rerender();
}

export function renderMemos() {
  ensureMemos(state.data);
  const memos = listMemos(state.data);
  return `
    <section class="section">
      <p class="muted settings-hint">가계·자산과 별도로 자유롭게 적어 두는 메모입니다. 클라우드 동기화에 포함됩니다.</p>
      ${memos.length
    ? `<div class="list-group">${memos.map(memoRow).join('')}</div>`
    : emptyState('📝', '메모 없음', '오른쪽 아래 + 버튼으로 메모를 남겨 보세요')}
    </section>`;
}

export function bindMemos() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  document.querySelectorAll('[data-memo-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const memo = state.data.memos?.find((m) => m.id === el.dataset.memoId);
      if (memo) showMemoForm(memo, rerender);
    });
  });
  document.getElementById('fab-add-memo')?.addEventListener('click', () => showMemoForm(null, rerender));
}

export async function openNewMemo() {
  const rerender = () => import('./index.js').then((m) => m.renderApp());
  await showMemoForm(null, rerender);
}
