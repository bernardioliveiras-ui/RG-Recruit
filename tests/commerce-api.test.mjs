import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleApi } from '../src/api.js';
import * as repo from '../src/repository.js';

const origin = 'https://rg.example';
const schema = ['0001_initial.sql','0002_match_requirements.sql','0003_commercial.sql']
  .map(f=>readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8')).join('\n');

function setup(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(()=>sql.close());
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(schema);
  const DB = {
    prepare(query) {
      const stmt = sql.prepare(query);
      let args = [];
      return {
        bind(...values) { args=values; return this; },
        async first() { return stmt.get(...args)??null; },
        async all() { return {results:stmt.all(...args)}; },
        async run() { return {meta:{changes:stmt.run(...args).changes}}; },
      };
    },
    async batch(statements) { return Promise.all(statements.map(s=>s.all())); },
  };
  const env = {DB,SESSION_SECRET:'very-long-commercial-test-session-secret-0001',ADMIN_SETUP_TOKEN:'first-setup-token'};
  const request = (path,method='GET',data,headers={})=>handleApi(new Request(origin+path,{
    method,headers:{Origin:origin,'Content-Type':'application/json',...headers},
    body:data===undefined?undefined:JSON.stringify(data),
  }),env);
  const authenticate = async()=>{
    assert.equal((await request('/api/admin/bootstrap','POST',{email:'owner@example.test',password:'long valid demo password'},{'X-Admin-Setup-Token':env.ADMIN_SETUP_TOKEN})).status,201);
    const result=await request('/api/admin/login','POST',{email:'owner@example.test',password:'long valid demo password'});
    assert.equal(result.status,200);
    return {Cookie:result.headers.get('Set-Cookie').split(';')[0]};
  };
  return {sql,DB,request,authenticate};
}

test('B2B admin operations reject anonymous requests and bad origins',async t=>{
  const {request,authenticate}=setup(t);
  for(const path of ['/companies','/orders','/categories','/partners']){
    assert.equal((await request('/api/admin'+path)).status,401,path);
    assert.equal((await request('/api/admin'+path,'POST',{})).status,401,path);
  }
  assert.equal((await request('/api/admin/orders/1/approve','POST',{})).status,401);
  const cookie=await authenticate();
  assert.equal((await request('/api/admin/companies','POST',{name:'Falsa'},{...cookie,Origin:'https://evil.example'})).status,403);
  assert.equal((await request('/api/admin/orders/1/approve','POST',{}, {...cookie,Origin:''})).status,403);
});

test('company invoice confirmation controls publication and expiry without affecting legacy jobs',async t=>{
  const {request,authenticate,sql,DB}=setup(t);
  const auth=await authenticate();
  const api=(path,method='GET',data)=>request('/api/admin'+path,method,data,auth);
  const companyResult=await api('/companies','POST',{name:'Iberia Foods',country:'Espanha',email:'contact@example.test',phone:''});
  assert.equal(companyResult.status,201);
  const {company}=await companyResult.json();
  const jobResult=await api('/jobs','POST',{title:'Desossa',area:'Desossa',country:'Espanha',description:'Vaga B2B'});
  assert.equal(jobResult.status,201);
  const {job}=await jobResult.json();
  assert.equal(job.status,'draft');
  const orderResult=await api('/orders','POST',{job_id:job.id,company_id:company.id,amount_cents:14900,duration_days:30});
  assert.equal(orderResult.status,201);
  const {order}=await orderResult.json();
  assert.equal(order.status,'pending');
  assert.equal((await api('/orders','POST',{job_id:job.id,company_id:company.id,amount_cents:9900,duration_days:15})).status,409);
  assert.deepEqual((await (await request('/api/jobs')).json()).jobs,[]);
  assert.equal((await api('/orders/'+order.id+'/approve','POST',{})).status,200);
  assert.equal((await api('/orders/'+order.id+'/approve','POST',{})).status,409);
  assert.deepEqual((await (await request('/api/jobs')).json()).jobs.map(j=>j.id),[job.id]);
  const newOrder=(await (await api('/orders','POST',{job_id:job.id,company_id:company.id,amount_cents:9900,duration_days:15})).json()).order;
  assert.equal(newOrder.status,'pending');
  assert.deepEqual((await (await request('/api/jobs')).json()).jobs.map(j=>j.id),[job.id]);
  sql.prepare('UPDATE ad_orders SET starts_at_ms=?,expires_at_ms=? WHERE id=?')
    .run(Date.now()-2*86400000,Date.now()-1000,order.id);
  assert.deepEqual((await (await request('/api/jobs')).json()).jobs,[]);
  assert.equal(await repo.findPublishedJob(DB,job.id),null);
  sql.exec("INSERT INTO jobs(title,area,country,description,status) VALUES('Legada','Abate','Portugal','Antiga','published')");
  assert.deepEqual((await (await request('/api/jobs')).json()).jobs.map(j=>j.title),['Legada']);
});

test('partner categories and public partner cards obey privacy and validation',async t=>{
  const {request,authenticate}=setup(t);
  const auth=await authenticate();
  const api=(path,method='GET',data)=>request('/api/admin'+path,method,data,auth);
  assert.equal((await api('/categories','POST',{name:'Hospedagem',position:40})).status,201);
  const categories=(await (await api('/categories')).json()).categories;
  const cat=categories.find(x=>x.name==='Hospedagem');
  assert.ok(cat);
  assert.equal((await api('/partners','POST',{category_id:cat.id,name:'Fake',url:'javascript:alert(1)'})).status,400);
  assert.equal((await api('/partners','POST',{category_id:99999,name:'Hotel Europa',url:'https://example.test'})).status,400);
  const created=await api('/partners','POST',{category_id:cat.id,name:'Hotel Europa',description:'Exemplo',url:'https://example.test',logo_url:'',contact:'+34 600 000 000',active:true,position:1});
  assert.equal(created.status,201);
  const id=(await created.json()).partner.id;
  const publicPartners=(await (await request('/api/partners')).json()).partners;
  assert.equal(publicPartners.length,1);
  assert.equal(publicPartners[0].name,'Hotel Europa');
  assert.equal(publicPartners[0].contact,undefined);
  assert.equal((await api('/categories/'+cat.id,'DELETE')).status,409);
  assert.equal((await api('/partners/'+id,'PATCH',{active:false})).status,200);
  assert.deepEqual((await (await request('/api/partners')).json()).partners,[]);
  assert.equal((await api('/partners/'+id,'DELETE')).status,200);
  assert.equal((await api('/categories/'+cat.id,'DELETE')).status,200);
});

test('expired paid advertisement cannot receive a direct candidate insert',async t=>{
  const {sql,DB}=setup(t);
  sql.exec("INSERT INTO companies(name,country) VALUES('Food','Portugal'); INSERT INTO jobs(title,area,country,description,status) VALUES('Abate','Abate','Portugal','Vaga','published')");
  sql.prepare(`INSERT INTO ad_orders(job_id,company_id,amount_cents,duration_days,status,starts_at_ms,expires_at_ms,approved_at_ms)
    VALUES(1,1,10000,7,'paid',?,?,?)`).run(Date.now()-8*86400000,Date.now()-86400000,Date.now()-8*86400000);
  const profile={name:'Exemplo',phone:'+351911111111',email:'',country:'Portugal',city:'',areas:['Abate'],years_experience:1,experiences:[],skills:[],languages:[],qualifications:[],willing_to_relocate:false,notes:''};
  assert.equal(await repo.upsertCandidateAndApply(DB,profile,1),false);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM candidates').get().n,0);
});

test('new jobs cannot be published directly without a confirmed commercial contract',async t=>{
  const {request,authenticate,sql}=setup(t);
  const auth=await authenticate();
  const api=(path,method='GET',data)=>request('/api/admin'+path,method,data,auth);
  const vacancy={title:'Abate industrial',area:'Abate',country:'Portugal',description:'Vaga comercial'};
  assert.equal((await api('/jobs','POST',{...vacancy,status:'published'})).status,409);
  const job=(await (await api('/jobs','POST',vacancy)).json()).job;
  assert.equal(job.status,'draft');
  assert.equal((await api('/jobs/'+job.id,'PATCH',{status:'published'})).status,409);
  assert.deepEqual((await (await request('/api/jobs')).json()).jobs,[]);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM jobs WHERE status='published'").get().n,0);
});
