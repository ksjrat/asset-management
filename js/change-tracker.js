/** 로컬 편집 감지: updatedAt 스탬프 + tombstone 자동 기록 */

const TRACKED = {
  assets: (d) => d.assets?.items,
  transactions: (d) => d.transactions,
  goals: (d) => d.goals,
  recurring: (d) => d.recurring,
};

const COLLECTION_KEYS = Object.keys(TRACKED);

/** @type {Map<string, Map<string, string>>} */
let baseline = new Map();

const DEFAULT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

function serializeForCompare(row) {
  const copy = { ...row };
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

export function ensureTombstones(data) {
  if (!data.tombstones || typeof data.tombstones !== 'object') {
    data.tombstones = { assets: {}, transactions: {}, goals: {}, recurring: {} };
  }
  for (const col of COLLECTION_KEYS) {
    if (!data.tombstones[col] || typeof data.tombstones[col] !== 'object') {
      data.tombstones[col] = {};
    }
  }
  return data.tombstones;
}

/** 현재 data 기준으로 baseline만 다시 만든다. 스탬프는 찍지 않는다. */
export function resetChangeBaseline(data) {
  ensureTombstones(data);
  const next = new Map();
  for (const [col, getter] of Object.entries(TRACKED)) {
    const map = new Map();
    for (const row of getter(data) || []) {
      if (row?.id) map.set(row.id, serializeForCompare(row));
    }
    next.set(col, map);
  }
  baseline = next;
}

/**
 * baseline 대비 추가·수정 → updatedAt(ms), 삭제 → tombstones.
 * 끝나면 resetChangeBaseline(data).
 */
export function stampLocalChanges(data, now = Date.now()) {
  ensureTombstones(data);
  for (const [col, getter] of Object.entries(TRACKED)) {
    const base = baseline.get(col) || new Map();
    const arr = getter(data) || [];
    const seen = new Set();
    for (const row of arr) {
      if (!row?.id) continue;
      seen.add(row.id);
      const prev = base.get(row.id);
      if (prev === undefined || prev !== serializeForCompare(row)) {
        row.updatedAt = now;
      }
    }
    for (const id of base.keys()) {
      if (!seen.has(id)) {
        data.tombstones[col][id] = now;
      }
    }
  }
  resetChangeBaseline(data);
}

/**
 * 백업 복구: 사라진 것만 되살린다.
 * - prev에 없거나 prev tombstone이 있는 행 → updatedAt=now, 해당 tombstone 제거
 * - 그 외 행 → 백업 updatedAt 유지
 * - tombstones는 prev 기준 복사 후 되살린 id만 제거(백업 이후 정상 삭제 유지)
 */
export function markRestored(data, prevData, now = Date.now()) {
  const prevTombs = {
    assets: { ...(prevData?.tombstones?.assets || {}) },
    transactions: { ...(prevData?.tombstones?.transactions || {}) },
    goals: { ...(prevData?.tombstones?.goals || {}) },
    recurring: { ...(prevData?.tombstones?.recurring || {}) },
  };
  data.tombstones = {
    assets: { ...prevTombs.assets },
    transactions: { ...prevTombs.transactions },
    goals: { ...prevTombs.goals },
    recurring: { ...prevTombs.recurring },
  };

  for (const [col, getter] of Object.entries(TRACKED)) {
    const prevIds = new Set();
    for (const row of getter(prevData) || []) {
      if (row?.id) prevIds.add(row.id);
    }
    for (const row of getter(data) || []) {
      if (!row?.id) continue;
      const missingInPrev = !prevIds.has(row.id);
      const hadTomb = prevTombs[col][row.id] != null && prevTombs[col][row.id] !== '';
      if (missingInPrev || hadTomb) {
        row.updatedAt = now;
        delete data.tombstones[col][row.id];
      }
    }
  }
  resetChangeBaseline(data);
}

/** tombstones 객체만 받아 오래된 항목을 제거한 새 객체를 반환한다(입력 불변). */
export function pruneTombstones(tombs, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs;
  const out = { assets: {}, transactions: {}, goals: {}, recurring: {} };
  for (const col of COLLECTION_KEYS) {
    for (const [id, ts] of Object.entries(tombs?.[col] || {})) {
      const n = Number(ts);
      if (Number.isFinite(n) && n >= cutoff) out[col][id] = n;
    }
  }
  return out;
}
