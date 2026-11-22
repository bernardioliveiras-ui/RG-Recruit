import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const asset = name => readFile(new URL('../public/' + name, import.meta.url), 'utf8');

test('admin entry mounts only on private routes with validated numeric IDs', async () => {
  assert.match(await asset('index.html'), /<script type="module" src="\/admin\.js"><\/script>/u);
  const { adminRoute } = await import('../public/admin.js');
  for (const [hash, view, id] of [
    ['#admin', 'dashboard'], ['#admin/instalacao', 'setup'], ['#admin/vagas', 'jobs'],
    ['#admin/vagas/nova', 'jobForm'], ['#admin/vagas/9/editar', 'jobForm', 9],
    ['#admin/vagas/9/compatibilidade', 'matches', 9], ['#admin/vagas/9/inscricoes', 'applications', 9],
    ['#admin/candidatos', 'candidates'], ['#admin/candidatos/18', 'candidate', 18], ['#admin/equipe', 'users'],
  ]) {
    assert.equal(adminRoute(hash).view, view);
    assert.equal(adminRoute(hash).id, id);
  }
  assert.equal(adminRoute('#vaga/9'), null);
  for (const hash of ['#admin/vagas/0/editar', '#admin/candidatos/999999999999999999', '#admin/zzz']) {
    assert.equal(adminRoute(hash).view, 'missing');
  }
});

test('setup secret travels only in its dedicated header and actions use same-origin authenticated JSON', async t => {
  const { adminRequest } = await import('../public/admin.js');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({url, options});
    return Response.json({});
  });
  const account = {email: 'admin@example.test', password: 'secret-example'};
  await adminRequest('bootstrap', { method: 'POST', data: account, setupToken: 'setup-example' });
  await adminRequest('applications/9', { method: 'PATCH', data: {status:'em_analise'} });
  await adminRequest('candidates/17', { method: 'DELETE' });
  assert.deepEqual(calls.map(call => [call.url, call.options.method]), [
    ['/api/admin/bootstrap','POST'], ['/api/admin/applications/9','PATCH'], ['/api/admin/candidates/17','DELETE'],
  ]);
  assert.equal(new Headers(calls[0].options.headers).get('X-Admin-Setup-Token'), 'setup-example');
  assert.deepEqual(JSON.parse(calls[0].options.body), account);
  assert.deepEqual(JSON.parse(calls[1].options.body), {status:'em_analise'});
  assert.equal(calls[2].options.body, undefined);
  for (const {options} of calls) assert.equal(options.credentials, 'same-origin');
});

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; }
  append(...items) { this.children.push(...items); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener() {}
}
function flatten(node) { return [node, ...(node.children ?? []).flatMap(flatten)]; }

test('ranking renders literal candidate text, score and reasons, and distinguishes people without applications', async t => {
  const { matchCard } = await import('../public/admin.js');
  globalThis.document = {createElement: tag => new Element(tag)};
  t.after(() => { delete globalThis.document; });
  const sample = {candidate:{id:3, name:'<b>Nome de teste</b>', country:'Portugal', areas:['Desossa']},
    reasons:['Experiência na área da vaga.'], breakdown:{area:{earned:30, weight:30}}, score:100 };
  for (const [applied, score, expected] of [[true, 100, 'Inscrito'], [false, 100, 'Compatível sem inscrição'], [true, 0, 'Inscrito'], [false, 0, 'Não inscrito']]) {
    const elements = flatten(matchCard({...sample, applied, score, status:applied ? 'recebido' : null}));
    assert.ok(elements.some(n => n.textContent === expected));
    assert.ok(elements.some(n => n.textContent === sample.candidate.name));
    assert.ok(elements.some(n => n.textContent === score + '%'));
    assert.ok(elements.some(n => n.textContent === sample.reasons[0]));
    assert.ok(elements.some(n => n.href === '#admin/candidatos/3'));
    assert.ok(elements.some(n => n.tag === 'summary'));
    assert.ok(!elements.some(n => n.tag === 'b'));
  }
});

test('ranking exposes priority, missing data and mandatory tasks for human review', async t => {
  const {matchCard} = await import('../public/admin.js');
  globalThis.document = {createElement: tag => new Element(tag)};
  t.after(() => { delete globalThis.document; });
  const card = matchCard({candidate:{id:5,name:'Maria',country:'Portugal'},score:70,
    reasons:[],breakdown:{skills:{earned:17.5,weight:35}},applied:false,
    band:'review',missing_information:true,
    review_flags:['Confirmar tarefa obrigatória: Culatra.']});
  const contents = flatten(card).map(node => node.textContent).filter(Boolean);
  assert.ok(contents.includes('Revisão humana'));
  assert.ok(contents.includes('Dados a confirmar'));
  assert.ok(contents.includes('Confirmar tarefa obrigatória: Culatra.'));
});

