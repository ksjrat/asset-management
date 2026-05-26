import { fmtAmountHint } from './format.js';

let modalEl;
let toastTimer;
let activeOverlay = null;

const AMOUNT_INPUT_SELECTOR = [
  'input.input-amount',
  'input[name="amount"]',
  'input[name="targetAmount"]',
  'input[name="monthlyContribution"]',
].join(', ');

export function initUI() {
  modalEl = document.getElementById('modal-root');
}

function setModalFormError(sheet, message) {
  const body = sheet.querySelector('.modal-body');
  if (!body) return;
  let el = body.querySelector('.modal-form-error');
  if (!message) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.className = 'modal-form-error';
    el.setAttribute('role', 'alert');
    body.prepend(el);
  }
  el.textContent = message;
}

export function openModal({ title, body, actions = [], onOpen, beforeFinish }) {
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
    const tryFinish = (value) => {
      const form = snapshotForm();
      if (beforeFinish) {
        const err = beforeFinish(value, form);
        if (err) {
          setModalFormError(sheet, err);
          (sheet.querySelector('input[name="pass"]') || sheet.querySelector('input'))?.focus();
          return;
        }
      }
      setModalFormError(sheet, '');
      finish(value);
    };
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${act.primary ? 'btn-primary' : act.danger ? 'btn-danger' : 'btn-ghost'}`;
      btn.textContent = act.label;
      btn.addEventListener('click', () => tryFinish(act.value ?? act.label));
      actionsEl.appendChild(btn);
    }
    const formEl = sheet.querySelector('form');
    if (formEl) {
      formEl.setAttribute('novalidate', '');
      formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        const primary = actions.find((a) => a.primary);
        if (primary) tryFinish(primary.value ?? primary.label);
      });
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
    const firstInput = sheet.querySelector('input, select, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 120);
    requestAnimationFrame(() => {
      if (onOpen) onOpen(sheet);
      bindAmountPreviewsIn(sheet);
    });
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

export function bindAmountPreviewsIn(root) {
  if (!root) return;
  root.querySelectorAll(AMOUNT_INPUT_SELECTOR).forEach(bindAmountPreviewInput);
}

export function bindAmountPreview(form, inputName = 'amount') {
  const input = form?.querySelector(`[name="${inputName}"]`);
  if (input) bindAmountPreviewInput(input);
}

function bindAmountPreviewInput(input) {
  if (!input || input.dataset.amountPreviewBound) return;
  input.dataset.amountPreviewBound = '1';
  let hint = input.nextElementSibling?.classList?.contains('amount-preview')
    ? input.nextElementSibling
    : null;
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'amount-preview';
    hint.setAttribute('aria-live', 'polite');
    input.after(hint);
  }
  const update = () => {
    hint.textContent = fmtAmountHint(input.value);
  };
  input.addEventListener('input', update);
  update();
}
