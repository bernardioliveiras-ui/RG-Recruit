import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleApi } from '../src/api.js';

const origin = 'http://localhost:8787';
const production = 'https://rg-recruit.bernardioliveiras.workers.dev';
const schema = ['0001_initial.sql', '0002_match_requirements.sql', '0003_commercial.sql']
  .map(file => readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  .join('\n');

function isolatedServer(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(schema);
  const DB = {
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
  const env = {
    DB, APP_ENV: 'development', PRIVACY_READY: 'false',
    ADMIN_SETUP_TOKEN: 'only-for-this-memory-test',
    SESSION_SECRET: 'local-simulation-session-secret-not-real-0001',
  };
  const request = (path, method = 'GET', data, headers = {}, base = origin) =>
    handleApi(new Request(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: base, ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    }), env);
  return { sql, request };
}

test('simulação local: inscrição de cinco perfis, pontuação, revisão e bloqueio público', async t => {
  const { sql, request } = isolatedServer(t);
  const loginDetails = { email: 'operador@exemplo.invalid', password: 'simulacao-senha-segura-123' };
  const setup = await request('/api/admin/bootstrap', 'POST', loginDetails,
    { 'X-Admin-Setup-Token': 'only-for-this-memory-test' });
  assert.equal(setup.status, 201);
  const login = await request('/api/admin/login', 'POST', loginDetails);
  assert.equal(login.status, 200);
  const auth = { Cookie: login.headers.get('Set-Cookie').split(';')[0] };
  const admin = (path, method = 'GET', data) => request('/api/admin' + path, method, data, auth);

  const desossa = {
    title: 'Desossador(a) — simulação', area: 'Desossa', country: 'Espanha', city: 'Valência',
    description: 'Vaga fictícia para exercitar o ranking.', status: 'draft',
    required_skills: ['Culatra', 'Serra do peito'], skills: ['Aparar carne'],
    min_years_experience: 4, languages: ['Espanhol'], qualifications: ['HACCP'],
  };
  const main = await admin('/jobs', 'POST', desossa);
  assert.equal(main.status, 201);
  const mainJob = (await main.json()).job;
  const second = await admin('/jobs', 'POST', {
    title: 'Auxiliar de Abate — simulação', area: 'Abate', country: 'Portugal',
    description: 'Segunda vaga fictícia, para testar o banco de talentos.', status: 'draft',
  });
  assert.equal(second.status, 201);
  const secondaryJob = (await second.json()).job;

  const companyResponse=await admin('/companies','POST',{name:'Empresa fictícia',country:'Espanha'});
  assert.equal(companyResponse.status,201);
  const company=(await companyResponse.json()).company;
  for (const job of [mainJob,secondaryJob]) {
    const orderResponse=await admin('/orders','POST',{job_id:job.id,company_id:company.id,amount_cents:12500,duration_days:30});
    assert.equal(orderResponse.status,201);
    const order=(await orderResponse.json()).order;
    assert.equal((await admin(`/orders/${order.id}/approve`,'POST',{})).status,200);
  }

  const candidates = [
    {
      name: 'Aline — teste', phone: '+12025550101', country: 'Espanha', areas: ['Desossa'],
      years_experience: 6, experiences: [{ area: 'Desossa', years: 6,
        skills: ['Culatra', 'Serra do peito', 'Aparar carne'] }],
      languages: ['Espanhol'], qualifications: ['HACCP'],
    },
    {
      name: 'Bruno — teste', phone: '+12025550102', country: 'Portugal', areas: ['Desossa'],
      years_experience: 2, experiences: [{ area: 'Desossa', years: 2,
        skills: ['Culatra', 'Serra do peito'] }],
      languages: ['Espanhol'], willing_to_relocate: true,
    },
    {
      name: 'Carla — teste', phone: '+12025550103', country: 'Espanha', areas: ['Desossa'],
      years_experience: 5, experiences: [{ area: 'Desossa', years: 5,
        skills: ['Culatra', 'Aparar carne'] }],
    },
    {
      name: 'Elisa — teste', phone: '+12025550104', country: 'Portugal', areas: ['Desossa'],
      years_experience: 1, experiences: [{ area: 'Desossa', years: 1, skills: [] }],
    },
    {
      name: 'Diego — teste', phone: '+12025550105', country: 'Espanha', areas: ['Abate'],
      years_experience: 15, experiences: [{ area: 'Abate', years: 15, skills: ['Sangria'] }],
      languages: ['Espanhol'],
    },
  ];

  for (const profile of candidates) {
    const jobId = profile.name.startsWith('Diego') ? secondaryJob.id : mainJob.id;
    const response = await request('/api/applications', 'POST', {
      ...profile, job_id: jobId, consent: true,
    });
    assert.equal(response.status, 201, profile.name);
    assert.deepEqual(await response.json(), { message: 'Candidatura recebida.' });
  }
  // O mesmo perfil pode se candidatar a duas vagas sem duplicar seu cadastro.
  const repeat = await request('/api/applications', 'POST', {
    ...candidates[0], job_id: secondaryJob.id, consent: true,
  });
  assert.equal(repeat.status, 201);

  const response = await admin(`/jobs/${mainJob.id}/matches`);
  assert.equal(response.status, 200);
  const { matches } = await response.json();
  const ranked = matches.map(item => ({
    name: item.candidate.name,
    score: item.score,
    band: item.band,
    applied: item.applied,
    missingTasks: item.review_flags.length,
  }));
  assert.deepEqual(ranked.map(item => item.name), candidates.map(item => item.name));
  assert.deepEqual(ranked.map(item => item.score), [100, 78, 76, 30, 15]);
  assert.deepEqual(ranked.map(item => item.band), ['high', 'review', 'review', 'other', 'other']);
  assert.deepEqual(ranked.map(item => item.applied), [true, true, true, true, false]);
  assert.equal(matches[2].review_flags[0], 'Confirmar tarefa obrigatória: Serra do peito.');
  assert.equal(matches[4].breakdown.experience.earned, 0);

  const stats = await (await admin('/stats')).json();
  assert.deepEqual(stats.counts, { published_jobs: 2, candidates: 5, applications: 6 });
  const applications = (await (await admin(`/applications?job_id=${mainJob.id}`)).json()).applications;
  assert.equal(applications.length, 4);
  const selected = await admin(`/applications/${applications.find(item => item.candidate_name === candidates[0].name).id}`,
    'PATCH', { status: 'selecionado' });
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).application.status, 'selecionado');

  // Segurança: o mesmo banco em memória, acessado como produção, recusa inscrições.
  const config = await (await request('/api/config', 'GET', undefined, {}, production)).json();
  assert.equal(config.applications_open, false);
  const refused = await request('/api/applications', 'POST', {
    ...candidates[0], job_id: mainJob.id, consent: true,
  }, {}, production);
  assert.equal(refused.status, 503);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM candidates').get().n, 5);

  console.log('\nRESULTADO DA SIMULAÇÃO — VAGA DESOSSA / ESPANHA');
  console.table(ranked);
  console.log('Banco de talentos: 5 perfis, 2 vagas, 6 candidaturas; produção protegida.');
});
