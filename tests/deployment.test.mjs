import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const config = JSON.parse((await read('wrangler.jsonc')).replace(/^\s*\/\/.*$/gmu, ''));

test('normal deploy runs the notice guard before invoking Wrangler', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts.deploy, /^node scripts\/check-launch-readiness\.mjs && wrangler deploy$/u);
});

test('launch guard blocks draft placeholders and markers only when opening public intake', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rg-launch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public'));
  const script = fileURLToPath(new URL('../scripts/check-launch-readiness.mjs', import.meta.url));
  const draft = await read('public/privacidade.html');
  const template = await read('wrangler.jsonc');
  for (const [ready, notice, expected] of [
    ['true', '<p>[contato do controlador]</p>', 1],
    ['true', '<p>MINUTA em revisão</p>', 1],
    ['true', '<p>Aviso de privacidade vigente. Contato: equipe@example.invalid.</p>', 0],
    ['false', draft, 0],
  ]) {
    const source = template.replace(/("PRIVACY_READY"\s*:\s*")[^"]+/u, (_, prefix) => prefix + ready);
    await writeFile(join(root, 'wrangler.jsonc'), source);
    await writeFile(join(root, 'public', 'privacidade.html'), notice);
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
    if (expected === 1) assert.match(result.stderr, /privacidade\.html/iu);
  }
});

test('Wrangler connects the Worker, public assets, D1 migrations and application limiter', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.ok(pkg.devDependencies?.wrangler);
  assert.equal(config.main, 'src/index.js');
  assert.equal(config.assets.directory, './public');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.assets.run_worker_first, true);
  const db = config.d1_databases.find(({ binding }) => binding === 'DB');
  assert.match(db.database_id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);
  assert.match(await read(db.migrations_dir + '/0001_initial.sql'), /CREATE TABLE candidates/iu);
  const limit = config.ratelimits.find(item => item.name === 'APPLICATION_RATE_LIMITER');
  assert.match(limit.namespace_id, /^[1-9]\d*$/u);
  assert.deepEqual(limit.simple, { limit: 12, period: 60 });
  for (const secret of ['SESSION_SECRET', 'TURNSTILE_SECRET_KEY', 'ADMIN_SETUP_TOKEN']) {
    assert.equal(Object.hasOwn(config.vars, secret), false);
  }
  assert.ok(['false', 'true'].includes(config.vars.PRIVACY_READY));
  if (config.vars.PRIVACY_READY === 'true') {
    assert.doesNotMatch(await read('public/privacidade.html'), /\[[^\]]+\]|Minuta para revisão/iu);
  }
});

test('static responses have a Turnstile-compatible CSP and the admin shell requires revalidation', async () => {
  const headers = await read('public/_headers');
  assert.match(headers, /^\/\*\n/mu);
  for (const directive of ["script-src 'self' https://challenges.cloudflare.com", 'frame-src https://challenges.cloudflare.com', "frame-ancestors 'none'"]) {
    assert.ok(headers.includes(directive));
  }
  for (const header of ['X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer', 'Permissions-Policy:']) {
    assert.ok(headers.includes(header));
  }
  assert.match(headers, /^\/\n\s+Cache-Control: no-store$/mu);
  for (const path of ['/api/config', '/api/admin/me', '/api/missing']) {
    const response = await worker.fetch(new Request('https://example.test' + path), {});
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  }
});

test('intake remains closed outside local development until the privacy notice is approved', async () => {
  const request = () => new Request('https://example.test/api/applications', { method: 'POST' });
  for (const flag of [undefined, 'false']) {
    const env = { PRIVACY_READY: flag, APP_ENV: 'development', TURNSTILE_SITE_KEY: 'public',
      TURNSTILE_HOSTNAME: 'example.test', TURNSTILE_SECRET_KEY: 'test',
      APPLICATION_RATE_LIMITER: { limit() { throw Error('intake reached the limiter'); } } };
    assert.equal((await worker.fetch(request(), env)).status, 503);
    const configResponse = await worker.fetch(new Request('https://example.test/api/config'), env);
    assert.equal((await configResponse.json()).applications_open, false);
  }
});

test('returning applicants receive contact and correction instructions and the form starts hidden', async () => {
  const html = await read('public/index.html');
  assert.match(html, /preencha[^<]+mesmo WhatsApp/iu);
  assert.match(html, /corrigir[^<]+/iu);
  assert.match(html, /<form id="application-form"[^>]*hidden/u);
});

test('loopback development does not render a live widget when only nonsecret production vars are inherited', async () => {
  const response = await worker.fetch(new Request('http://localhost/api/config'), {
    APP_ENV: 'development', TURNSTILE_SITE_KEY: 'from-config', TURNSTILE_HOSTNAME: 'production.test',
  });
  assert.deepEqual(await response.json(), { turnstile_site_key: '', applications_open: true });
});

test('requires HTTPS before serving static files, opening intake, or handling administrative credentials', async t => {
  const assets = t.mock.fn(async () => new Response('portal'));
  const limit = t.mock.fn(async () => ({ success: true }));
  const env = { APP_ENV: 'production', PRIVACY_READY: 'true', TURNSTILE_SITE_KEY: 'widget',
    TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_HOSTNAME: 'example.test',
    APPLICATION_RATE_LIMITER: { limit }, ASSETS: { fetch: assets } };
  for (const path of ['/', '/api/config', '/api/admin/me']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(new Request('http://example.test' + path, { method }), env);
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('Location'), 'https://example.test' + path);
    }
  }
  for (const path of ['/api/admin/bootstrap', '/api/admin/login', '/api/applications']) {
    const request = new Request('http://example.test' + path, { method: 'POST', body: '{}' });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.has('Location'), false);
    assert.equal(request.bodyUsed, false);
  }
  assert.equal(limit.mock.callCount(), 0);
  assert.equal(assets.mock.callCount(), 0);
  assert.equal((await worker.fetch(new Request('http://localhost/api/config'), env)).status, 308);
  assert.equal((await worker.fetch(new Request('http://example.test/api/config'), { ...env, APP_ENV:'development' })).status, 308);
  assert.equal((await (await worker.fetch(new Request('https://example.test/api/config'), env)).json()).applications_open, true);
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal((await worker.fetch(new Request('http://' + host + '/api/config'), { APP_ENV: 'development' })).status, 200);
  }
});