test('destructive action needs exact confirmation and WhatsApp destinations accept only normalized phone numbers', async () => {
  const { deletionConfirmed, whatsappUrl } = await import('../public/admin.js');
  for (const value of ['', 'EXCLUI', 'excluir', 'EXCLUIR 1']) assert.equal(deletionConfirmed(value), false);
  assert.equal(deletionConfirmed('EXCLUIR'), true);
  assert.equal(whatsappUrl('+351912345678'), 'https://wa.me/351912345678');
  for (const value of ['', 'abc', '+00', 'https://example.test', '+1234567?text=foo']) assert.equal(whatsappUrl(value), null);
  const js = await asset('admin.js');
  assert.doesNotMatch(js, /(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage)/u);
});

async function mountAdmin(hash, api) {
  const { runInNewContext } = await import('node:vm');
  const handlers = {};
  class Control extends Element {
    constructor(tag) { super(tag); this.tagName = tag.toUpperCase(); this.handlers = {}; }
    replaceChildren(...items) { this.children = items; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(event, fn) { this.handlers[event] = fn; }
    querySelector(selector) { return flatten(this).find(node => node.tag === selector); }
    querySelectorAll() { return []; }
    focus() {}
    get childElementCount() { return this.children.length; }
    get isConnected() { return flatten(root).includes(this); }
    get elements() { return Object.fromEntries(flatten(this).filter(n => n.name).map(n => [n.name, n])); }
  }
  class Fields extends Map {
    constructor(form) { super(Object.entries(form.elements).map(([key, n]) => [key, n.value])); }
  }
  const root = new Control('main');
  const location = {
    get hash() { return hash; },
    set hash(value) { hash = value; queueMicrotask(handlers.hashchange); },
  };
  const code = (await asset('admin.js')).replace(/^import .*$/gmu, '').replace(/^export /gmu, '');
  const {moneyToCents,adOrderState}=await import('../public/admin-commerce.js');
  const document = {getElementById:() => root, createElement:t => new Control(t), createElementNS:(_, t) => new Control(t)};
  runInNewContext(code, {document,moneyToCents,adOrderState,
    window:{addEventListener:(event,fn) => { handlers[event] = fn; }, scrollTo(){}}, location, fetch:api, FormData:Fields, URLSearchParams});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const formWith = label => flatten(root).find(n => n.tag === 'form' && flatten(n).some(child => child.tag === 'button' && child.textContent === label));
  const submit = form => form.handlers.submit({preventDefault(){}});
  const navigate = async value => { location.hash = value; await settle(); };
  await settle();
  return { root, document, location, formWith, submit, navigate, settle };
}

test('admin can create/edit a vacancy, inspect matches, update screening and delete only after confirmation', async () => {
  const calls = [];
  let job;
  let status = 'recebido';
  let deleted = false;
  const candidate = { id: 3, name: 'Perfil de teste', phone: '+351912345678', country: 'Portugal', areas: [] };
  const api = async (url, options) => {
    const path = url.slice('/api/admin/'.length);
    const body = options.body && JSON.parse(options.body);
    calls.push([options.method, path, body]);
    if (path === 'me') return Response.json({admin:{id:1,email:'admin@example.test'}});
    if (path === 'jobs' && options.method === 'POST') job = {...body, id: 7, skills:[],
      required_skills:['Culatra'], languages:[], qualifications:[]};
    if (path === 'jobs/7') Object.assign(job, body);
    if (path === 'jobs' || path === 'jobs/7') return Response.json(options.method === 'GET' ? {jobs:[job]} : {job});
    if (path === 'jobs/7/matches') return Response.json({job,matches:[{candidate,applied:false,score:40,reasons:[],breakdown:{}}]});
    if (path === 'applications?job_id=7') return Response.json({applications:[{id:9,job_id:7,candidate_id:3,candidate_name:candidate.name,status}]});
    if (path === 'applications/9') { status = body.status; return Response.json({application:{id:9,status}}); }
    if (path === 'candidates/3' && options.method === 'DELETE') { deleted = true; return Response.json({deleted}); }
    if (path === 'candidates/3') return Response.json({candidate,applications:[]});
    if (path === 'candidates') return Response.json({candidates:deleted ? [] : [candidate]});
    throw new Error('Unexpected path ' + path);
  };
  const { root, location, formWith, submit, navigate, settle } = await mountAdmin('#admin/vagas/nova', api);
  let form = formWith('Criar vaga');
  assert.ok(form);
  assert.ok(form.elements.required_skills);
  assert.ok(form.elements.qualifications);
  for (const [key, value] of Object.entries({title:'Nova vaga',area:'Logística',country:'Portugal',description:'Oportunidade',status:'published'})) {
    form.elements[key].value = value;
  }
  form.elements.required_skills.value = 'Culatra';
  await submit(form); await settle();
  assert.equal(job.status, 'published');
  assert.equal(location.hash, '#admin/vagas');
  await navigate('#admin/vagas/7/editar');
  form = formWith('Salvar alterações');
  form.elements.city.value = 'Porto';
  await submit(form); await settle();
  assert.deepEqual(calls.find(([method, path]) => method === 'PATCH' && path === 'jobs/7')[2], {city:'Porto'});
  await navigate('#admin/vagas/7/compatibilidade');
  assert.ok(flatten(root).some(n => n.textContent === 'Compatível sem inscrição'));
  await navigate('#admin/vagas/7/inscricoes');
  form = formWith('Salvar status');
  form.elements.status.value = 'selecionado';
  await submit(form);
  assert.equal(status, 'selecionado');
  assert.ok(flatten(root).some(n => n.textContent === 'Status salvo: Selecionado.'));
  await navigate('#admin/candidatos/3');
  form = formWith('Excluir perfil e inscrições');
  await submit(form);
  assert.equal(deleted, false);
  form.elements.confirmation.value = 'EXCLUIR';
  form.elements.confirmation.handlers.input();
  await submit(form); await settle();
  assert.equal(deleted, true);
  assert.equal(location.hash, '#admin/candidatos');
});

test('candidate name stays in the authenticated profile and out of the document title', async () => {
  const name = 'Full Candidate Name';
  const api = async url => url.endsWith('/me') ? Response.json({admin:{id:1,email:'admin@example.test'}})
    : Response.json({candidate:{id:3, name, phone:'+351912345678',
      experiences:[{area:'Desossa',years:4,skills:['Culatra']}],qualifications:['HACCP']},applications:[]});
  const { root, document } = await mountAdmin('#admin/candidatos/3', api);
  assert.equal(root.querySelector('h1').textContent, name);
  assert.match(document.title, /Perfil de candidato/u);
  assert.ok(!document.title.includes(name));
  const content = flatten(root).map(n => n.textContent);
  assert.ok(content.includes('Funções detalhadas'));
  assert.ok(content.includes('Desossa'));
  assert.ok(content.includes('Culatra'));
});

test('job ranking separates high, review and other profiles without dropping any', async () => {
  const job = {id:7,title:'Desossador',area:'Desossa',country:'Portugal'};
  const matches = [90,70,42].map((score,i) => ({
    candidate:{id:i+1,name:'Pessoa '+(i+1),country:'Portugal'},score,applied:false,
    reasons:[],breakdown:{},band:['high','review','other'][i],
  }));
  const api = async url => url.endsWith('/me') ? Response.json({admin:{id:1,email:'admin@example.test'}})
    : Response.json({job,matches});
  const {root} = await mountAdmin('#admin/vagas/7/compatibilidade',api);
  const content = flatten(root).map(n => n.textContent);
  assert.ok(content.includes('Mais compatíveis (1)'));
  assert.ok(content.includes('Revisar (1)'));
  assert.ok(content.includes('Outros perfis (1)'));
  for (const name of ['Pessoa 1','Pessoa 2','Pessoa 3']) assert.ok(content.includes(name));
});

test('dashboard reads only aggregates and candidate filters keep typed contact details out of URLs', async () => {
  const calls = [];
  const api = async (url, options) => {
    calls.push({url, method:options.method, body:options.body && JSON.parse(options.body)});
    if (url.endsWith('/me')) return Response.json({admin:{id:1,email:'staff@example.invalid'}});
    if (url.endsWith('/stats')) return Response.json({counts:{published_jobs:7,candidates:23,applications:31},recent_jobs:[]});
    if (url.endsWith('/orders')) return Response.json({orders:[{job_id:7,status:'paid',starts_at_ms:Date.now()-1000,expires_at_ms:Date.now()+100000},{job_id:8,status:'pending'}]});
    if (url.endsWith('/partners')) return Response.json({partners:[{active:1}]});
    if (url.endsWith('/jobs')) return Response.json({jobs:[{id:7,status:'published'}]});
    return Response.json({candidates:[]});
  };
  const {root, formWith, submit, navigate, settle, location} = await mountAdmin('#admin', api);
  assert.deepEqual(calls.map(c => c.url), ['/api/admin/me','/api/admin/stats','/api/admin/orders','/api/admin/partners','/api/admin/jobs']);
  for (const count of ['1','23']) assert.ok(flatten(root).some(n => n.textContent === count));
  await navigate('#admin/candidatos');
  for (const q of ['Pessoa de teste','staff@example.invalid','+12025550147']) {
    const form = formWith('Filtrar');
    assert.equal(form.method, 'post');
    form.elements.q.value = q;
    await submit(form); await settle();
    assert.deepEqual(calls.at(-1), {url:'/api/admin/candidates/search',method:'POST',body:{q,country:'',area:''}});
    assert.equal(location.hash, '#admin/candidatos');
  }
  assert.ok(calls.every(c => !c.url.includes('?')));
});

test('individual application and staff deletions require explicit confirmation in their respective views', async () => {
  const deletions = [];
  const candidate = {id:3,name:'Perfil de teste',phone:'+12025550147'};
  const job = {id:7,title:'Teste'};
  const application = {id:9,job_id:7,job_title:job.title,candidate_id:3,candidate_name:candidate.name,status:'recebido'};
  const users = [{id:1,email:'staff@example.invalid'},{id:2,email:'other@example.invalid'}];
  const api = async (url, options) => {
    const path = url.slice('/api/admin/'.length);
    if (options.method === 'DELETE') { deletions.push(path); return Response.json({deleted:true}); }
    if (path === 'me') return Response.json({admin:users[0]});
    if (path === 'jobs') return Response.json({jobs:[job]});
    if (path === 'applications?job_id=7') return Response.json({applications:[application]});
    if (path === 'candidates/3') return Response.json({candidate,applications:[application]});
    if (path === 'users') return Response.json({users});
    throw new Error('Unexpected path ' + path);
  };
  const {root, formWith, submit, navigate, settle} = await mountAdmin('#admin/vagas/7/inscricoes', api);
  for (const [hash, label, path] of [
    ['#admin/vagas/7/inscricoes','Excluir inscrição','applications/9'],
    ['#admin/candidatos/3','Excluir inscrição','applications/9'],
    ['#admin/equipe','Remover acesso','users/2'],
  ]) {
    await navigate(hash);
    assert.equal(flatten(root).filter(n => n.tag === 'button' && n.textContent === label).length, 1);
    const form = formWith(label);
    const previous = deletions.length;
    await submit(form);
    assert.equal(deletions.length, previous);
    form.elements.confirmation.value = 'EXCLUIR';
    form.elements.confirmation.handlers.input();
    await submit(form); await settle();
    assert.deepEqual(deletions.slice(previous), [path]);
  }
});

test('successful logout clears a navigated admin view and invalidates pending profile reads', async () => {
  const logout = Promise.withResolvers();
  const profile = Promise.withResolvers();
  let authenticated = true;
  let readingProfile = false;
  const api = async url => {
    if (url.endsWith('/me')) return authenticated ? Response.json({admin:{id:1,email:'admin@example.test'}})
      : Response.json({error:'Entre para continuar.'},{status:401});
    if (url.endsWith('/logout')) { await logout.promise; authenticated = false; return Response.json({}); }
    if (url.endsWith('/candidates/3')) { readingProfile = true; return profile.promise; }
    throw new Error('Unexpected path ' + url);
  };
  const { root, formWith, submit, navigate, settle } = await mountAdmin('#admin/vagas/nova', api);
  const original = formWith('Sair da conta');
  const sending = submit(original);
  await navigate('#admin/candidatos/3');
  assert.equal(original.isConnected, false);
  assert.equal(readingProfile, true);
  logout.resolve();
  await sending; await settle();
  assert.ok(formWith('Entrar'), 'Login should replace the newly navigated private shell');
  profile.resolve(Response.json({candidate:{id:3,name:'Private Example'},applications:[]}));
  await settle();
  assert.ok(formWith('Entrar'));
  assert.ok(!flatten(root).some(node => node.textContent === 'Private Example'));
});
