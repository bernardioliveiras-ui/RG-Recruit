const publicJobColumns = `
  id, title, area, country, city, description, requirements, skills, required_skills, languages, qualifications,
  min_years_experience, status, created_at, updated_at
`;

// Existing vacancies with no commercial order are preserved as legacy listings.
// Once a vacancy has a paid-ad order, payment AND the current time control visibility.
const paidVisibility = `((jobs.billing_required=0 AND NOT EXISTS (SELECT 1 FROM ad_orders orders WHERE orders.job_id=jobs.id))
  OR EXISTS (SELECT 1 FROM ad_orders active WHERE active.job_id=jobs.id
    AND active.status='paid' AND active.starts_at_ms<=? AND active.expires_at_ms>?))`;

function decodeJob(row) {
  return {
    ...row,
    skills: JSON.parse(row.skills),
    required_skills: JSON.parse(row.required_skills),
    languages: JSON.parse(row.languages),
    qualifications: JSON.parse(row.qualifications),
  };
}

export async function listPublishedJobs(db, { country = '', area = '' } = {}) {
  const clauses = ["status = 'published'",paidVisibility];
  const moment = Date.now();
  const values = [moment,moment];
  if (country) {
    clauses.push('country = ?');
    values.push(country);
  }
  if (area) {
    clauses.push('area = ?');
    values.push(area);
  }
  const query = db.prepare(`
    SELECT ${publicJobColumns} FROM jobs
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC, id DESC
  `);
  const { results } = await (values.length ? query.bind(...values) : query).all();
  return results.map(decodeJob);
}

export async function findPublishedJob(db, id) {
  const row = await db.prepare(`
    SELECT ${publicJobColumns} FROM jobs WHERE id = ? AND status = 'published' AND ${paidVisibility}
  `).bind(id,Date.now(),Date.now()).first();
  return row ? decodeJob(row) : null;
}

export async function upsertCandidateAndApply(db, profile, jobId) {
  const moment = Date.now();
  const [, , job] = await db.batch([
    db.prepare(`
      INSERT INTO candidates (
        name, phone, email, country, city, areas, years_experience, experiences, skills, languages,
        qualifications, willing_to_relocate, notes
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM jobs WHERE id = ? AND status = 'published' AND ${paidVisibility})
      ON CONFLICT(phone) DO NOTHING
    `).bind(
      profile.name, profile.phone, profile.email, profile.country, profile.city,
      JSON.stringify(profile.areas), profile.years_experience, JSON.stringify(profile.experiences),
      JSON.stringify(profile.skills), JSON.stringify(profile.languages), JSON.stringify(profile.qualifications),
      Number(profile.willing_to_relocate), profile.notes, jobId,moment,moment,
    ),
    db.prepare(`
      INSERT INTO applications (candidate_id, job_id)
      SELECT candidates.id, jobs.id FROM candidates
      JOIN jobs ON jobs.id = ? AND jobs.status = 'published' AND ${paidVisibility}
      WHERE candidates.phone = ?
      ON CONFLICT(candidate_id, job_id) DO NOTHING
    `).bind(jobId,moment,moment,profile.phone),
    db.prepare(`SELECT id FROM jobs WHERE id = ? AND status = 'published' AND ${paidVisibility}`).bind(jobId,moment,moment),
  ]);
  return job.results.length > 0;
}

const adminColumns = 'id, email, created_at';

export function createAdmin(db, email, passwordHash, firstOnly) {
  const guard = firstOnly ? 'WHERE NOT EXISTS (SELECT 1 FROM admins)' : 'WHERE 1';
  return db.prepare(`
    INSERT INTO admins (email, password_hash) SELECT ?, ? ${guard}
    ON CONFLICT(email) DO NOTHING RETURNING ${adminColumns}
  `).bind(email, passwordHash).first();
}

export async function saveSession(db, tokenHash, adminId, expiresAt, now) {
  await db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now).run();
  await db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, adminId, expiresAt).run();
}

export function getSessionAdmin(db, tokenHash, adminId, now) {
  return db.prepare(`
    SELECT a.id, a.email, a.created_at FROM admins a
    JOIN admin_sessions s ON s.admin_id = a.id
    WHERE a.id = ? AND s.token_hash = ? AND s.expires_at > ?
  `).bind(adminId, tokenHash, now).first();
}

