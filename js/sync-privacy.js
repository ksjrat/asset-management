/** 클라우드 동기화 시 개인·비공개 데이터 분리 */

import { mergeBudgetObjects } from './budget-data.js';
import { ensureTombstones, pruneTombstones } from './change-tracker.js';

export function stripPrivateAssets(assets) {
  if (!assets?.items) return assets;
  return {
    ...assets,
    items: assets.items.filter((i) => !i.private),
  };
}

export function recordTime(row) {
  return Number(row?.updatedAt) || Date.parse(row?.updatedAt) || Date.parse(row?.createdAt) || 0;
}

export function mergeTombstones(a, b) {
  const cols = ['assets', 'transactions', 'goals', 'recurring'];
  function colMap(src, col) {
    if (!src) return {};
    if (src.tombstones) return src.tombstones[col] || {};
    return src[col] || {};
  }
  const out = {};
  for (const col of cols) {
    out[col] = {};
    const left = colMap(a, col);
    const right = colMap(b, col);
    for (const id of new Set([...Object.keys(left), ...Object.keys(right)])) {
      out[col][id] = Math.max(Number(left[id]) || 0, Number(right[id]) || 0);
    }
  }
  return out;
}

function tombstonesLocalAhead(localTombs, remoteTombs) {
  const cols = ['assets', 'transactions', 'goals', 'recurring'];
  for (const col of cols) {
    const left = localTombs?.[col] || {};
    const right = remoteTombs?.[col] || {};
    for (const [id, ts] of Object.entries(left)) {
      const remoteTs = right[id];
      if (remoteTs == null || remoteTs === '' || Number(ts) > Number(remoteTs)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * id별 recordTime이 큰 쪽 채택(같으면 로컬). tombs[id] >= recordTime(row)이면 제거.
 * @returns {{ rows: object[], localAhead: boolean }}
 */
export function mergeCollection(localArr = [], remoteArr = [], tombs = {}) {
  const localById = new Map();
  for (const row of localArr || []) {
    if (row?.id) localById.set(row.id, row);
  }
  const remoteById = new Map();
  for (const row of remoteArr || []) {
    if (row?.id) remoteById.set(row.id, row);
  }

  const map = new Map();
  for (const row of localArr || []) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of remoteArr || []) {
    if (!row?.id) continue;
    const prev = map.get(row.id);
    if (!prev || recordTime(row) > recordTime(prev)) {
      map.set(row.id, row);
    }
  }
  const rows = [...map.values()].filter((row) => {
    const t = tombs?.[row.id];
    if (t == null || t === '') return true;
    return !(Number(t) >= recordTime(row));
  });

  let localAhead = false;
  for (const row of rows) {
    if (row.private) continue;
    const remote = remoteById.get(row.id);
    if (!remote) {
      localAhead = true;
      break;
    }
    const local = localById.get(row.id);
    if (local && recordTime(local) > recordTime(remote)) {
      localAhead = true;
      break;
    }
  }
  return { rows, localAhead };
}

export function mergeAssetsPreservingPrivate(localItems, remoteItems, tombs = {}) {
  const privateLocal = (localItems || []).filter((i) => i.private);
  const localPublic = (localItems || []).filter((i) => !i.private);
  const remotePublic = (remoteItems || []).filter((i) => !i.private);
  const { rows: mergedPublic, localAhead } = mergeCollection(localPublic, remotePublic, tombs);
  const rows = [...mergedPublic];
  for (const p of privateLocal) {
    const idx = rows.findIndex((i) => i.id === p.id);
    if (idx >= 0) rows[idx] = p;
    else rows.push(p);
  }
  return { rows, localAhead };
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

function recordTimeMemo(row) {
  return new Date(row?.updatedAt || row?.createdAt || row?.at || 0).getTime();
}

/** 메모: 항목별 updatedAt 기준 병합 */
function mergeRecordsByUpdatedAt(localArr = [], remoteArr = []) {
  const map = new Map();
  function upsert(row) {
    if (!row?.id) return;
    const prev = map.get(row.id);
    if (!prev || recordTimeMemo(row) >= recordTimeMemo(prev)) {
      map.set(row.id, row);
    }
  }
  for (const row of localArr) upsert(row);
  for (const row of remoteArr) upsert(row);
  return [...map.values()];
}

export function mergePayloadPreservingPrivate(local, remotePayload) {
  if (!remotePayload) return local;
  ensureTombstones(local);
  if (remotePayload.tombstones) ensureTombstones(remotePayload);
  else remotePayload.tombstones = { assets: {}, transactions: {}, goals: {}, recurring: {} };

  const tombs = mergeTombstones(local, remotePayload);
  const merged = { ...local, ...remotePayload };
  let assetsAhead = false;
  if (remotePayload.assets || local.assets) {
    const assetMerge = mergeAssetsPreservingPrivate(
      local.assets?.items,
      remotePayload.assets?.items,
      tombs.assets,
    );
    assetsAhead = assetMerge.localAhead;
    merged.assets = {
      ...(local.assets || {}),
      ...(remotePayload.assets || {}),
      items: assetMerge.rows,
    };
  }
  if (remotePayload.budget || local.budget) {
    merged.budget = mergeBudgetObjects(local.budget, remotePayload.budget);
  }
  const tx = mergeCollection(
    local.transactions, remotePayload.transactions, tombs.transactions,
  );
  const goals = mergeCollection(local.goals, remotePayload.goals, tombs.goals);
  const recurring = mergeCollection(
    local.recurring, remotePayload.recurring, tombs.recurring,
  );
  merged.transactions = tx.rows;
  merged.goals = goals.rows;
  merged.recurring = recurring.rows;
  merged.memos = mergeRecordsByUpdatedAt(local.memos, remotePayload.memos);
  merged.tombstones = pruneTombstones(tombs);
  if (remotePayload.settings || local.settings) {
    merged.settings = {
      ...(local.settings || {}),
      ...(remotePayload.settings || {}),
    };
  }
  const tombsAhead = tombstonesLocalAhead(local.tombstones, remotePayload.tombstones);
  merged._needsPush = !!(
    assetsAhead || tx.localAhead || goals.localAhead || recurring.localAhead || tombsAhead
  );
  return merged;
}
