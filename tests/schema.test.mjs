import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('candidate storage accepts only canonical, unique international phones', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
    const insert = db.prepare('INSERT INTO candidates (name, phone, country) VALUES (?, ?, ?)');
    assert.equal(insert.run('Ana', '+34612345678', 'Espanha').changes, 1);
    for (const phone of ['+34 612 345 678', '34612345678', '+04612345678', '+34123', '+1234567890123456', '+34612345678\u0000extra']) {
      assert.throws(() => insert.run('Bruna', phone, 'Espanha'), /CHECK constraint failed/u);
    }
    assert.throws(() => insert.run('Bruna', '+34612345678', 'Espanha'), /UNIQUE constraint failed/u);
  } finally {
    db.close();
  }
});

test('direct writes require numeric experience from zero through one hundred in both tables', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  db.exec(`INSERT INTO jobs(title,area,country,description) VALUES ('A','Abate','Portugal','Teste');
           INSERT INTO candidates(name,phone,country) VALUES ('Ana','+12025550147','Portugal')`);
  for (const statement of ['UPDATE jobs SET min_years_experience=?', 'UPDATE candidates SET years_experience=?']) {
    const update = db.prepare(statement);
    for (const valid of [0, 2.5, 100]) assert.equal(update.run(valid).changes, 1);
    for (const invalid of ['unknown', '4.5', '', -1, 100.1, Infinity]) {
      assert.throws(() => update.run(invalid), /CHECK constraint failed/u, String(invalid));
    }
  }
});
