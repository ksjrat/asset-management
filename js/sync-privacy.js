/** 클라우드 동기화 시 개인·비공개 데이터 분리 */

import { mergeBudgetObjects } from './budget-data.js';

export function stripPrivateAssets(assets) {
  if (!assets?.items) return assets;
  return {
    ...assets,
    items: assets.items.filter((i) => !i.private),
  };
}

export function mergeAssetsPreservingPrivate(localItems, remoteItems) {
  const privateLocal = (localItems || []).filter((i) => i.private);
  const remoteById = new Map((remoteItems || []).filter((i) => !i.private).map((i) => [i.id, i]));
  const merged = [...remoteById.values()];
  for (const p of privateLocal) {
    const idx = merged.findIndex((i) => i.id === p.id);
    if (idx >= 0) merged[idx] = p;
    else merged.push(p);
  }
  return merged;
}

export function stripSensitiveFromPayload(payload) {
  if (!payload) return payload;
  const next = { ...payload };
  if (next.assets) next.assets = stripPrivateAssets(next.assets);
  if (next.auth) {
    next.auth = { ...next.auth };
    delete next.auth.userName;
    delete next.auth.userEmail;
  }
  return next;
}

function mergeRecordsById(localArr = [], remoteArr = []) {
  const map = new Map();
  for (const row of localArr) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of remoteArr) {
    if (row?.id) map.set(row.id, row);
  }
  return [...map.values()];
}

export function mergePayloadPreservingPrivate(local, remotePayload) {
  if (!remotePayload) return local;
  const merged = { ...local, ...remotePayload };
  if (remotePayload.assets || local.assets) {
    merged.assets = {
      ...(local.assets || {}),
      ...(remotePayload.assets || {}),
      items: mergeAssetsPreservingPrivate(
        local.assets?.items,
        remotePayload.assets?.items,
      ),
    };
  }
  if (remotePayload.budget || local.budget) {
    merged.budget = mergeBudgetObjects(local.budget, remotePayload.budget);
  }
  merged.transactions = mergeRecordsById(local.transactions, remotePayload.transactions);
  merged.goals = mergeRecordsById(local.goals, remotePayload.goals);
  merged.recurring = mergeRecordsById(local.recurring, remotePayload.recurring);
  merged.memos = mergeRecordsById(local.memos, remotePayload.memos);
  if (remotePayload.settings || local.settings) {
    merged.settings = {
      ...(local.settings || {}),
      ...(remotePayload.settings || {}),
    };
  }
  return merged;
}