export function revokeSession(db, tokenHash) {
  return db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export function getLogin(db, email) {
  return db.prepare(`SELECT ${adminColumns}, password_hash FROM admins WHERE email = ?`).bind(email).first();
}

export async function listAdmins(db) {
  return (await db.prepare(`SELECT ${adminColumns} FROM admins ORDER BY id`).all()).results;
}

export function removeAdmin(db, targetId, actorId) {
  // Check the acting account in the same statement so simultaneous removals cannot empty the team.
  return db.prepare(`
    DELETE FROM admins WHERE id = ? AND id <> ? AND EXISTS (SELECT 1 FROM admins WHERE id = ?)
    RETURNING id
  `).bind(targetId, actorId, actorId).first();
}

export async function reserveLogin(db, key, now, windowSeconds, limit) {
  const cutoff = now - windowSeconds;
  return db.prepare(`
    INSERT INTO login_attempts (key, attempts, window_start) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN window_start <= ? THEN 1 ELSE MIN(attempts + 1, ?) END,
      window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
    RETURNING attempts, window_start
  `).bind(key, now, cutoff, limit + 1, cutoff).first();
}

export async function listJobs(db) {
  return (await db.prepare(`SELECT ${publicJobColumns} FROM jobs ORDER BY created_at DESC, id DESC`).all()).results.map(decodeJob);
}

export async function dashboardStats(db) {
  const [totals, recent] = await db.batch([
    db.prepare(`SELECT (SELECT COUNT(*) FROM jobs WHERE status = 'published') AS published_jobs,
      (SELECT COUNT(*) FROM candidates) AS candidates, (SELECT COUNT(*) FROM applications) AS applications`),
    db.prepare('SELECT id, title, area, city, country, status FROM jobs ORDER BY created_at DESC, id DESC LIMIT 3'),
  ]);
  return { counts: totals.results[0], recent_jobs: recent.results };
}

export async function getJob(db, id) {
  const row = await db.prepare(`SELECT ${publicJobColumns} FROM jobs WHERE id = ?`).bind(id).first();
  return row ? decodeJob(row) : null;
}

export async function canPublishJob(db, id) {
  const time = Date.now();
  const row = await db.prepare(`SELECT jobs.id FROM jobs WHERE jobs.id = ? AND
    (jobs.billing_required = 0 OR EXISTS (
      SELECT 1 FROM ad_orders active WHERE active.job_id=jobs.id
      AND active.status='paid' AND active.starts_at_ms<=? AND active.expires_at_ms>?
    ))`).bind(id,time,time).first();
  return Boolean(row);
}

const writableJobFields = [
  'title', 'area', 'country', 'city', 'description', 'requirements', 'skills', 'required_skills',
  'languages', 'qualifications', 'min_years_experience', 'status',
];

function jobValue(job, field) {
  return ['skills', 'required_skills', 'languages', 'qualifications'].includes(field)
    ? JSON.stringify(job[field]) : job[field];
}

export async function createJob(db, job) {
  const fields = writableJobFields;
  const row = await db.prepare(`
    INSERT INTO jobs (${fields.join(', ')}, billing_required) VALUES (${fields.map(() => '?').join(', ')}, 1)
    RETURNING ${publicJobColumns}
  `).bind(...fields.map(field => jobValue(job, field))).first();
  return decodeJob(row);
}

export async function patchJob(db, id, job, patch) {
  const fields = writableJobFields.filter(field => Object.hasOwn(patch, field));
  if (!fields.length) return getJob(db, id);
  const row = await db.prepare(`
    UPDATE jobs SET ${fields.map(field => field + ' = ?').join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? RETURNING ${publicJobColumns}
  `).bind(...fields.map(field => jobValue(job, field)), id).first();
  return row ? decodeJob(row) : null;
}

function decodeCandidate(row) {
  return {
    ...row, areas: JSON.parse(row.areas), skills: JSON.parse(row.skills),
    experiences: JSON.parse(row.experiences), qualifications: JSON.parse(row.qualifications),
    languages: JSON.parse(row.languages), willing_to_relocate: Boolean(row.willing_to_relocate),
  };
}

export async function listCandidates(db, { q, country, area }, jobId) {
  const clauses = [];
  const values = [];
  if (q) {
    clauses.push('(instr(lower(c.name), lower(?)) > 0 OR instr(c.phone, ?) > 0 OR instr(lower(c.email), lower(?)) > 0)');
    values.push(q, q, q);
  }
  if (country) {
    clauses.push('c.country = ? COLLATE NOCASE');
    values.push(country);
  }
  if (area) {
    clauses.push('EXISTS (SELECT 1 FROM json_each(c.areas) WHERE value = ? COLLATE NOCASE)');
    values.push(area);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const fields = 'c.id, c.name, c.country, c.city, c.areas, c.years_experience';
  const join = jobId ? 'LEFT JOIN applications a ON a.candidate_id = c.id AND a.job_id = ?' : '';
  const extra = jobId ? ', c.skills, c.languages, c.qualifications, c.experiences, c.willing_to_relocate, a.id AS application_id, a.status' : '';
  const stmt = db.prepare(`SELECT ${fields}${extra} FROM candidates c ${join} ${where} ORDER BY c.name COLLATE NOCASE, c.id`);
  if (jobId) values.unshift(jobId);
  const { results } = await (values.length ? stmt.bind(...values) : stmt).all();
  return jobId ? results.map(decodeCandidate) : results.map(row => ({ ...row, areas: JSON.parse(row.areas) }));
}

export async function getCandidate(db, id) {
  const row = await db.prepare('SELECT * FROM candidates WHERE id = ?').bind(id).first();
  return row ? decodeCandidate(row) : null;
}

export async function deleteCandidate(db, id) {
  return db.prepare('DELETE FROM candidates WHERE id = ? RETURNING id').bind(id).first();
}

export async function listApplications(db, { candidateId, jobId } = {}) {
  const stmt = db.prepare(`
    SELECT a.*, j.title AS job_title, c.name AS candidate_name
    FROM applications a INNER JOIN jobs j ON j.id = a.job_id INNER JOIN candidates c ON c.id = a.candidate_id
    ${candidateId ? 'WHERE a.candidate_id = ?' : jobId ? 'WHERE a.job_id = ?' : ''}
    ORDER BY a.created_at DESC, a.id DESC
  `);
  const bound = candidateId || jobId ? stmt.bind(candidateId || jobId) : stmt;
  return (await bound.all()).results;
}

export function updateApplication(db, id, status) {
  return db.prepare(`
    UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *
  `).bind(status, id).first();
}

export function deleteApplication(db, id) {
  return db.prepare('DELETE FROM applications WHERE id = ? RETURNING id').bind(id).first();
}

export function releaseLoginAttempt(db, key, start) {
  return db.prepare('UPDATE login_attempts SET attempts = MAX(0, attempts - 1) WHERE key = ? AND window_start = ?')
    .bind(key, start).run();
}

export function pruneLoginAttempts(db, cutoff) {
  return db.prepare('DELETE FROM login_attempts WHERE window_start <= ?').bind(cutoff).run();
}
