import { escapeHtml } from './ui.js';

export function listEditorHtml(list, fieldName) {
  const items = list.map(
    (item, i) => `
    <div class="list-editor-row" data-index="${i}">
      <input type="text" name="${fieldName}" value="${escapeHtml(item)}" />
      <button type="button" class="btn-icon" data-remove="${i}" aria-label="삭제">×</button>
    </div>`
  ).join('');
  return `${items}<button type="button" class="btn btn-outline" data-add-list="${fieldName}" style="width:100%;margin-top:8px">+ 추가</button>`;
}

export function readListFromForm(form, fieldName) {
  return [...form.querySelectorAll(`input[name="${fieldName}"]`)]
    .map((el) => el.value.trim())
    .filter(Boolean);
}

export function bindListEditor(container, onChange) {
  container.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.onclick = () => {
      const row = btn.closest('.list-editor-row');
      row?.remove();
      onChange?.();
    };
  });
  container.querySelectorAll('[data-add-list]').forEach((btn) => {
    btn.onclick = () => {
      const field = btn.dataset.addList;
      const row = document.createElement('div');
      row.className = 'list-editor-row';
      row.innerHTML = `<input type="text" name="${field}" value="" /><button type="button" class="btn-icon" data-remove aria-label="삭제">×</button>`;
      btn.before(row);
      bindListEditor(container, onChange);
      row.querySelector('input')?.focus();
    };
  });
}
