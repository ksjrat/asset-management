const MIN_PIN_LENGTH = 4;
const PBKDF2_ITERATIONS = 100_000;

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(s) {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function hasAppPinCredentials(data) {
  return !!(data.auth?.appPasswordSalt && data.auth?.appPasswordHash);
}

export function isAppPinConfigured(data) {
  return !!data.auth?.appPasswordSet && hasAppPinCredentials(data);
}

/** 예전 버전: appPasswordSet만 true인 경우 플래그 정리 */
export function ensureAppLockAuth(data) {
  if (!data.auth) return;
  if (data.auth.appPasswordSet && !hasAppPinCredentials(data)) {
    data.auth.appPasswordSet = false;
    delete data.auth.appPasswordSalt;
    delete data.auth.appPasswordHash;
  }
}

async function derivePinHash(pin, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function validatePinFormat(pin) {
  const normalized = String(pin ?? '').trim();
  if (normalized.length < MIN_PIN_LENGTH) {
    return { ok: false, error: `비밀번호는 ${MIN_PIN_LENGTH}자 이상이어야 합니다` };
  }
  return { ok: true, value: normalized };
}

export async function setAppPin(data, pin) {
  const check = validatePinFormat(pin);
  if (!check.ok) return check;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(check.value, salt);
  data.auth.appPasswordSalt = toB64(salt);
  data.auth.appPasswordHash = toB64(hash);
  data.auth.appPasswordSet = true;
  return { ok: true };
}

export async function verifyAppPin(data, pin) {
  if (!hasAppPinCredentials(data)) return false;
  const check = validatePinFormat(pin);
  if (!check.ok) return false;
  try {
    const salt = fromB64(data.auth.appPasswordSalt);
    const expected = fromB64(data.auth.appPasswordHash);
    const actual = await derivePinHash(check.value, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function clearAppPin(data) {
  data.auth.appPasswordSet = false;
  delete data.auth.appPasswordSalt;
  delete data.auth.appPasswordHash;
}
