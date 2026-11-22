import assert from 'node:assert/strict';
import test from 'node:test';
import { adminRoute } from '../public/admin.js';
import { moneyToCents, adOrderState } from '../public/admin-commerce.js';

test('new B2B screens are reachable only within the authenticated admin router',()=>{
  for(const [url,expected] of [
    ['#admin/empresas','companies'],['#admin/pagamentos','payments'],
    ['#admin/parceiros','partners'],
  ])assert.equal(adminRoute(url)?.view,expected);
  assert.equal(adminRoute('#empresas'),null);
  assert.equal(adminRoute('#admin/pagamentos/99999999999999999').view,'missing');
});

test('euro money inputs map exactly to integer cents without floating error',()=>{
  for(const [raw,expected] of [['149',14900],['149,90',14990],['149.90',14990],['1,01',101],['1000000',100000000]]){
    assert.equal(moneyToCents(raw),expected);
  }
  for(const bad of ['', '0', '-5', '1,999', 'abc', '1.234,56', '1000001'])assert.equal(moneyToCents(bad),null);
});

test('ad status distinguishes pending renewals from ended or unpaid exposure',()=>{
  const job={id:3,status:'published'};
  const now=1800000000000;
  assert.equal(adOrderState(job,[{job_id:3,status:'pending'}],now).kind,'pending');
  assert.equal(adOrderState(job,[{job_id:3,status:'paid',starts_at_ms:now-5000,expires_at_ms:now+5000},{job_id:3,status:'pending'}],now).kind,'active');
  assert.equal(adOrderState(job,[{job_id:3,status:'paid',starts_at_ms:now-10000,expires_at_ms:now-1}],now).kind,'expired');
  assert.equal(adOrderState({id:4,status:'draft'},[],now).kind,'draft');
});
