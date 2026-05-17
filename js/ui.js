let modalEl;
let toastTimer;
let activeOverlay = null;

export function initUI() {
  modalEl = document.getElementById('modal-root');
}

export function openModal({ title, body, actions = [], onOpen }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-handle"></div>
        <h2 class="modal-title" id="modal-title">${title}</h2>
        <div class="modal-body">${body}</div>
        <div class="modal-actions"></div>
      </div>
    `;
    const sheet = overlay.querySelector('.modal-sheet');
    const actionsEl = overlay.querySelector('.modal-actions');
    const snapshotForm = () => {
      const form = sheet.querySelector('form');
      if (form) return Object.fromEntries(new FormData(form).entries());
      const body = sheet.querySelector('.modal-body');
      if (!body) return null;
      const fields = body.querySelectorAll('input[name], select[name], textarea[name]');
      if (!fields.length) return null;
      const entries = [];
      for (const el of fields) {
        if (el.type === 'checkbox') {
          if (el.checked) entries.push([el.name, el.value || 'on']);
        } else if (el.type === 'radio') {
          if (el.checked) entries.push([el.name, el.value]);
        } else {
          entries.push([el.name, el.value]);
        }
      }
      return Object.fromEntries(entries);
    };
    const finish = (value) => {
      if (overlay.dataset.closing) return;
      overlay.dataset.closing = '1';
      const form = snapshotForm();
      closeModal(overlay);
      resolve(form ? { value, form } : value);
    };
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${act.primary ? 'btn-primary' : act.danger ? 'btn-danger' : 'btn-ghost'}`;
      btn.textContent = act.label;
      btn.addEventListener('click', () => finish(act.value ?? act.label));
      actionsEl.appendChild(btn);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        finish(null);
      }
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('transitionend', () => {
      if (overlay.dataset.closing) document.removeEventListener('keydown', onKey);
    }, { once: true });

    modalEl.appendChild(overlay);
    activeOverlay = overlay;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => overlay.classList.add('open'));
    if (onOpen) onOpen(sheet);
    const firstInput = sheet.querySelector('input, select, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 120);
    const form = sheet.querySelector('form');
    if (form?.querySelector('[name="amount"]')) bindAmountPreview(form);
  });
}

function closeModal(overlay) {
  overlay.classList.remove('open');
  document.body.classList.remove('modal-open');
  activeOverlay = null;
  setTimeout(() => overlay.remove(), 220);
}

const TOAST_ICON = { success: '✓', error: '✕', info: 'ℹ' };

export function toast(msg, type = 'info') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  const icon = TOAST_ICON[type] || TOAST_ICON.info;
  el.className = `toast toast-${type} show`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${esc(msg)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function modalValue(res) {
  return res && typeof res === 'object' && 'value' in res ? res.value : res;
}

export function modalForm(res) {
  if (!res || typeof res !== 'object' || !res.form) return null;
  const fd = new FormData();
  for (const [k, v] of Object.entries(res.form)) fd.append(k, v);
  return fd;
}

export function confirmDialog(title, message) {
  return openModal({
    title,
    body: `<p class="modal-text">${message}</p>`,
    actions: [
      { label: '취소', value: false },
      { label: '확인', value: true, primary: true },
    ],
  });
}

export function formField(label, html, hint = '') {
  return `<label class="field">
    <span class="field-label">${label}</span>
    ${html}
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </label>`;
}

export function emptyState(icon, title, desc, btnLabel, btnId) {
  return `<div class="empty-state">
    <span class="empty-icon">${icon}</span>
    <p class="empty-title">${title}</p>
    <p class="empty-desc">${desc}</p>
    ${btnLabel ? `<button type="button" class="btn btn-primary" id="${btnId}">${btnLabel}</button>` : ''}
  </div>`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('클립보드에 복사했습니다', 'success');
    return true;
  } catch {
    toast('복사에 실패했습니다', 'error');
    return false;
  }
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

export function bindAmountPreview(form, inputName = 'amount') {
  const input = form?.querySelector(`[name="${inputName}"]`);
  if (!input) return;
  let hint = form.querySelector('.amount-preview');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'amount-preview field-hint';
    input.after(hint);
  }
  const update = () => {
    const n = Number(input.value);
    hint.textContent = n > 0 ? `₩${new Intl.NumberFormat('ko-KR').format(n)}원` : '';
  };
  input.addEventListener('input', update);
  update();
}
