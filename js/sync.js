import { save, load, replaceData } from './store.js';

function firestoreUrl(projectId, collection, docId, apiKey) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}?key=${apiKey}`;
}

function toFirestoreFields(obj) {
  return {
    fields: {
      payload: { stringValue: JSON.stringify(obj) },
      updatedAt: { stringValue: new Date().toISOString() },
    },
  };
}

function fromFirestoreDoc(doc) {
  const raw = doc?.fields?.payload?.stringValue;
  if (!raw) return null;
  return JSON.parse(raw);
}

export function isSyncConfigured(settings) {
  const s = settings?.sync;
  return !!(s?.enabled && s?.apiKey && s?.projectId && s?.collection && s?.docId);
}

export async function pullFromCloud(data) {
  const s = data.settings.sync;
  if (!isSyncConfigured(data.settings)) throw new Error('동기화 설정이 없습니다.');

  const res = await fetch(firestoreUrl(s.projectId, s.collection, s.docId, s.apiKey));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('클라우드 불러오기 실패: ' + res.status);
  const doc = await res.json();
  return fromFirestoreDoc(doc);
}

export async function pushToCloud(data) {
  const s = data.settings.sync;
  if (!isSyncConfigured(data.settings)) throw new Error('동기화 설정이 없습니다.');

  const url = firestoreUrl(s.projectId, s.collection, s.docId, s.apiKey);
  const body = toFirestoreFields(data);
  let res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 404) {
    res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${s.projectId}/databases/(default)/documents/${s.collection}?documentId=${s.docId}&key=${s.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
  }
  if (!res.ok) throw new Error('클라우드 저장 실패: ' + res.status);
  s.lastSyncAt = new Date().toISOString();
  save(data);
  return true;
}

export async function syncMerge(data, strategy = 'newer') {
  const remote = await pullFromCloud(data);
  if (!remote) return data;
  if (strategy === 'replace') return replaceData(remote);
  const localAt = data.settings.sync?.lastSyncAt || '';
  const remoteAt = remote.settings?.sync?.lastSyncAt || remote.version || '';
  if (remoteAt > localAt) return replaceData(remote);
  return data;
}
