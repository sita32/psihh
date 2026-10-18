// Роли и права (RBAC): roles, permissions, role_permissions, представление
// v_user_effective_permissions; кэш прав пользователя в Redis (perms:{userId}).
const { pool } = require('../db/postgres');
const redis = require('../db/redis');

// Коды прав пользователя по всем его ролям
async function findUserPermissions(userId, db = pool) {
  const { rows } = await db.query(
    'SELECT permission FROM v_user_effective_permissions WHERE user_id = $1 ORDER BY permission',
    [userId],
  );
  return rows.map((r) => r.permission);
}

// Роли с кодами их прав
async function findRolesWithPermissions(db = pool) {
  const { rows } = await db.query(
    `SELECT r.code, r.name, r.description,
            array_remove(array_agg(p.code ORDER BY p.id), NULL) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p       ON p.id = rp.permission_id
      GROUP BY r.id
      ORDER BY r.id`,
  );
  return rows;
}

async function findAllPermissions(db = pool) {
  const { rows } = await db.query('SELECT code, module, description FROM permissions ORDER BY id');
  return rows;
}

// ---------- Кэш прав в Redis ----------

// Пустой набор – нет в кэше (у пользователя с ролью всегда есть хотя бы одно право)
async function getCachedPermissions(userId) {
  return redis.smembers(`perms:${userId}`);
}

async function cachePermissions(userId, permissions, ttlSec) {
  if (!permissions.length) return;
  const key = `perms:${userId}`;
  await redis.multi().del(key).sadd(key, ...permissions).expire(key, ttlSec).exec();
}

// Сбросить кэш после смены ролей или прав
async function dropCachedPermissions(userId) {
  await redis.del(`perms:${userId}`);
}

// Сбросить кэш прав всех пользователей – после изменения прав роли.
// SCAN не добавляет keyPrefix сам, а DEL добавляет – поэтому префикс у найденных ключей убираем
async function dropAllCachedPermissions() {
  const prefix = redis.options.keyPrefix || '';
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}perms:*`, 'COUNT', 500);
    if (keys.length) await redis.del(...keys.map((k) => k.slice(prefix.length)));
    cursor = next;
  } while (cursor !== '0');
}

module.exports = {
  dropAllCachedPermissions,
  findUserPermissions,
  findRolesWithPermissions,
  findAllPermissions,
  getCachedPermissions,
  cachePermissions,
  dropCachedPermissions,
};
