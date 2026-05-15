/** 클라우드 저장 전 AES-GCM 암호화 (가족 암호) */

const ENC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let sessionPassphrase = null;

export function hasCloudPassphraseSession() {
  return !!sessionPassphrase;
}

export function getCloudPassphraseSession() {
  return sessionPassphrase;
}

export function setCloudPassphraseSession(passphrase) {
  sessionPassphrase = passphrase || null;
}

export function clearCloudPassphraseSession() {
  sessionPassphrase = null;
}

function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64dec(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, householdId) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`couple-asset:${householdId}`),
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPayload(payload, passphrase, householdId) {
  const key = await deriveKey(passphrase, householdId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return {
    encrypted: true,
    iv: b64(iv),
    data: b64(new Uint8Array(cipher)),
  };
}

export async function decryptPayload(envelope, passphrase, householdId) {
  if (!envelope?.encrypted || !envelope?.data) return null;
  const key = await deriveKey(passphrase, householdId);
  const iv = b64dec(envelope.iv);
  const cipher = b64dec(envelope.data);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

export function generateStrongHouseholdCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => ENC_ALPHABET[b % ENC_ALPHABET.length]).join('');
}
