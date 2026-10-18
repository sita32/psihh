// Репозиторий состояния хранилищ: только запросы к PostgreSQL и Redis, без логики.
const { pool } = require('../db/postgres');
const redis = require('../db/redis');

// Проверка соединения с PostgreSQL
async function pingPostgres() {
  await pool.query('SELECT 1');
}

// Количество таблиц приложения (схема public)
async function countTables() {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS count
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  return rows[0].count;
}

// Проверка соединения с Redis: ответ PONG
async function pingRedis() {
  return redis.ping();
}

module.exports = { pingPostgres, countTables, pingRedis };
