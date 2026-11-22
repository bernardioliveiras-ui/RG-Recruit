import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPassword, readSession, signSession, verifyPassword } from '../src/auth.js';

test('password verification requires the original password and a valid salted record', async () => {
  const password = 'uma senha longa 🔒';
  const stored = await hashPassword(password);
  assert.notEqual(await hashPassword(password), stored);
  assert.equal(stored.includes(password), false);
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword(password + ' ', stored), false);
  assert.equal(await verifyPassword(password, 'corrupt'), false);
});

test('session signature binds admin, expiry and secret', async () => {
  const now = Date.now();
  const secret = 'a-32-byte-or-longer-test-secret-for-sessions';
  const cookie = (await signSession(32, secret, now)).split(';')[0];
  const read = (value, key = secret, date = now) => readSession(new Request('https://app.test', {
    headers: { Cookie: value },
  }), key, date);
  assert.equal(await read(cookie), 32);
  assert.equal(await read(cookie + 'x'), null);
  assert.equal(await read(cookie, 'another-32-byte-secret-example-for-testing'), null);
  assert.equal(await read(cookie, secret, now + 8 * 60 * 60 * 1000), null);
  assert.equal(await read(cookie, ''), null);
  assert.equal(await read(''), null);
});
