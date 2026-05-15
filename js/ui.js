export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let modalOverlay;
let modalEl;
let onCloseModal;

export function initUi() {
  modalOverlay = $('#modal-overlay');
  modalEl = $('#modal');
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

export function openModal(html, onMount) {
  modalEl.innerHTML = html;
  modalOverlay.classList.remove('hidden');
  if (onMount) onMount(modalEl);
}

export function closeModal() {
  modalOverlay.classList.add('hidden');
  if (onCloseModal) onCloseModal();
}

export function setModalCloseHandler(fn) {
  onCloseModal = fn;
}
