let modalEl;
let toastTimer;

export function initUI() {
  modalEl = document.getElementById('modal-root');
}

export function openModal({ title, body, actions = [] }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet" role="dialog" aria-labelledby="modal-title">
        <div class="modal-handle"></div>
        <h2 class="modal-title" id="modal-title">${title}</h2>
        <div class="modal-body">${body}</div>
        <div class="modal-actions"></div>
      </div>
    `;
    const sheet = overlay.querySelector('.modal-sheet');
    const actionsEl = overlay.querySelector('.modal-actions');
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${act.primary ? 'btn-primary' : act.danger ? 'btn-danger' : 'btn-ghost'}`;
      btn.textContent = act.label;
      btn.addEventListener('click', () => {
        closeModal(overlay);
        resolve(act.value ?? act.label);
      });
      actionsEl.appendChild(btn);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
        resolve(null);
      }
    });
    modalEl.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    const firstInput = sheet.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
  });
}

function closeModal(overlay) {
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 200);
}

export function toast(msg, type = 'info') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast toast-${type} show`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
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

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}
