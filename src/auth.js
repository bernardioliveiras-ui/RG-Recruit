const encoder = new TextEncoder();
// Workers Web Crypto supports at most 100,000 iterations per PBKDF2 operation.
const iterations = 100_000;
export const sessionLifetimeSeconds = 8 * 60 * 60;
const cookieName = '__Host-rg_session';
const cookieAttributes = 'Path=/; HttpOnly; Secure; SameSite=Strict';
export const logoutCookie = `${cookieName}=; Max-Age=0; ${cookieAttributes}`;

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value) {
  return Uint8Array.from(value.match(/../gu), pair => parseInt(pair, 16));
}

export async function digest(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function equalFixedLength(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function matchesSetupToken(received, expected) {
  if (!received || !expected) return false;
  return equalFixedLength(await digest(received), await digest(expected));
}

async function derivePassword(password, salt, rounds) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', iterations: rounds, salt }, key, 256));
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const derived = await derivePassword(password, salt, iterations);
  return `pbkdf2-sha512$${iterations}$${hex(salt)}$${derived}`;
}

export async function verifyPassword(password, stored) {
  const record = /^pbkdf2-sha512\$(\d{1,6})\$([a-f0-9]{32})\$([a-f0-9]{64})$/u.exec(stored);
  if (!record || typeof password !== 'string') return false;
  const rounds = Number(record[1]);
  if (rounds < 1 || rounds > iterations) return false;
  const candidate = await derivePassword(password, fromHex(record[2]), rounds);
  return equalFixedLength(candidate, record[3]);
}

// Unknown accounts perform the same password derivation as known ones.
export const dummyRecord = `pbkdf2-sha512$${iterations}$${'0'.repeat(32)}$${'0'.repeat(64)}`;

function sessionKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(adminId, secret, now = Date.now()) {
  if (!secret || !Number.isSafeInteger(adminId) || adminId < 1) throw new Error('Invalid session configuration');
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${adminId}.${Math.floor(now / 1000) + sessionLifetimeSeconds}.${nonce}`;
  const signature = await crypto.subtle.sign('HMAC', await sessionKey(secret), encoder.encode(payload));
  return `${cookieName}=${payload}.${hex(signature)}; Max-Age=${sessionLifetimeSeconds}; ${cookieAttributes}`;
}

function sessionToken(cookieHeader) {
  const cookie = cookieHeader?.split(';').map(item => item.trim())
    .find(item => item.startsWith(cookieName + '='));
  return cookie?.slice(cookieName.length + 1);
}

export function sessionFingerprint(cookieHeader) {
  return digest(sessionToken(cookieHeader));
}

export async function readSession(request, secret, now = Date.now()) {
  if (!secret) return null;
  const token = sessionToken(request.headers.get('Cookie'));
  if (!token) return null;
  const record = /^(\d{1,16})\.(\d{1,12})\.([0-9a-f]{32})\.([0-9a-f]{64})$/u.exec(token);
  if (!record || now >= Number(record[2]) * 1000) return null;
  const id = Number(record[1]);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const valid = await crypto.subtle.verify('HMAC', await sessionKey(secret), fromHex(record[4]), encoder.encode(record.slice(1, 4).join('.')));
  return valid ? id : null;
}
