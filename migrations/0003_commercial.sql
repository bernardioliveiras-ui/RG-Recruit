-- Additive B2B extension. Do not modify or remove existing jobs, candidates or logins.
-- Existing listings are grandfathered in; every new listing requires a paid commercial contract.
ALTER TABLE jobs ADD COLUMN billing_required INTEGER NOT NULL DEFAULT 0 CHECK (billing_required IN (0,1));

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  country TEXT NOT NULL CHECK (length(trim(country)) BETWEEN 2 AND 100),
  email TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ad_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 100 AND 100000000),
  duration_days INTEGER NOT NULL CHECK (typeof(duration_days) = 'integer' AND duration_days BETWEEN 1 AND 365),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  starts_at_ms INTEGER,
  expires_at_ms INTEGER,
  approved_at_ms INTEGER,
  approved_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status = 'paid' AND typeof(starts_at_ms) = 'integer' AND typeof(expires_at_ms) = 'integer' AND expires_at_ms > starts_at_ms AND approved_at_ms IS NOT NULL)
    OR (status IN ('pending','cancelled') AND starts_at_ms IS NULL AND expires_at_ms IS NULL AND approved_at_ms IS NULL))
);
CREATE UNIQUE INDEX ad_orders_one_pending_per_job ON ad_orders (job_id) WHERE status = 'pending';
CREATE INDEX ad_orders_job_status_expiry ON ad_orders (job_id, status, expires_at_ms);
CREATE INDEX ad_orders_company ON ad_orders (company_id, created_at);

CREATE TRIGGER ad_order_paid_publishes_job
AFTER UPDATE OF status ON ad_orders
WHEN NEW.status = 'paid' AND OLD.status = 'pending'
BEGIN
  UPDATE jobs SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = NEW.job_id;
END;

CREATE TABLE partner_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 2 AND 80),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 100000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO partner_categories (name,position) VALUES
  ('Passagens aéreas',10),('Jurídico',20),('Automóveis',30);

CREATE TABLE partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES partner_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1600),
  url TEXT NOT NULL DEFAULT '' CHECK (length(url) <= 500),
  logo_url TEXT NOT NULL DEFAULT '' CHECK (length(logo_url) <= 500),
  contact TEXT NOT NULL DEFAULT '' CHECK (length(contact) <= 160),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 100000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX partners_active_category_position ON partners (active, category_id, position, id);
