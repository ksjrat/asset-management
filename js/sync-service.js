import { state, persist } from './state.js';
import { save, saveSafetyBackup, hasUserFinancialData, dataFootprint } from './store.js';
import {
  initSync, bindHouseholdSync, pullFromCloud, pushToCloud, scheduleSyncPush,
  ensureHouseholdId, isSyncEnabled, applyRemotePayload, hasCloudPassphraseSession,
} from './sync.js';
import { toast } from './ui.js';

let bootstrapped = false;
let initPromise = null;

async function applyPullResult(result) {
  if (!result || typeof result !== 'object' || !('data' in result)) {
    return { status: 'error' };
  }
  const { data, rejectedEmptyRemote, status } = result;
  if (!data || typeof data !== 'object' || !data.auth) {
    console.warn('Sync: invalid pull result, keeping local data');
    return { status: 'error' };
  }

  const before = state.data;
  saveSafetyBackup(before);

  const wouldShrink = hasUserFinancialData(before)
    && dataFootprint(data) < dataFootprint(before);

  if (rejectedEmptyRemote || wouldShrink) {
    if (hasCloudPassphraseSession() && hasUserFinancialData(before)) {
      await pushToCloud(before);
    }
    toast(
      rejectedEmptyRemote
        ? '빈 클라우드 데이터는 덮어쓰지 않았습니다'
        : '이 기기 데이터가 더 많아 클라우드 덮어쓰기를 막았습니다',
      'info',
    );
    return { status: 'local-kept' };
  }

  state.data = data;
  save(state.data);
  return { status: status || 'ok' };
}

export async function ensureSyncReady() {
  if (bootstrapped) return isSyncEnabled();
  if (!initPromise) initPromise = setupCloudSync();
  return initPromise;
}

export async function setupCloudSync() {
  const ok = await initSync({
    onRemoteChange: async (payload, updatedAt) => {
      // 이 기기에 이미 데이터가 있으면 자동 덮어쓰지 않음 (새로고침·업데이트 후 유실 방지)
      if (hasUserFinancialData(state.data)) {
        state.data._syncMeta = {
          ...(state.data._syncMeta || {}),
          remoteChangedAt: updatedAt || Date.now(),
        };
        return;
      }
      const result = applyRemotePayload(state.data, payload, updatedAt);
      const { status } = await applyPullResult(result);
      if (status !== 'local-kept') {
        import('./views/index.js').then((m) => m.renderApp());
      }
    },
  });
  if (!ok) return false;

  if (state.data.auth.onboardingDone) {
    ensureHouseholdId(state.data);
    if (state.data.auth.householdId) {
      saveSafetyBackup(state.data);
      // 앱을 열 때 자동 pull 하지 않음 — 빈 클라우드가 로컬을 덮는 것 방지. 받기는 「지금 동기화」에서.
      await bindHouseholdSync(state.data);
    }
  }
  bootstrapped = true;
  return true;
}

export function syncAfterPersist() {
  if (!isSyncEnabled()) return;
  ensureHouseholdId(state.data);
  scheduleSyncPush(state.data);
}

export async function syncJoinHousehold(code) {
  if (!isSyncEnabled()) return;
  const before = structuredClone(state.data);
  saveSafetyBackup(before);
  const pull = await pullFromCloud(before);
  if (hasUserFinancialData(before) && dataFootprint(pull.data) < dataFootprint(before)) {
    state.data = before;
    save(state.data);
    await pushToCloud(state.data);
    await bindHouseholdSync(state.data);
    toast('이 기기 데이터를 유지하고 클라우드에 올렸습니다', 'success');
    import('./views/index.js').then((m) => m.renderApp());
    return;
  }
  await applyPullResult(pull);
  await bindHouseholdSync(state.data);
  await pushToCloud(state.data);
}

export async function syncEnsureHousehold() {
  if (!isSyncEnabled()) return;
  ensureHouseholdId(state.data);
  if (!state.data.auth.householdId) return;
  await pushToCloud(state.data);
  await bindHouseholdSync(state.data);
}

export async function syncManualRefresh() {
  const ready = await ensureSyncReady();
  if (!ready) return { ok: false, reason: 'off' };
  if (!hasCloudPassphraseSession()) return { ok: false, reason: 'no-pass' };

  ensureHouseholdId(state.data);
  if (!state.data.auth.householdId) {
    return { ok: false, reason: 'no-code' };
  }

  saveSafetyBackup(state.data);
  const pull = await pullFromCloud(state.data);
  const { status } = await applyPullResult(pull);

  if (status === 'bad-pass') return { ok: false, reason: 'bad-pass' };
  if (status === 'error') return { ok: false, reason: 'error' };

  if (status === 'no-doc' || pull.status === 'no-doc') {
    await pushToCloud(state.data);
    await bindHouseholdSync(state.data);
    import('./views/index.js').then((m) => m.renderApp());
    return { ok: true, reason: 'uploaded' };
  }

  await bindHouseholdSync(state.data);
  if (hasCloudPassphraseSession() && hasUserFinancialData(state.data)) {
    await pushToCloud(state.data);
  }
  import('./views/index.js').then((m) => m.renderApp());
  return { ok: true, reason: status === 'ok' ? 'ok' : 'local-only' };
}
