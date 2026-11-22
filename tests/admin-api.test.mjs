import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleApi } from '../src/api.js';

const origin = 'https://recruit.example';
const schema = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
const credentials = { email: 'ADMIN@example.org', password: 'a sufficiently long passphrase' };
const vacancy = { title: 'Operador', area: 'Desossa', country: 'Portugal', description: 'Uma vaga.' };

function setup(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(schema);
  const DB = {
    batch(statements) { return Promise.all(statements.map(statement => statement.all())); },
    prepare(query) {
      const statement = sql.prepare(query);
      function bound(...values) {
        return {
          bind: bound,
          first: async () => statement.get(...values) ?? null,
          all: async () => ({ results: statement.all(...values) }),
          run: async () => ({ meta: { changes: statement.run(...values).changes } }),
        };
      }
      return bound();
    },
  };
  const env = { DB, ADMIN_SETUP_TOKEN: 'private-setup', SESSION_SECRET: 'development-test-only-session-secret-0001' };
  const request = (path, method = 'GET', body, headers = {}) => handleApi(new Request(origin + '/api/admin' + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const bootstrap = (data = credentials) => request('/bootstrap', 'POST', data, { 'X-Admin-Setup-Token': env.ADMIN_SETUP_TOKEN });
  const authenticate = async () => {
    assert.equal((await bootstrap()).status, 201);
    const login = await request('/login', 'POST', credentials);
    assert.equal(login.status, 200);
    return { Cookie: login.headers.get('Set-Cookie').split(';')[0] };
  };
  return { request, sql, env, bootstrap, authenticate };
}

test('bootstrap requires private header and atomically creates exactly one initial admin', async t => {
  const { request, bootstrap, sql, env } = setup(t);
  assert.equal((await request('/bootstrap?token=private-setup', 'POST', { ...credentials, token: env.ADMIN_SETUP_TOKEN })).status, 403);
  assert.equal((await request('/bootstrap', 'POST', credentials, { 'X-Admin-Setup-Token': 'wrong' })).status, 403);
  assert.equal((await bootstrap({ ...credentials, password: 'short' })).status, 400);
  const responses = await Promise.all([bootstrap(), bootstrap({ ...credentials, email: 'other@example.org' })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM admins').get().n, 1);
  for (const r of responses) assert.doesNotMatch(await r.text(), /password|private-setup/);
});

test('private endpoints are guarded before reading records or changing state', async t => {
  const { request } = setup(t);
  for (const [method, path] of [
    ['GET', '/me'], ['GET', '/jobs'], ['POST', '/jobs'], ['PATCH', '/jobs/1'],
    ['GET', '/candidates'], ['GET', '/candidates/1'], ['DELETE', '/candidates/1'],
    ['GET', '/jobs/1/matches'], ['GET', '/applications?job_id=1'], ['PATCH', '/applications/1'],
    ['GET', '/users'], ['POST', '/users'], ['POST', '/logout'], ['GET','/stats'],
    ['POST','/candidates/search'], ['DELETE','/applications/1'], ['DELETE','/users/2'],
  ]) assert.equal((await request(path, method)).status, 401, method + ' ' + path);
});

test('session cookie, logout, additional admins and origin checks', async t => {
  const { request, authenticate, env } = setup(t);
  const headers = await authenticate();
  const me = await (await request('/me', 'GET', undefined, headers)).json();
  assert.equal(me.admin.email, 'admin@example.org');
  assert.equal(me.admin.password_hash, undefined);
  const login = await request('/login', 'POST', credentials);
  const cookie = login.headers.get('Set-Cookie');
  for (const rule of [/; HttpOnly/i, /; Secure/i, /; SameSite=Strict/i, /; Path=\//i]) assert.match(cookie, rule);
  for (const Origin of ['', 'https://elsewhere.example', 'null']) {
    assert.equal((await request('/jobs', 'POST', vacancy, { ...headers, Origin })).status, 403);
    assert.equal((await request('/login', 'POST', credentials, { Origin })).status, 403);
  }
  assert.equal((await request('/users', 'POST', { ...credentials, email: 'b@example.org' }, headers)).status, 201);
  assert.equal((await request('/users', 'POST', credentials, headers)).status, 409);
  const users = await (await request('/users', 'GET', undefined, headers)).json();
  assert.equal(users.users.length, 2);
  assert.doesNotMatch(JSON.stringify(users), /password/);
  assert.match((await request('/logout', 'POST', undefined, headers)).headers.get('Set-Cookie'), /Max-Age=0/i);
  delete env.SESSION_SECRET;
  assert.equal((await request('/me', 'GET', undefined, headers)).status, 503);
});

test('failed logins are generic and throttled until the fixed window expires', async t => {
  const { request, bootstrap, sql } = setup(t);
  assert.equal((await bootstrap()).status, 201);
  let failed;
  for (let i = 0; i < 5; i++) {
    const r = await request('/login', 'POST', { ...credentials, password: 'wrong' });
    assert.equal(r.status, 401);
    failed = await r.text();
  }
  const limited = await request('/login', 'POST', credentials);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  sql.exec('UPDATE login_attempts SET window_start = 0');
  assert.equal((await (await request('/login', 'POST', { ...credentials, email: 'unknown@example.org' })).text()), failed);
  assert.equal((await request('/login', 'POST', credentials)).status, 200);
});

test('job publication, candidate filters, all-pool ranking, application review and erasure', async t => {
  const { request, authenticate, sql } = setup(t);
  const auth = await authenticate();
  const api = (path, method, body) => request(path, method, body, auth);
  assert.equal((await api('/jobs', 'POST', {})).status, 400);
  const job = (await (await api('/jobs', 'POST', vacancy)).json()).job;
  assert.equal(job.status, 'draft');
  assert.equal((await (await api('/jobs/1', 'PATCH', { status: 'published' })).json()).job.title, vacancy.title);
  assert.equal((await (await api('/jobs')).json()).jobs[0].status, 'published');
  sql.exec(`
    INSERT INTO candidates(name, phone, country, areas) VALUES
    ('Ana', '+351911111111', 'Portugal', '["Desossa"]'), ('Bia', '+551199999999', 'Brasil', '["Abate"]');
    INSERT INTO applications(candidate_id, job_id) VALUES(2,1);
  `);
  const matches = (await (await api('/jobs/1/matches')).json()).matches;
  assert.deepEqual(matches.map(m => [m.candidate.name, m.applied, m.score]), [['Ana', false, 100], ['Bia', true, 0]]);
  assert.ok(matches[0].reasons.length && matches[0].breakdown.area);
  assert.deepEqual((await (await api('/jobs/1/matches?country=Brasil')).json()).matches.map(m => m.candidate.name), ['Bia']);
  assert.deepEqual((await (await api('/candidates/search', 'POST', { q:'an', area:'Desossa' })).json()).candidates.map(c => c.name), ['Ana']);
  const applications = (await (await api('/applications?job_id=1')).json()).applications;
  assert.equal(applications[0].candidate_name, 'Bia');
  assert.equal((await api('/applications/1', 'PATCH', { status: 'invalid' })).status, 400);
  assert.equal((await (await api('/applications/1', 'PATCH', { status: 'selecionado' })).json()).application.status, 'selecionado');
  const detail = await (await api('/candidates/2')).json();
  assert.equal(detail.candidate.phone, '+551199999999');
  assert.equal(detail.applications[0].status, 'selecionado');
  assert.equal((await (await api('/jobs/1', 'PATCH', { status: 'archived' })).json()).job.status, 'archived');
  assert.equal((await api('/candidates/2', 'DELETE')).status, 200);
  assert.equal((await api('/candidates/2')).status, 404);
  assert.deepEqual((await (await api('/applications?job_id=1')).json()).applications, []);
});

test('candidate summaries and dashboard omit private fields, and staff search uses the JSON body', async t => {
  const { request, authenticate, sql } = setup(t);
  const auth = await authenticate();
  const api = (path, method, body) => request(path, method, body, auth);
  sql.exec(`
    INSERT INTO jobs (title,area,country,description,status) VALUES
      ('A','Abate','Portugal','Descrição','published'),('B','Abate','Portugal','Descrição','published'),
      ('C','Abate','Portugal','Descrição','draft'),('D','Abate','Portugal','Descrição','archived');
    INSERT INTO candidates (name, phone, email, country, areas, notes) VALUES
      ('Carla Silva','+12025550147','carla@example.invalid','Portugal','["Abate"]','Privado'),
      ('Joana','+12025550148','','Brasil','[]','');
    INSERT INTO applications (candidate_id,job_id) VALUES (1,1);
  `);
  const summaryFields = ['id','name','country','city','areas','years_experience'].sort();
  const list = (await (await api('/candidates')).json()).candidates;
  assert.deepEqual(Object.keys(list[0]).sort(), summaryFields);
  const stats = await (await api('/stats')).json();
  assert.deepEqual(stats.counts, { published_jobs:2, candidates:2, applications:1 });
  assert.deepEqual(stats.recent_jobs.map(j => j.id), [4,3,2]);
  assert.doesNotMatch(JSON.stringify(stats), /Carla|Silva|Joana|1202555|@|Privado/);
  for (const q of ['carla sil', '25550147', 'CARLA@EXAMPLE.INVALID']) {
    const response = await api('/candidates/search', 'POST', { q, area:'Abate', country:'Portugal' });
    assert.equal(response.status, 200);
    const {candidates} = await response.json();
    assert.deepEqual(candidates.map(c => c.name), ['Carla Silva']);
    assert.deepEqual(Object.keys(candidates[0]).sort(), summaryFields);
  }
  assert.equal((await request('/candidates/search', 'POST', {q:'Carla'}, {...auth,Origin:''})).status, 403);
  assert.equal((await api('/candidates?q=Carla')).status, 400);
  assert.equal((await api('/jobs/1/matches?q=Carla')).status, 400);
  assert.equal((await api('/candidates/search', 'POST', {q:42})).status, 400);
  assert.equal((await api('/candidates/search', 'POST', {q:'x'.repeat(161)})).status, 400);
  assert.deepEqual((await (await api('/candidates?country=Brasil')).json()).candidates.map(c => c.name), ['Joana']);
  const detail = (await (await api('/candidates/1')).json()).candidate;
  assert.equal(detail.email, 'carla@example.invalid');
  assert.equal(detail.phone, '+12025550147');
});

test('withdrawing one application keeps the candidate, other applications and jobs', async t => {
  const { request, authenticate, sql } = setup(t);
  const auth = await authenticate();
  sql.exec(`
    INSERT INTO jobs (title,area,country,description) VALUES ('A','Abate','Portugal','A'),('B','Abate','Portugal','B');
    INSERT INTO candidates (name,phone,country) VALUES ('Ana','+12025550147','Portugal');
    INSERT INTO applications (candidate_id,job_id) VALUES (1,1),(1,2);
  `);
  assert.equal((await request('/applications/1','DELETE',undefined,{...auth, Origin:''})).status, 403);
  assert.equal((await request('/applications/1','DELETE',undefined,auth)).status, 200);
  assert.equal((await request('/applications/1','DELETE',undefined,auth)).status, 404);
  const detail = await (await request('/candidates/1','GET',undefined,auth)).json();
  assert.equal(detail.candidate.name, 'Ana');
  assert.deepEqual(detail.applications.map(a => a.job_id), [2]);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM jobs').get().n, 2);
});

test('offboarding protects the current account, revokes all target sessions and avoids stale ID reuse', async t => {
  const { request, authenticate, sql } = setup(t);
  const auth = await authenticate();
  const api = (path, method, body) => request(path, method, body, auth);
  const staff = {...credentials,email:'staff@example.invalid'};
  assert.equal((await api('/users/1','DELETE')).status, 409);
  const target = (await (await api('/users','POST',staff)).json()).admin;
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const login = await request('/login','POST',staff);
    sessions.push({Cookie:login.headers.get('Set-Cookie').split(';')[0]});
  }
  const path = '/users/' + target.id;
  assert.equal((await api('/users/1','DELETE')).status, 409);
  assert.equal((await request(path,'DELETE',undefined,{...auth,Origin:''})).status, 403);
  assert.equal((await api(path,'DELETE')).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM admin_sessions WHERE admin_id=?').get(target.id).n, 0);
  for (const cookie of sessions) assert.equal((await request('/me','GET',undefined,cookie)).status, 401);
  assert.equal((await request('/login','POST',staff)).status, 401);
  const replacement = (await (await api('/users','POST',staff)).json()).admin;
  assert.notEqual(replacement.id, target.id);
  assert.equal((await api(path,'DELETE')).status, 404);
  assert.equal((await api('/me')).status, 200);
});

test('simultaneous departures by two different admins preserve one active account', async t => {
  const { request, authenticate, sql } = setup(t);
  const first = await authenticate();
  const staff = {...credentials,email:'staff@example.invalid'};
  const secondId = (await (await request('/users','POST',staff,first)).json()).admin.id;
  const login = await request('/login','POST',staff);
  const second = {Cookie:login.headers.get('Set-Cookie').split(';')[0]};
  const results = await Promise.all([
    request('/users/' + secondId,'DELETE',undefined,first), request('/users/1','DELETE',undefined,second),
  ]);
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM admins').get().n, 1);
  const sessions = await Promise.all([first,second].map(c => request('/me','GET',undefined,c)));
  assert.deepEqual(sessions.map(r => r.status).sort(), [200,401]);
});

test('logout revokes exactly the signed-in browser session, including a copied cookie', async t => {
  const { request, authenticate } = setup(t);
  const first = await authenticate();
  const secondLogin = await request('/login', 'POST', credentials);
  const second = { Cookie: secondLogin.headers.get('Set-Cookie').split(';')[0] };
  assert.equal((await request('/logout', 'POST', undefined, first)).status, 200);
  assert.equal((await request('/me', 'GET', undefined, first)).status, 401);
  assert.equal((await request('/me', 'GET', undefined, second)).status, 200);
});

test('stale deletion and triage requests cannot affect a later applicant after erasure', async t => {
  const { request, authenticate, sql } = setup(t);
  const auth = await authenticate();
  const api = (path, method, body) => request(path, method, body, auth);
  const job = (await (await api('/jobs', 'POST', { ...vacancy, status: 'published' })).json()).job;
  const add = sql.prepare('INSERT INTO candidates (name, phone, country) VALUES (?, ?, ?) RETURNING id');
  const apply = sql.prepare('INSERT INTO applications (candidate_id, job_id) VALUES (?, ?) RETURNING id');
  const original = add.get('Ana', '+351911111111', 'Portugal');
  const originalApplication = apply.get(original.id, job.id);
  assert.equal((await api('/candidates/' + original.id, 'DELETE')).status, 200);
  const next = add.get('Bea', '+351922222222', 'Portugal');
  apply.get(next.id, job.id);
  const status = await api('/applications/' + originalApplication.id, 'PATCH', { status: 'recusado' });
  const deletion = await api('/candidates/' + original.id, 'DELETE');
  assert.deepEqual([status.status, deletion.status], [404, 404]);
  const profile = await (await api('/candidates/' + next.id)).json();
  assert.equal(profile.candidate.name, 'Bea');
  assert.deepEqual(profile.applications.map(a => a.status), ['recebido']);
});
