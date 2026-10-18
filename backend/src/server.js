// Точка входа: запускает HTTP-сервер и корректно останавливает его по сигналу Docker.
const app = require('./app');
const config = require('./config');
const { pool } = require('./db/postgres');
const redis = require('./db/redis');

const server = app.listen(config.port, () => {
  console.log(`«Рядом» API: порт ${config.port}, режим ${config.env}`);
});

// docker compose stop присылает SIGTERM: дожидаемся текущих запросов и закрываем соединения с БД
async function shutdown(signal) {
  console.log(`${signal}: остановка сервера`);
  server.close();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
