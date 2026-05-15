import { state, persist } from './state.js';
import { save } from './store.js';
import {
  initSync, bindHouseholdSync, pullFromCloud, pushToCloud, scheduleSyncPush,
  ensureHouseholdId, isSyncEnabled, applyRemotePayload,
} from './sync.js';

let bootstrapped = false;

export async function setupCloudSync() {
  const ok = await initSync({
    onRemoteChange: (payload, updatedAt) => {
      state.data = applyRemotePayload(state.data, payload, updatedAt);
      save(state.data);
      import('./views/index.js').then((m) => m.renderApp());
    },
  });
  if (!ok) return false;

  if (state.data.auth.loggedIn && state.data.auth.onboardingDone) {
    ensureHouseholdId(state.data);
    if (state.data.auth.householdId) {
      state.data = await pullFromCloud(state.data);
      save(state.data);
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
  state.data = await pullFromCloud(state.data);
  save(state.data);
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
  state.data = await pullFromCloud(state.data);
  save(state.data);
  import('./views/index.js').then((m) => m.renderApp());
  return true;
}
