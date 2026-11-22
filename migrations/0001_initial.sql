CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX admin_sessions_expiry_idx ON admin_sessions (expires_at);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  requirements TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  languages TEXT NOT NULL DEFAULT '[]',
  -- No affinity: validate the incoming storage class before numeric comparisons.
  min_years_experience NOT NULL DEFAULT 0 CHECK (
    typeof(min_years_experience) IN ('integer', 'real') AND min_years_experience BETWEEN 0 AND 100
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE CHECK (
    typeof(phone) = 'text' AND instr(phone, char(0)) = 0
    AND length(phone) BETWEEN 8 AND 16
    AND phone GLOB '+[1-9]*'
    AND substr(phone, 2) NOT GLOB '*[^0-9]*'
  ),
  email TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  areas TEXT NOT NULL DEFAULT '[]',
  years_experience NOT NULL DEFAULT 0 CHECK (
    typeof(years_experience) IN ('integer', 'real') AND years_experience BETWEEN 0 AND 100
  ),
  skills TEXT NOT NULL DEFAULT '[]',
  languages TEXT NOT NULL DEFAULT '[]',
  willing_to_relocate INTEGER NOT NULL DEFAULT 0 CHECK (willing_to_relocate IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'em_analise', 'selecionado', 'recusado')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (candidate_id, job_id)
);

CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_start INTEGER NOT NULL
);

CREATE INDEX jobs_status_country_area_idx ON jobs (status, country, area);
CREATE INDEX applications_job_idx ON applications (job_id);
