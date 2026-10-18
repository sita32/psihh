// Пул соединений с PostgreSQL. Запросы к БД делают только репозитории.
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  ...config.postgres,
  connectionTimeoutMillis: 3000, // не ждать вечно, если БД недоступна
  idleTimeoutMillis: 30000,
});

// Ошибка простаивающего соединения (например, перезапуск БД) не должна ронять сервер
pool.on('error', (err) => {
  console.error('[postgres] ошибка соединения в пуле:', err.message);
});

// Транзакция: fn получает соединение и передаёт его в репозитории.
// Ошибка внутри fn – откат всех изменений.
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, transaction };
