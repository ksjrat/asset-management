import { state, persist } from './state.js';
import { save, saveSafetyBackup, hasUserFinancialData, dataFootprint, countBudgetActualEntries, ensureAppSettings, setHomeOwnerFilter, refreshAutoSnapshots } from './store.js';
import { finalizeBudgetAfterSync } from './budget-data.js';
import {
  initSync, bindHouseholdSync, pullFromCloud, pushToCloud, scheduleSyncPush,
  ensureHouseholdId, isSyncEnabled, applyRemotePayload,
  hasCloudPassphraseSession, restoreCloudPassphrase, persistCloudPassphrase,
  hasStoredCloudPassphrase, getSyncDiagnostics,
} from './sync.js';
import { toast } from './ui.js';

let bootstrapped = false;
let initPromise = null;
let liveSyncBound = false;

export function ensureCloudPassphraseLoaded() {
  const hid = ensureHouseholdId(state.data);
  if (!hid) return false;
  if (hasCloudPassphraseSession()) return true;
  return restoreCloudPassphrase(hid);
}

export function isCloudSyncActive() {
  if (!isSyncEnabled()) return false;
  const hid = state.data.auth.householdId || state.data.auth.inviteCode;
  if (!hid) return false;
  ensureCloudPassphraseLoaded();
  return hasCloudPassphraseSession() && !!state.data._syncMeta?.autoSync;
}

async function applyPullResult(result, { silent = false } = {}) {
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
    && (dataFootprint(data) < dataFootprint(before)
      || countBudgetActualEntries(data) < countBudgetActualEntries(before));

  if (rejectedEmptyRemote || wouldShrink) {
    if (hasCloudPassphraseSession() && hasUserFinancialData(before)) {
      await pushToCloud(before);
    }
    if (!silent) {
      toast(
        rejectedEmptyRemote
          ? '빈 클라우드 데이터는 덮어쓰지 않았습니다'
          : '이 기기 데이터가 더 많아 클라우드 덮어쓰기를 막았습니다',
        'info',
      );
    }
    return { status: 'local-kept' };
  }

  const changed = dataFootprint(data) !== dataFootprint(before)
    || JSON.stringify(data.transactions) !== JSON.stringify(before.transactions)
    || JSON.stringify(data.budget?.subActuals) !== JSON.stringify(before.budget?.subActuals);

  state.data = data;
  ensureAppSettings(state.data);
  finalizeBudgetAfterSync(state.data);
  refreshAutoSnapshots(state.data);
  state.ownerFilter = setHomeOwnerFilter(state.data, state.ownerFilter);
  state.data._syncMeta = {
    ...(state.data._syncMeta || {}),
    autoSync: true,
    lastMergedAt: data._syncMeta?.lastMergedAt || Date.now(),
  };
  save(state.data);

  if (!silent && changed) {
    toast('다른 기기와 데이터가 맞춰졌습니다', 'success');
  }
  return { status: status || 'ok' };
}

async function handleRemoteChange(payload, updatedAt) {
  if (!hasCloudPassphraseSession()) return;
  const result = applyRemotePayload(state.data, payload, updatedAt);
  const { status } = await applyPullResult(result, { silent: true });
  if (status !== 'local-kept') {
    import('./views/index.js').then((m) => m.renderApp());
  }
}

export async function startLiveSync() {
  if (!isSyncEnabled() || !ensureCloudPassphraseLoaded()) return false;
  const hid = ensureHouseholdId(state.data);
  if (!hid) return false;
  if (!liveSyncBound) {
    await bindHouseholdSync(state.data);
    liveSyncBound = true;
  }
  return true;
}

