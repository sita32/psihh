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

module.exports = pool;
