import { state, persist } from './state.js';
import { save, saveSafetyBackup, hasUserFinancialData } from './store.js';
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
  saveSafetyBackup(state.data);
  state.data = data;
  save(state.data);
  if (rejectedEmptyRemote) {
    toast('빈 클라우드 데이터는 덮어쓰지 않았습니다', 'info');
    if (hasCloudPassphraseSession()) await pushToCloud(state.data);
  }
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
      const result = applyRemotePayload(state.data, payload, updatedAt);
      await applyPullResult(result);
      import('./views/index.js').then((m) => m.renderApp());
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
  saveSafetyBackup(state.data);
  await applyPullResult(await pullFromCloud(state.data));
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
