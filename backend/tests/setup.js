// После тестов каждого файла – закрыть соединения с PostgreSQL и Redis, иначе Jest не завершится.
const { pool } = require('../src/db/postgres');
const redis = require('../src/db/redis');

afterAll(async () => {
  await Promise.allSettled([pool.end(), redis.quit()]);
});
