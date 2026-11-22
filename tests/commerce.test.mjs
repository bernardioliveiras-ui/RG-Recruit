import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as commerce from '../src/commerce.js';

const migrationPath = name => new URL('../migrations/' + name, import.meta.url);
const base = ['0001_initial.sql', '0002_match_requirements.sql']
  .map(name => readFileSync(migrationPath(name), 'utf8')).join('\n');

function setup(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(base);
  return sql;
}

function binding(sql) {
  return {
    prepare(query) {
      const statement = sql.prepare(query);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return { meta: { changes: statement.run(...values).changes } }; },
      };
    },
  };
}

test('commercial schema is additive and preserves an existing published job', t => {
  const sql = setup(t);
  sql.exec("INSERT INTO jobs (title,area,country,description,status) VALUES ('Existente','Abate','Portugal','Vaga anterior','published')");
  const migration = readFileSync(migrationPath('0003_commercial.sql'), 'utf8');
  sql.exec(migration);
  for (const table of ['companies','ad_orders','partner_categories','partners']) {
    assert.equal(sql.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name=?").get(table).n, 1);
  }
  assert.equal(sql.prepare("SELECT status FROM jobs WHERE title='Existente'").get().status, 'published');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM partner_categories').get().n, 3);
});

test('paid order publishes once and renewal waits for a second paid order', async t => {
  const sql = setup(t);
  sql.exec(readFileSync(migrationPath('0003_commercial.sql'), 'utf8'));
  sql.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO admins(email,password_hash) VALUES('ramon@example.test','salted');
    INSERT INTO jobs(title,area,country,description,status) VALUES('Desossa','Desossa','Espanha','Vaga','draft');`);
  const db = binding(sql);
  const company = await commerce.saveCompany(db, { name:'Iberia Foods',country:'Espanha',email:'',phone:'' });
  assert.equal(company.name, 'Iberia Foods');
  const first = await commerce.createOrder(db, { job_id:1,company_id:company.id,amount_cents:14900,duration_days:30 });
  assert.equal(first.status, 'pending');
  assert.equal(sql.prepare('SELECT status FROM jobs WHERE id=1').get().status, 'draft');
  const now = 1795350000000;
  const approved = await commerce.approveOrder(db, first.id, 1, now);
  assert.equal(approved.status, 'paid');
  assert.equal(approved.starts_at_ms, now);
  assert.equal(approved.expires_at_ms, now + 30 * 86400000);
  assert.equal(sql.prepare('SELECT status FROM jobs WHERE id=1').get().status, 'published');
  assert.equal(await commerce.approveOrder(db, first.id, 1, now), null);
  const second = await commerce.createOrder(db, { job_id:1,company_id:company.id,amount_cents:9900,duration_days:15 });
  assert.equal(second.status,'pending');
  assert.equal(sql.prepare("SELECT MAX(expires_at_ms) exp FROM ad_orders WHERE status='paid'").get().exp, now + 30 * 86400000);
  const renewal = await commerce.approveOrder(db, second.id, 1, now + 2 * 86400000);
  assert.equal(renewal.starts_at_ms, now + 30 * 86400000);
  assert.equal(renewal.expires_at_ms, now + 45 * 86400000);
  assert.equal((await commerce.listAdOrders(db)).length, 2);
});

test('partners and categories remain editable without exposing disabled partners', async t => {
  const sql = setup(t);
  sql.exec(readFileSync(migrationPath('0003_commercial.sql'), 'utf8'));
  sql.exec('PRAGMA foreign_keys=ON');
  const db = binding(sql);
  const category = await commerce.saveCategory(db,{name:'Hospedagem',position:5});
  const partner = await commerce.savePartner(db,{name:'Hotel Exemplo',category_id:category.id,description:'Apoio',url:'https://example.com',logo_url:'',contact:'',active:1,position:2});
  assert.equal((await commerce.listPartners(db,{publicOnly:true}))[0].name, 'Hotel Exemplo');
  await commerce.savePartner(db,{...partner,active:0},partner.id);
  assert.deepEqual(await commerce.listPartners(db,{publicOnly:true}),[]);
  const renamed = await commerce.saveCategory(db,{name:'Hospedagem e seguros',position:5},category.id);
  assert.equal(renamed.name,'Hospedagem e seguros');
  assert.equal(await commerce.deleteCategory(db,category.id),'in_use');
  assert.equal(await commerce.deletePartner(db,partner.id),true);
  assert.equal(await commerce.deleteCategory(db,category.id),'deleted');
});
