// Журнал действий модераторов (audit_log): кто, что, над чем и подробности.
const { pool } = require('../db/postgres');

async function log({ actorId, action, entityType, entityId = null, details = {}, ip = null }, db = pool) {
  await db.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, action, entityType, entityId, details, ip],
  );
}

// Записи журнала: фильтр по действию (точно или по началу: 'user.'), автору, тексту; страницами
async function list({ action, actorId, q, limit, offset }, db = pool) {
  const params = [];
  const param = (v) => `$${params.push(v)}`;
  const where = [];
  if (action) where.push(action.endsWith('.') ? `l.action LIKE ${param(`${action}%`)}` : `l.action = ${param(action)}`);
  if (actorId) where.push(`l.actor_id = ${param(actorId)}`);
  if (q) where.push(`(l.details::text ILIKE ${param(`%${q}%`)} OR l.action ILIKE ${param(`%${q}%`)})`);
  const { rows } = await db.query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.ip, l.created_at,
            l.actor_id, u.email AS actor_email,
            coalesce(cp.first_name || coalesce(' ' || cp.last_name, ''), pp.first_name || ' ' || pp.last_name,
                     split_part(u.email::text, '@', 1)) AS actor_name,
            count(*) OVER () AS total
       FROM audit_log l
       LEFT JOIN users u                  ON u.id = l.actor_id
       LEFT JOIN client_profiles cp       ON cp.user_id = l.actor_id
       LEFT JOIN psychologist_profiles pp ON pp.user_id = l.actor_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ${param(limit)} OFFSET ${param(offset)}`,
    params,
  );
  return { rows, total: rows.length ? rows[0].total : 0 };
}

module.exports = { log, list };
