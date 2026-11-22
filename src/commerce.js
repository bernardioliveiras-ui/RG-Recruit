// All commercial writes are private and parameterized. No payment gateway is connected.

export async function listCompanies(db) {
  return (await db.prepare('SELECT id,name,country,email,phone,active,created_at,updated_at FROM companies ORDER BY id DESC').all()).results;
}

export function getCompany(db, id) {
  return db.prepare('SELECT id,name,country,email,phone,active,created_at,updated_at FROM companies WHERE id=?').bind(id).first();
}

export function saveCompany(db, c, id) {
  return id ? db.prepare(`
    UPDATE companies SET name=?,country=?,email=?,phone=?,active=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? RETURNING *
  `).bind(c.name,c.country,c.email,c.phone,c.active,id).first() : db.prepare(`
    INSERT INTO companies(name,country,email,phone,active) VALUES(?,?,?,?,?) RETURNING *
  `).bind(c.name,c.country,c.email,c.phone,c.active ?? 1).first();
}

export async function listAdOrders(db) {
  return (await db.prepare(`
    SELECT o.*,j.title AS job_title,j.status AS job_status,
      c.name AS company_name,c.country AS company_country
    FROM ad_orders o JOIN jobs j ON j.id=o.job_id JOIN companies c ON c.id=o.company_id
    ORDER BY o.id DESC
  `).all()).results;
}

export function getOrder(db, id) {
  return db.prepare('SELECT * FROM ad_orders WHERE id=?').bind(id).first();
}

export function createOrder(db, order) {
  return db.prepare(`
    INSERT INTO ad_orders(job_id,company_id,amount_cents,duration_days)
    SELECT j.id,c.id,?,? FROM jobs j JOIN companies c ON c.id=? AND c.active=1
    WHERE j.id=? AND NOT EXISTS (
      SELECT 1 FROM ad_orders existing WHERE existing.job_id=j.id AND existing.status='pending'
    ) RETURNING *
  `).bind(order.amount_cents,order.duration_days,order.company_id,order.job_id).first();
}

export function approveOrder(db, id, adminId, nowMs = Date.now()) {
  // One conditional UPDATE atomically wins a pending order. The trigger publishes the job.
  // The correlated MAX serializes renewals against the latest previously paid term.
  const previous = `(SELECT MAX(p.expires_at_ms) FROM ad_orders p
    WHERE p.job_id=ad_orders.job_id AND p.status='paid' AND p.id<>ad_orders.id)`;
  return db.prepare(`
    UPDATE ad_orders SET
      starts_at_ms=MAX(?,COALESCE(${previous},0)),
      expires_at_ms=MAX(?,COALESCE(${previous},0))+duration_days*86400000,
      approved_at_ms=?,approved_by=?,status='paid'
    WHERE id=? AND status='pending' RETURNING *
  `).bind(nowMs,nowMs,nowMs,adminId,id).first();
}

export function cancelOrder(db, id) {
  return db.prepare("UPDATE ad_orders SET status='cancelled' WHERE id=? AND status='pending' RETURNING *").bind(id).first();
}

export async function listCategories(db) {
  return (await db.prepare('SELECT id,name,position FROM partner_categories ORDER BY position,id').all()).results;
}

export function getCategory(db, id) {
  return db.prepare('SELECT id,name,position FROM partner_categories WHERE id=?').bind(id).first();
}

export function saveCategory(db, c, id) {
  return id ? db.prepare('UPDATE partner_categories SET name=?,position=? WHERE id=? RETURNING id,name,position')
    .bind(c.name,c.position,id).first() : db.prepare('INSERT INTO partner_categories(name,position) VALUES(?,?) RETURNING id,name,position')
      .bind(c.name,c.position).first();
}

export async function deleteCategory(db, id) {
  const row = await db.prepare(`
    DELETE FROM partner_categories WHERE id=? AND NOT EXISTS (
      SELECT 1 FROM partners WHERE partners.category_id=partner_categories.id
    ) RETURNING id
  `).bind(id).first();
  if (row) return 'deleted';
  return await getCategory(db,id) ? 'in_use' : 'not_found';
}

export async function listPartners(db, { publicOnly = false } = {}) {
  const fields = publicOnly
    ? 'p.id,p.name,p.description,p.url,p.logo_url,p.category_id,c.name AS category,p.position'
    : 'p.*,c.name AS category';
  return (await db.prepare(`
    SELECT ${fields} FROM partners p JOIN partner_categories c ON c.id=p.category_id
    ${publicOnly ? 'WHERE p.active=1' : ''}
    ORDER BY c.position,p.position,p.id
  `).all()).results;
}

export function getPartner(db, id) {
  return db.prepare('SELECT * FROM partners WHERE id=?').bind(id).first();
}

export function savePartner(db, p, id) {
  return id ? db.prepare(`
    UPDATE partners SET category_id=?,name=?,description=?,url=?,logo_url=?,contact=?,
      active=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *
  `).bind(p.category_id,p.name,p.description,p.url,p.logo_url,p.contact,p.active,p.position,id).first()
    : db.prepare(`
      INSERT INTO partners(category_id,name,description,url,logo_url,contact,active,position)
      VALUES(?,?,?,?,?,?,?,?) RETURNING *
    `).bind(p.category_id,p.name,p.description,p.url,p.logo_url,p.contact,p.active,p.position).first();
}

export async function deletePartner(db, id) {
  return Boolean(await db.prepare('DELETE FROM partners WHERE id=? RETURNING id').bind(id).first());
}
