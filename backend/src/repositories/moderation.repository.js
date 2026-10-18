// Пользователи глазами модератора: поиск, карточка, блокировки, роли.
const { pool } = require('../db/postgres');

// Имя, роли, профиль и действующая блокировка – общая часть для списка и карточки
const SELECT_SQL = `
  SELECT u.id, u.email, u.status, u.created_at, u.last_login_at,
         array_remove(array_agg(DISTINCT r.code), NULL) AS roles,
         coalesce(pp.first_name, cp.first_name) AS first_name,
         coalesce(pp.last_name, cp.last_name)   AS last_name,
         coalesce(pp.avatar_key, cp.avatar_key) AS avatar_key,
         pp.verification_status, pp.is_published,
         b.id AS block_id, b.reason AS block_reason, b.blocked_at, b.blocked_until
    FROM users u
    LEFT JOIN user_roles ur            ON ur.user_id = u.id
    LEFT JOIN roles r                  ON r.id = ur.role_id
    LEFT JOIN client_profiles cp       ON cp.user_id = u.id
    LEFT JOIN psychologist_profiles pp ON pp.user_id = u.id
    LEFT JOIN LATERAL (SELECT * FROM user_blocks x WHERE x.user_id = u.id AND x.unblocked_at IS NULL
                        ORDER BY x.blocked_at DESC LIMIT 1) b ON true`;
const GROUP_SQL = 'GROUP BY u.id, cp.user_id, pp.user_id, b.id, b.reason, b.blocked_at, b.blocked_until';

// f: { q, role, status, limit, offset }
async function listUsers(f, db = pool) {
  const params = [];
  const param = (v) => `$${params.push(v)}`;
  const where = [];
  if (f.q) {
    const like = param(`%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(u.email ILIKE ${like} OR concat_ws(' ', cp.first_name, cp.last_name) ILIKE ${like}
                 OR concat_ws(' ', pp.first_name, pp.last_name) ILIKE ${like})`);
  }
  if (f.status) where.push(`u.status = ${param(f.status)}`);
  if (f.role) where.push(`EXISTS (SELECT 1 FROM user_roles x JOIN roles y ON y.id = x.role_id WHERE x.user_id = u.id AND y.code = ${param(f.role)})`);
  const { rows } = await db.query(
    `${SELECT_SQL}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ${GROUP_SQL}
      ORDER BY u.created_at DESC
      LIMIT ${param(f.limit)} OFFSET ${param(f.offset)}`,
    params,
  );
  const { rows: [{ total }] } = await db.query(
    `SELECT count(*)::int AS total FROM users u
       LEFT JOIN client_profiles cp ON cp.user_id = u.id
       LEFT JOIN psychologist_profiles pp ON pp.user_id = u.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    params.slice(0, params.length - 2),
  );
  return { rows, total };
}

async function findUser(id, db = pool) {
  const { rows } = await db.query(`${SELECT_SQL} WHERE u.id = $1 ${GROUP_SQL}`, [id]);
  return rows[0] || null;
}

// История блокировок с именами модераторов
async function listBlocks(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT b.id, b.reason, b.blocked_at, b.blocked_until, b.unblocked_at,
            b.blocked_by, coalesce(split_part(m.email::text, '@', 1), '') AS blocked_by_login,
            b.unblocked_by
       FROM user_blocks b LEFT JOIN users m ON m.id = b.blocked_by
      WHERE b.user_id = $1 ORDER BY b.blocked_at DESC`,
    [userId],
  );
  return rows;
}

// Сколько у пользователя записей (как клиента и как психолога) – для карточки
async function countAppointments(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE client_id = $1)::int AS as_client,
            count(*) FILTER (WHERE psychologist_id = $1)::int AS as_psychologist
       FROM appointments WHERE $1 IN (client_id, psychologist_id)`,
    [userId],
  );
  return rows[0];
}

async function createBlock(userId, moderatorId, reason, until, db = pool) {
  // Статус users.status = 'blocked' ставит триггер trg_user_blocks_sync
  await db.query(
    'INSERT INTO user_blocks (user_id, blocked_by, reason, blocked_until) VALUES ($1, $2, $3, $4)',
    [userId, moderatorId, reason, until],
  );
}

async function removeRole(userId, roleCode, db = pool) {
  await db.query(
    'DELETE FROM user_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE code = $2)',
    [userId, roleCode],
  );
}

async function hasClientProfile(userId, db = pool) {
  const { rows } = await db.query('SELECT 1 FROM client_profiles WHERE user_id = $1', [userId]);
  return rows.length > 0;
}

// Снять анкету психолога с публикации (когда у пользователя забирают роль психолога)
async function unpublishPsychologist(userId, db = pool) {
  await db.query('UPDATE psychologist_profiles SET is_published = false WHERE user_id = $1', [userId]);
}

// ---------- Права ролей ----------

async function findRole(code, db = pool) {
  const { rows } = await db.query('SELECT id, code, name FROM roles WHERE code = $1', [code]);
  return rows[0] || null;
}

async function rolePermissions(roleId, db = pool) {
  const { rows } = await db.query(
    'SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1',
    [roleId],
  );
  return rows.map((r) => r.code);
}

async function replaceRolePermissions(roleId, codes, db = pool) {
  await db.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
  await db.query(
    'INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE code = ANY ($2)',
    [roleId, codes],
  );
}

module.exports = {
  listUsers, findUser, listBlocks, countAppointments, createBlock, removeRole, hasClientProfile,
  unpublishPsychologist, findRole, rolePermissions, replaceRolePermissions,
};