/** 가족 코드·암호 설정 후 한 번에 연결 + 실시간 동기화 시작 */
export async function connectCloudSync({ pass, remember = true } = {}) {
  const ready = await ensureSyncReady();
  if (!ready) return { ok: false, reason: 'off' };

  const hid = ensureHouseholdId(state.data);
  if (!hid) return { ok: false, reason: 'no-code' };

  if (pass) {
    if (remember) persistCloudPassphrase(pass, hid);
    else persistCloudPassphrase(pass, hid);
  } else if (!ensureCloudPassphraseLoaded()) {
    return { ok: false, reason: 'no-pass' };
  }

  saveSafetyBackup(state.data);
  const pull = await pullFromCloud(state.data);
  if (pull.status === 'bad-pass') return { ok: false, reason: 'bad-pass' };
  const { status } = await applyPullResult(pull, { silent: false });

  if (status === 'error') {
    return { ok: false, reason: 'error' };
  }

  await startLiveSync();
  if (hasUserFinancialData(state.data)) {
    await pushToCloud(state.data);
  }

  state.data._syncMeta = { ...(state.data._syncMeta || {}), autoSync: true };
  persist();
  return { ok: true, reason: status === 'local-kept' ? 'uploaded' : 'ok' };
}

export async function ensureSyncReady() {
  if (bootstrapped) return isSyncEnabled();
  if (!initPromise) initPromise = setupCloudSync();
  return initPromise;
}

export async function setupCloudSync() {
  const ok = await initSync({
    onRemoteChange: async (payload, updatedAt) => {
      await handleRemoteChange(payload, updatedAt);
    },
  });
  if (!ok) return false;

  if (state.data.auth.onboardingDone) {
    ensureHouseholdId(state.data);
    if (state.data.auth.householdId && ensureCloudPassphraseLoaded()) {
      saveSafetyBackup(state.data);
      state.data._syncMeta = { ...(state.data._syncMeta || {}), autoSync: true };
      await startLiveSync();
      const pull = await pullFromCloud(state.data);
      await applyPullResult(pull, { silent: true });
      if (hasUserFinancialData(state.data)) {
        await pushToCloud(state.data);
      }
      persist();
    }
  }
  bootstrapped = true;
  return true;
}

export function syncAfterPersist() {
  if (!isSyncEnabled() || !ensureCloudPassphraseLoaded()) return;
  ensureHouseholdId(state.data);
  scheduleSyncPush(state.data);
}

export async function syncJoinHousehold(_code) {
  return connectCloudSync({});
}

export async function syncEnsureHousehold() {
  if (!isSyncEnabled() || !ensureCloudPassphraseLoaded()) return;
  ensureHouseholdId(state.data);
  if (!state.data.auth.householdId) return;
  await pushToCloud(state.data);
  await startLiveSync();
}

export async function syncManualRefresh() {
  const ready = await ensureSyncReady();
  if (!ready) return { ok: false, reason: 'off' };
  if (!ensureCloudPassphraseLoaded()) return { ok: false, reason: 'no-pass' };

  ensureHouseholdId(state.data);
  if (!state.data.auth.householdId) {
    return { ok: false, reason: 'no-code' };
  }

  saveSafetyBackup(state.data);
  const pull = await pullFromCloud(state.data);
  if (pull.status === 'bad-pass') return { ok: false, reason: 'bad-pass' };
  const { status } = await applyPullResult(pull, { silent: false });

  if (status === 'bad-pass') return { ok: false, reason: 'bad-pass' };
  if (status === 'error') return { ok: false, reason: 'error' };

  await startLiveSync();

  const pushResult = hasUserFinancialData(state.data)
    ? await pushToCloud(state.data)
    : { ok: false };

  if (!pushResult.ok && pushResult.reason === 'error') {
    return { ok: false, reason: 'error' };
  }

  state.data._syncMeta = { ...(state.data._syncMeta || {}), autoSync: true };
  persist();
  import('./views/index.js').then((m) => m.renderApp());

  if (status === 'no-doc' || pull.status === 'no-doc') {
    return { ok: true, reason: 'uploaded' };
  }
  if (status === 'local-kept') {
    return { ok: true, reason: pushResult.ok ? 'uploaded' : 'local-kept' };
  }
  return { ok: true, reason: status === 'ok' ? 'ok' : 'local-only' };
}

export function getCloudSyncDiagnostics() {
  return getSyncDiagnostics(state.data);
}
