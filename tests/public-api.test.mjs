import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleApi } from '../src/api.js';
import worker, { onRequest } from '../src/index.js';

const schema = [
  '../migrations/0001_initial.sql', '../migrations/0002_match_requirements.sql',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
const applicant = {
  job_id: 1, name: 'Nome original', phone: '+55 (11) 91234-5678',
  country: 'Brasil', years_experience: 3, consent: true,
};

function setup(t, vars = {}) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(schema);
  const add = sql.prepare('INSERT INTO jobs (title, area, country, description, status, skills) VALUES (?, ?, ?, ?, ?, ?)');
  add.run('Corte', 'Desossa', 'Portugal', 'Descrição', 'published', '["Corte"]');
  add.run('Produção', 'Fumeiro', 'Espanha', 'Descrição', 'published', '[]');
  add.run('Rascunho', 'Desossa', 'Portugal', 'Descrição', 'draft', '[]');
  add.run('Arquivada', 'Desossa', 'Portugal', 'Descrição', 'archived', '[]');

  const DB = {
    prepare(query) {
      const statement = sql.prepare(query);
      return {
        all: async () => ({ results: statement.all() }),
        bind(...args) {
          return {
            first: async () => statement.get(...args) ?? null,
            all: async () => ({ results: statement.all(...args) }),
          };
        },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };

  const env = { DB, APP_ENV: 'development', ...vars };
  const origin = env.APP_ENV === 'development' ? 'http://localhost' : 'https://localhost';
  const route = (path, init) => handleApi(new Request(origin + path, init), env);
  const post = (data, init = {}) => route('/api/applications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data), ...init,
  });
  return { sql, route, post, env };
}

test('lists and finds only published jobs, with bound country and area filters', async t => {
  const { route } = setup(t);
  assert.deepEqual((await (await route('/api/jobs')).json()).jobs.map(job => job.id).sort(), [1, 2]);
  const filtered = await (await route('/api/jobs?country=Portugal&area=Desossa')).json();
  assert.deepEqual(filtered.jobs.map(job => job.id), [1]);
  assert.deepEqual(filtered.jobs[0].skills, ['Corte']);
  const injection = encodeURIComponent("Portugal' OR 1=1 --");
  assert.deepEqual((await (await route(`/api/jobs?country=${injection}`)).json()).jobs, []);
  assert.equal((await (await route('/api/jobs/1')).json()).job.title, 'Corte');
  for (const id of [3, 4, 5, 'abc']) {
    assert.equal((await route(`/api/jobs/${id}`)).status, 404);
  }
});

test('returns sanitized validation, media type, size and missing job errors', async t => {
  const { post, sql } = setup(t);
  const invalid = await post({ ...applicant, consent: false, phone: 'not-a-phone' });
  assert.equal(invalid.status, 400);
  const errors = await invalid.json();
  assert.ok(errors.errors.phone);
  assert.ok(errors.errors.consent);
  assert.doesNotMatch(JSON.stringify(errors), /not-a-phone/);
  assert.equal((await post(applicant, { body: '{' })).status, 400);
  assert.equal((await post(applicant, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await post({ padding: 'é'.repeat(70_000) })).status, 413);
  assert.equal((await post({ ...applicant, job_id: 3 })).status, 404);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM candidates').get().count, 0);
});

test('applies by normalized phone across jobs without replacing any original data', async t => {
  const { post, sql } = setup(t);
  const first = await post(applicant);
  assert.equal(first.status, 201);
  const receipt = await first.json();
  assert.deepEqual(receipt, { message: 'Candidatura recebida.' });
  const stored = sql.prepare('SELECT * FROM candidates').get();
  assert.equal(stored.phone, '+5511912345678');
  const repeated = await post({ ...applicant, phone: '+55 11 91234.5678', name: 'Outro nome' });
  const another = await post({ ...applicant, job_id: 2, phone: '+5511912345678', name: 'Terceiro nome', notes: 'Outras notas' });
  for (const response of [repeated, another]) {
    assert.equal(response.status, first.status);
    assert.deepEqual(await response.json(), receipt);
  }
  assert.deepEqual(sql.prepare('SELECT * FROM candidates').all(), [stored]);
  assert.deepEqual(sql.prepare('SELECT job_id FROM applications ORDER BY job_id').all().map(row => row.job_id), [1, 2]);
});

test('stores candidate task history by function without exposing it in the public receipt', async t => {
  const {post,sql} = setup(t);
  const profile = {...applicant,experiences:[{area:'Desossa',years:4,skills:['Culatra','Serra do peito']}],
    qualifications:['HACCP']};
  const response = await post(profile);
  assert.equal(response.status,201);
  assert.deepEqual(await response.json(),{message:'Candidatura recebida.'});
  const stored = sql.prepare('SELECT experiences, qualifications FROM candidates').get();
  assert.deepEqual(JSON.parse(stored.experiences),profile.experiences);
  assert.deepEqual(JSON.parse(stored.qualifications),profile.qualifications);
});

test('returns the generic receipt for the honeypot without writing applicant data', async t => {
  const { post, sql } = setup(t);
  const response = await post({ ...applicant, website: 'https://example.com' });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { message: 'Candidatura recebida.' });
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM candidates').get().count, 0);
});

test('fails closed on outside hosts without Turnstile and enforces the rate limiter', async t => {
  const limit = t.mock.fn(async () => ({ success: false }));
  const { post, env } = setup(t, { APPLICATION_RATE_LIMITER: { limit } });
  const request = new Request('https://recruit.example/api/applications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(applicant),
  });
  assert.equal((await handleApi(request, env)).status, 503);
  const limited = await post(applicant, {
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.5' },
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.deepEqual(limit.mock.calls[0].arguments, [{ key: '/api/applications:192.0.2.5' }]);
});

test('verifies a production token with Cloudflare and checks hostname and action', async t => {
  const { post, sql } = setup(t, {
    APP_ENV: 'production',
    PRIVACY_READY: 'true',
    TURNSTILE_SITE_KEY: 'widget-key',
    TURNSTILE_HOSTNAME: 'localhost',
    TURNSTILE_SECRET_KEY: 'widget-secret',
    APPLICATION_RATE_LIMITER: { limit: async () => ({ success: true }) },
  });
  let result = { success: true, hostname: 'localhost', action: 'application' };
  const verify = t.mock.method(globalThis, 'fetch', async () => Response.json(result));
  assert.equal((await post(applicant)).status, 400);
  assert.equal(verify.mock.callCount(), 0);

  for (const invalid of [
    { success: false, hostname: 'localhost', action: 'application' },
    { success: true, hostname: 'elsewhere.example', action: 'application' },
    { success: true, hostname: 'localhost', action: 'login' },
  ]) {
    result = invalid;
    assert.equal((await post({ ...applicant, turnstile_token: 'signed-token' })).status, 400);
  }
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM candidates').get().count, 0);

  result = { success: true, hostname: 'localhost', action: 'application' };
  assert.equal((await post({ ...applicant, turnstile_token: 'signed-token' })).status, 201);
  const [url, init] = verify.mock.calls[0].arguments;
  assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(init.method, 'POST');
  assert.deepEqual(JSON.parse(init.body), { secret: 'widget-secret', response: 'signed-token' });
});


test('rolls back the candidate if the application insert fails and sanitizes the error', async t => {
  const { post, sql } = setup(t);
  sql.exec(`
    CREATE TRIGGER reject_application BEFORE INSERT ON applications
    BEGIN SELECT RAISE(ABORT, 'database failure details'); END;
  `);
  const response = await post(applicant);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /database failure details/);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM candidates').get().count, 0);
});

test('distinguishes Turnstile service and configuration failures from retryable challenge errors', async t => {
  const { post, sql } = setup(t, { APP_ENV:'production', PRIVACY_READY:'true', TURNSTILE_SITE_KEY:'site',
    TURNSTILE_HOSTNAME:'localhost', TURNSTILE_SECRET_KEY:'secret',
    APPLICATION_RATE_LIMITER:{limit:async () => ({success:true})} });
  let result;
  t.mock.method(globalThis, 'fetch', async () => Response.json(result));
  for (const [code, status] of [['internal-error',503], ['missing-input-secret',503], ['invalid-input-secret',503],
    ['bad-request',503], ['invalid-input-response',400], ['timeout-or-duplicate',400], ['missing-input-response',400]]) {
    result = {success:false, 'error-codes':[code]};
    const response = await post({...applicant, turnstile_token:'sample'});
    assert.equal(response.status, status, code);
    assert.ok(!(await response.text()).includes(code));
  }
  result = {success:true, hostname:'localhost', action:'application', 'error-codes':['invalid-input-response']};
  assert.equal((await post({...applicant, turnstile_token:'sample'})).status, 503);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM candidates').get().n, 0);
});

test('routes APIs ahead of static files and exposes only the public Turnstile key', async t => {
  const assets = { fetch: t.mock.fn(async () => new Response('static')) };
  const { env } = setup(t, {
    ASSETS: assets, TURNSTILE_SITE_KEY: 'widget-key', TURNSTILE_SECRET_KEY: 'widget-secret',
  });
  assert.equal(worker.fetch, onRequest);
  const config = await worker.fetch(new Request('https://recruit.example/api/config'), env);
  assert.deepEqual(await config.json(), { turnstile_site_key: 'widget-key', applications_open: false });
  assert.equal(assets.fetch.mock.callCount(), 0);
  const asset = await worker.fetch(new Request('https://recruit.example/'), env);
  assert.equal(await asset.text(), 'static');
  assert.equal(assets.fetch.mock.callCount(), 1);
});
