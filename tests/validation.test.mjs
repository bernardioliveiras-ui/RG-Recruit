import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePhone, validateApplicant, validateJob } from '../src/validation.js';

const applicant = {
  job_id: '23', name: '  Anaïs João 李  ', phone: '+351 (912) 345-678',
  country: '  São Tomé e Príncipe  ', city: 'São Tomé', areas: 'Abate, Desossa',
  years_experience: '3', skills: 'Desossa\nEmbalamento', languages: ['Português'],
  willing_to_relocate: false, consent: true,
};
const job = { title: 'Desossador', area: 'Desossa', country: 'España', description: 'Oportunidade de trabalho.' };

test('normalizes international WhatsApp numbers without assuming a country', () => {
  assert.equal(normalizePhone('+61 (412) 345-678'), '+61412345678');
  assert.equal(normalizePhone('+34 612 345 678'), '+34612345678');
  assert.equal(normalizePhone('+351 (912) 345-678'), '+351912345678');
  for (const invalid of ['612345678', '+0612345678', '+351 912 ABC 678', '+351+912345678', '+35112', '+1234567890123456']) {
    assert.equal(normalizePhone(invalid), '');
  }
});

test('retains non-ASCII names and country values in applicant profiles', () => {
  const result = validateApplicant(applicant);
  assert.equal(result.ok, true);
  assert.equal(result.value.name, 'Anaïs João 李');
  assert.equal(result.value.country, 'São Tomé e Príncipe');
  assert.equal(result.value.phone, '+351912345678');
  assert.equal(result.value.job_id, 23);
  assert.equal(result.value.years_experience, 3);
  assert.deepEqual(result.value.areas, ['Abate', 'Desossa']);
  assert.deepEqual(result.value.skills, ['Desossa', 'Embalamento']);
});

test('rejects invalid vacancy IDs, missing residence data, and absent consent', () => {
  for (const job_id of [0, -1, 1.5, '1e2', '', true, null, '9007199254740992']) {
    assert.ok(validateApplicant({ ...applicant, job_id }).errors.job_id);
  }
  const result = validateApplicant({ ...applicant, country: ' ', city: '', consent: 'false' });
  assert.equal(result.ok, false);
  for (const field of ['country', 'consent']) assert.ok(result.errors[field]);
  assert.equal(validateApplicant(null).ok, false);
});

test('rejects malformed optional email and invalid experience', () => {
  const result = validateApplicant({ ...applicant, email: 'invalid', years_experience: -1 });
  assert.ok(result.errors.email);
  assert.ok(result.errors.years_experience);
});

test('requires a vacancy country and accepts optional city and criteria', () => {
  assert.ok(validateJob({ ...job, country: '' }).errors.country);
  const result = validateJob(job);
  assert.equal(result.ok, true);
  assert.equal(result.value.country, 'España');
  assert.equal(result.value.city, '');
  assert.equal(result.value.min_years_experience, 0);
  assert.deepEqual(result.value.skills, []);
  assert.deepEqual(result.value.languages, []);
  assert.equal(result.value.status, 'draft');
  assert.ok(validateJob({ ...job, status: 'unknown' }).errors.status);
  assert.equal(validateJob([]).ok, false);
});
