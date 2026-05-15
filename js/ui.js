let modalEl;
let toastTimer;
let activeOverlay = null;

export function initUI() {
  modalEl = document.getElementById('modal-root');
}

export function openModal({ title, body, actions = [] }) {
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
    const finish = (value) => {
      if (overlay.dataset.closing) return;
      overlay.dataset.closing = '1';
      closeModal(overlay);
      resolve(value);
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

const TOAST_ICON = { success: '??, error: '??, info: '?? };

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

export function confirmDialog(title, message) {
  return openModal({
    title,
    body: `<p class="modal-text">${message}</p>`,
    actions: [
      { label: '취소', value: false },
      { label: '?�인', value: true, primary: true },
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
    toast('?�립보드??복사?�습?�다', 'success');
    return true;
  } catch {
    toast('복사???�패?�습?�다', 'error');
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
    hint.textContent = n > 0 ? `??${new Intl.NumberFormat('ko-KR').format(n)}?? : '';
  };
  input.addEventListener('input', update);
  update();
}
