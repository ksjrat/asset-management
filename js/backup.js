import { replaceData, KEY } from './store.js';

export function exportJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sej-ledger-${data.year}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJsonFile(file, { merge = false } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        resolve(replaceData(parsed));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function copyJsonToClipboard(data) {
  return navigator.clipboard.writeText(JSON.stringify(data, null, 2));
}
