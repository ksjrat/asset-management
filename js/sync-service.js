import { state, persist } from './state.js';
import { save, saveSafetyBackup } from './store.js';
import {
  initSync, bindHouseholdSync, pullFromCloud, pushToCloud, scheduleSyncPush,
  ensureHouseholdId, isSyncEnabled, applyRemotePayload, hasCloudPassphraseSession,
} from './sync.js';
import { toast } from './ui.js';

let bootstrapped = false;

async function applyPullResult(result) {
  const { data, rejectedEmptyRemote } = result;
  state.data = data;
  save(state.data);
  if (rejectedEmptyRemote) {
    toast('빈 클라우드 데이터는 덮어쓰지 않았습니다', 'info');
    if (hasCloudPassphraseSession()) await pushToCloud(state.data);
  }
  return state.data;
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
      await applyPullResult(await pullFromCloud(state.data));
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
  if (!isSyncEnabled() || !state.data.auth.householdId) return false;
  saveSafetyBackup(state.data);
  await applyPullResult(await pullFromCloud(state.data));
  import('./views/index.js').then((m) => m.renderApp());
  return true;
}
