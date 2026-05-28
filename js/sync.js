import { DATA_VERSION, dataFootprint, hasUserFinancialData } from './store.js';
import { stripSensitiveFromPayload, mergePayloadPreservingPrivate } from './sync-privacy.js';
import {
  encryptPayload, decryptPayload, hasCloudPassphraseSession, setCloudPassphraseSession,
  getCloudPassphraseSession,
} from './sync-crypto.js';

export {
  setCloudPassphraseSession, hasCloudPassphraseSession, clearCloudPassphraseSession,
  persistCloudPassphrase, restoreCloudPassphrase, clearStoredCloudPassphrase,
  hasStoredCloudPassphrase,
} from './sync-crypto.js';

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
  return stripSensitiveFromPayload({
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
  });
}

function preserveLocalAuth(local, merged) {
  merged.auth.userName = local.auth.userName;
  merged.auth.userEmail = local.auth.userEmail;
  merged.auth.loggedIn = local.auth.loggedIn;
  merged.auth.appPasswordSet = local.auth.appPasswordSet;
  merged.auth.appPasswordSalt = local.auth.appPasswordSalt;
  merged.auth.appPasswordHash = local.auth.appPasswordHash;
  merged.auth.policyAccepted = local.auth.policyAccepted;
  merged.auth.policyVersion = local.auth.policyVersion;
  merged.auth.onboardingDone = local.auth.onboardingDone;
  merged.auth.atStartScreen = local.auth.atStartScreen;
  if (local.settings) merged.settings.lockOnLaunch = local.settings.lockOnLaunch;
  merged.policyConsents = local.policyConsents;
  return merged;
}

/** 클라우드에 실질적인 금융 데이터가 있는지 (setupDone만으로는 빈 문서 판별 안 함) */
function remotePayloadHasUserData(payload) {
  if (!payload) return false;
  if (payload.assets?.items?.length) return true;
  if (payload.goals?.length) return true;
  if (payload.transactions?.length) return true;
  if (payload.budget?.categories?.length) return true;
  const plan = payload.budget?.monthlyPlan;
  if (plan && Object.keys(plan).length > 0) return true;
  return false;
}

export function applyRemotePayload(local, remotePayload, remoteUpdatedAt) {
  if (!remotePayload) return { data: local, rejectedEmptyRemote: false };
  const localMerged = local._syncMeta?.lastMergedAt || 0;
  if (remoteUpdatedAt && remoteUpdatedAt <= localMerged) {
    return { data: local, rejectedEmptyRemote: false };
  }

  if (hasUserFinancialData(local) && !remotePayloadHasUserData(remotePayload)) {
    return { data: local, rejectedEmptyRemote: true };
  }

  const merged = mergePayloadPreservingPrivate(structuredClone(local), remotePayload);
  preserveLocalAuth(local, merged);
  if (hasUserFinancialData(local) && dataFootprint(merged) < dataFootprint(local)) {
    return { data: local, rejectedEmptyRemote: true };
  }
  merged._syncMeta = { ...(local._syncMeta || {}), lastMergedAt: remoteUpdatedAt || Date.now() };
  return { data: merged, rejectedEmptyRemote: false };
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

async function unpackCloudDoc(snapData, householdId) {
  if (!snapData) return null;
  if (snapData.encrypted && snapData.envelope) {
    const pass = getCloudPassphraseSession();
    if (!pass) return null;
    return decryptPayload(snapData.envelope, pass, householdId);
  }
  return snapData.payload || null;
}

async function packCloudDoc(data, householdId) {
  const payload = extractSyncPayload(data);
  const pass = getCloudPassphraseSession();
  if (!pass) return null;
  const envelope = await encryptPayload(payload, pass, householdId);
  return { encrypted: true, envelope, version: DATA_VERSION };
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

  unsubscribe = onSnapshot(doc(db, 'households', hid), async (snap) => {
    if (!snap.exists() || applyingRemote) return;
    const docData = snap.data();
    const { updatedAt } = docData;
    if (updatedAt && Math.abs(updatedAt - lastPushAt) < 500) return;

    const payload = await unpackCloudDoc(docData, hid);
    if (!payload) return;

    applyingRemote = true;
    try {
      onRemoteChange?.(payload, updatedAt);
    } finally {
      applyingRemote = false;
    }
  });
}

function pullResult(data, status, extra = {}) {
  return { data, rejectedEmptyRemote: false, status, ...extra };
}

export async function pullFromCloud(data) {
  if (!enabled || !db) return pullResult(data, 'off');
  const hid = ensureHouseholdId(data);
  if (!hid) return pullResult(data, 'no-code');

  try {
    const { doc, getDoc } = firestoreApi;
    const snap = await getDoc(doc(db, 'households', hid));
    if (!snap.exists()) return pullResult(data, 'no-doc');
    const docData = snap.data();
    const payload = await unpackCloudDoc(docData, hid);
    if (!payload) {
      const encrypted = !!(docData.encrypted && docData.envelope);
      return pullResult(data, encrypted ? 'bad-pass' : 'empty-doc');
    }
    const merged = applyRemotePayload(data, payload, docData.updatedAt);
    return { ...merged, status: 'ok' };
  } catch (e) {
    console.warn('Pull failed', e);
    return pullResult(data, 'error');
  }
}

export async function pushToCloud(data) {
  if (!enabled || !db || applyingRemote) return;
  const hid = ensureHouseholdId(data);
  if (!hid) return;

  if (!hasCloudPassphraseSession()) return;
  if (!hasUserFinancialData(data)) return;

  try {
    const { doc, setDoc } = firestoreApi;
    const packed = await packCloudDoc(data, hid);
    if (!packed) return;
    const updatedAt = Date.now();
    lastPushAt = updatedAt;
    await setDoc(doc(db, 'households', hid), { ...packed, updatedAt }, { merge: true });
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
