// Пользователи, их роли, профили и блокировки – SQL к таблицам users, user_roles,
// client_profiles, psychologist_profiles, user_blocks.
// db – пул или соединение транзакции (см. transaction в db/postgres.js).
const { pool } = require('../db/postgres');

// Данные для проверки пароля при входе
async function findCredentialsByEmail(email, db = pool) {
  const { rows } = await db.query(
    'SELECT id, email, password_hash, status FROM users WHERE email = $1',
    [email],
  );
  return rows[0] || null;
}

async function emailExists(email, db = pool) {
  const { rows } = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
  return rows.length > 0;
}

async function getStatus(id, db = pool) {
  const { rows } = await db.query('SELECT status FROM users WHERE id = $1', [id]);
  return rows[0] ? rows[0].status : null;
}

// Пользователь для ответа «кто я»: роли и имя из профиля клиента или психолога
async function findAccountById(id, db = pool) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.status, u.created_at, u.last_login_at,
            array_remove(array_agg(r.code ORDER BY r.id), NULL) AS roles,
            coalesce(cp.first_name, pp.first_name) AS first_name,
            coalesce(cp.last_name, pp.last_name)   AS last_name,
            pp.verification_status
       FROM users u
       LEFT JOIN user_roles ur            ON ur.user_id = u.id
       LEFT JOIN roles r                  ON r.id = ur.role_id
       LEFT JOIN client_profiles cp       ON cp.user_id = u.id
       LEFT JOIN psychologist_profiles pp ON pp.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, cp.user_id, pp.user_id`,
    [id],
  );
  return rows[0] || null;
}

async function create({ email, passwordHash }, db = pool) {
  const { rows } = await db.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
    [email, passwordHash],
  );
  return rows[0].id;
}

async function addRole(userId, roleCode, grantedBy = null, db = pool) {
  await db.query(
    `INSERT INTO user_roles (user_id, role_id, granted_by)
     SELECT $1, id, $3 FROM roles WHERE code = $2`,
    [userId, roleCode, grantedBy],
  );
}

async function createClientProfile(userId, { firstName }, db = pool) {
  await db.query('INSERT INTO client_profiles (user_id, first_name) VALUES ($1, $2)', [userId, firstName]);
}

async function createPsychologistProfile(userId, { firstName, lastName, gender, practiceSince }, db = pool) {
  await db.query(
    `INSERT INTO psychologist_profiles (user_id, first_name, last_name, gender, practice_since)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, firstName, lastName, gender, practiceSince],
  );
}

async function touchLastLogin(id, db = pool) {
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
}

// Действующая блокировка (последняя не снятая)
async function findActiveBlock(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, reason, blocked_at, blocked_until
       FROM user_blocks
      WHERE user_id = $1 AND unblocked_at IS NULL
      ORDER BY blocked_at DESC
      LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

// Снять блокировку; статус users.status вернёт триггер trg_user_blocks_sync
async function liftBlock(blockId, unblockedBy = null, db = pool) {
  await db.query(
    'UPDATE user_blocks SET unblocked_at = now(), unblocked_by = $2 WHERE id = $1',
    [blockId, unblockedBy],
  );
}

module.exports = {
  findCredentialsByEmail,
  emailExists,
  getStatus,
  findAccountById,
  create,
  addRole,
  createClientProfile,
  createPsychologistProfile,
  touchLastLogin,
  findActiveBlock,
  liftBlock,
};
