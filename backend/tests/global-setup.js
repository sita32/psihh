// Перед всеми тестами: чистая тестовая база (schema.sql + seed.sql + demo.sql) и пустой Redis.
// Защита: база должна называться *_test, Redis – не нулевая база, иначе тесты не запустятся,
// чтобы случайно не стереть данные сайта.
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const Redis = require('ioredis');

const SQL_FILES = ['schema.sql', 'seed.sql', 'demo.sql'];

module.exports = async () => {
  const db = process.env.POSTGRES_DB || '';
  const redisDb = Number(process.env.REDIS_DB || 0);
  if (!db.endsWith('_test') || redisDb === 0) {
    throw new Error(`Тесты запускаются только на тестовой базе (*_test) и Redis db ≠ 0, сейчас: ${db}, Redis db ${redisDb}.\n`
      + 'Запуск: docker compose --profile test run --rm tests');
  }

  const conn = {
    host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
  };

  // Пересоздать базу: подключаемся к служебной postgres
  const admin = new Client({ ...conn, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${db}"`);
  await admin.end();

  // Схема, справочники и демо-данные – как при первом старте Docker
  const sqlDir = process.env.SQL_DIR || path.join(__dirname, '..', '..', 'database');
  const client = new Client({ ...conn, database: db });
  await client.connect();
  for (const file of SQL_FILES) {
    await client.query(await fs.readFile(path.join(sqlDir, file), 'utf8'));
  }
  await client.end();

  const redis = new Redis({
    host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD, db: redisDb,
  });
  await redis.flushdb();
  await redis.quit();
};
