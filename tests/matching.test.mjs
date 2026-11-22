import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreCandidate } from '../src/matching.js';

const job = {
  area: 'Expedição e transporte', skills: ['Conferência', 'Embalamento'],
  min_years_experience: 4, languages: ['Português'], country: 'Portugal',
};
const strong = {
  areas: [' expedição e transporte '], skills: ['conferencia', 'EMBALAMENTO'],
  years_experience: 7, languages: ['Português'], country: 'portugal',
};
const partial = {
  areas: ['Expedição e transporte'], skills: ['Embalamento', 'Embalamento'],
  years_experience: 2, languages: ['Español'], country: 'España', willing_to_relocate: true,
};

test('scores complete matches above partial and empty matches with deterministic explanations', () => {
  const complete = scoreCandidate(job, strong);
  const medium = scoreCandidate(job, partial);
  const empty = scoreCandidate(job, {});
  assert.equal(complete.score, 100);
  assert.ok(complete.score > medium.score && medium.score > empty.score);
  assert.equal(empty.score, 0);
  assert.deepEqual(Object.keys(medium.breakdown), ['area', 'skills', 'experience', 'languages', 'location']);
  assert.equal(medium.reasons.length, 5);
  assert.deepEqual(scoreCandidate(job, partial), medium);
});

test('returns zero with no applicable criteria', () => {
  const result = scoreCandidate({ skills: [], languages: [], min_years_experience: 0 }, strong);
  assert.equal(result.score, 0);
  assert.deepEqual(result.breakdown, {});
  assert.equal(result.reasons.length, 1);
});

test('scores partial overlap against configured criteria only', () => {
  const result = scoreCandidate({ skills: ['Embalamento', 'Conferência', 'embalamento'] }, partial);
  assert.equal(result.score, 50);
  assert.deepEqual(Object.keys(result.breakdown), ['skills']);
});

test('ignores sensitive attributes and contact information', () => {
  assert.deepEqual(scoreCandidate(job, {
    ...partial, name: 'Ana', gender: 'feminino', nationality: 'Brasileira', age: 34,
    phone: '+5541998765432', notes: 'Portuguesa',
  }), scoreCandidate(job, partial));
});

test('preserves meaningful non-Latin marks while matching equivalent Unicode spellings', () => {
  assert.equal(scoreCandidate({ skills:['ば'] }, { skills:['は'] }).score, 0);
  assert.equal(scoreCandidate({ skills:['ば'] }, { skills:['ば'.normalize('NFD')] }).score, 100);
  assert.equal(scoreCandidate({ skills:['Conferência'] }, { skills:['conferencia'] }).score, 100);
});

test('matches multilingual country names to the same residence criterion', () => {
  const vacancy = { area: 'Desossa', country: 'España' };
  const applicant = { areas: ['Desossa'], country: 'Espanha' };
  assert.equal(scoreCandidate(vacancy, applicant).score, 100);
  assert.equal(scoreCandidate(vacancy, { ...applicant, country: 'ES' }).score, 100);
  assert.equal(scoreCandidate(vacancy, { ...applicant, country: 'Portugal' }).score, 75);
  assert.equal(scoreCandidate({ country: 'País novo' }, { country: 'pais novo' }).score, 100);
});
