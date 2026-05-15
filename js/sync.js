import { deepMerge } from './merge.js';
import { DATA_VERSION } from './store.js';

const FIREBASE_VER = '10.14.1';

let enabled = false;
let db = null;
let firestoreApi = null;
let unsubscribe = null;
let pushTimer = null;
let lastPushAt = 0;
let applyingRemote = false;
let onRemoteChange = null;

async function loadFirebase() {
  if (firestoreApi) return firestoreApi;
  const [appMod, fsMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-firestore.js`),
  ]);
  firestoreApi = {
    initializeApp: appMod.initializeApp,
    getFirestore: fsMod.getFirestore,
    doc: fsMod.doc,
    getDoc: fsMod.getDoc,
    setDoc: fsMod.setDoc,
    onSnapshot: fsMod.onSnapshot,
  };
  return firestoreApi;
}

export function extractSyncPayload(data) {
  return {
    version: DATA_VERSION,
    assets: data.assets,
    goals: data.goals,
    budget: data.budget,
    transactions: data.transactions,
    recurring: data.recurring,
    guideChecks: data.guideChecks,
    settings: {
      snapshotDay: data.settings?.snapshotDay,
      hiddenCategories: data.settings?.hiddenCategories || [],
    },
    auth: {
      spouseName: data.auth.spouseName,
      spouseConnected: data.auth.spouseConnected,
      inviteCode: data.auth.inviteCode,
      inviteExpiresAt: data.auth.inviteExpiresAt,
      householdId: data.auth.householdId,
    },
  };
}

function preserveLocalAuth(local, merged) {
  merged.auth.userName = local.auth.userName;
  merged.auth.userEmail = local.auth.userEmail;
  merged.auth.loggedIn = local.auth.loggedIn;
  merged.auth.biometricEnabled = local.auth.biometricEnabled;
  merged.auth.appPasswordSet = local.auth.appPasswordSet;
  merged.auth.policyAccepted = local.auth.policyAccepted;
  merged.auth.policyVersion = local.auth.policyVersion;
  merged.auth.onboardingDone = local.auth.onboardingDone;
  if (local.settings) merged.settings.lockOnLaunch = local.settings.lockOnLaunch;
  merged.policyConsents = local.policyConsents;
  return merged;
}

export function applyRemotePayload(local, remotePayload, remoteUpdatedAt) {
  if (!remotePayload) return local;
  const localMerged = local._syncMeta?.lastMergedAt || 0;
  if (remoteUpdatedAt && remoteUpdatedAt <= localMerged) return local;

  const merged = deepMerge(structuredClone(local), remotePayload);
  preserveLocalAuth(local, merged);
  merged._syncMeta = { ...(local._syncMeta || {}), lastMergedAt: remoteUpdatedAt || Date.now() };
  return merged;
}

export function ensureHouseholdId(data) {
  if (!data.auth.householdId && data.auth.inviteCode) {
    data.auth.householdId = data.auth.inviteCode;
  }
  return data.auth.householdId;
}

export function isSyncEnabled() {
  return enabled;
}

export function getSyncStatus(data) {
  if (!enabled) return 'off';
  if (!data || !ensureHouseholdId(data)) return 'no-code';
  return 'on';
}

export async function initSync(handlers = {}) {
  onRemoteChange = handlers.onRemoteChange || null;
  let config;
  try {
    config = await import('./sync-config.js');
  } catch {
    return false;
  }
  if (!config.SYNC_ENABLED || !config.firebaseConfig?.projectId) return false;

  try {
    const api = await loadFirebase();
    const app = api.initializeApp(config.firebaseConfig);
    db = api.getFirestore(app);
    enabled = true;
    return true;
  } catch (e) {
    console.warn('Sync init failed', e);
    enabled = false;
    return false;
  }
}

export async function bindHouseholdSync(data) {
  if (!enabled || !db) return;
  const hid = ensureHouseholdId(data);
  if (!hid) return;

  const { doc, onSnapshot } = firestoreApi;
  if (unsubscribe) unsubscribe();

  unsubscribe = onSnapshot(doc(db, 'households', hid), (snap) => {
    if (!snap.exists() || applyingRemote) return;
    const { payload, updatedAt } = snap.data();
    if (!payload) return;
    if (updatedAt && Math.abs(updatedAt - lastPushAt) < 500) return;

    applyingRemote = true;
    try {
      onRemoteChange?.(payload, updatedAt);
    } finally {
      applyingRemote = false;
    }
  });
}

export async function pullFromCloud(data) {
  if (!enabled || !db) return data;
  const hid = ensureHouseholdId(data);
  if (!hid) return data;

  try {
    const { doc, getDoc } = firestoreApi;
    const snap = await getDoc(doc(db, 'households', hid));
    if (!snap.exists()) return data;
    const { payload, updatedAt } = snap.data();
    return applyRemotePayload(data, payload, updatedAt);
  } catch (e) {
    console.warn('Pull failed', e);
    return data;
  }
}

export async function pushToCloud(data) {
  if (!enabled || !db || applyingRemote) return;
  const hid = ensureHouseholdId(data);
  if (!hid) return;

  try {
    const { doc, setDoc } = firestoreApi;
    const updatedAt = Date.now();
    lastPushAt = updatedAt;
    await setDoc(doc(db, 'households', hid), {
      payload: extractSyncPayload(data),
      updatedAt,
      version: DATA_VERSION,
    }, { merge: true });
    data._syncMeta = { ...(data._syncMeta || {}), lastPushedAt: updatedAt, lastMergedAt: updatedAt };
  } catch (e) {
    console.warn('Push failed', e);
  }
}

export function scheduleSyncPush(data) {
  if (!enabled) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushToCloud(data), 800);
}

export function joinHousehold(data, code) {
  const hid = code.trim().toUpperCase();
  data.auth.householdId = hid;
  data.auth.inviteCode = hid;
  return hid;
}

export async function teardownSync() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
