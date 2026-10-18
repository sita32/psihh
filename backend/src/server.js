// Точка входа: HTTP-сервер для REST и Socket.IO, корректная остановка по сигналу Docker.
const http = require('node:http');
const app = require('./app');
const config = require('./config');
const { pool } = require('./db/postgres');
const redis = require('./db/redis');
const { attachSocket } = require('./socket');

const server = http.createServer(app);
const socket = attachSocket(server);

server.listen(config.port, () => {
  console.log(`«Рядом» API: порт ${config.port}, режим ${config.env}`);
});

// docker compose stop присылает SIGTERM: закрываем сокеты, дожидаемся запросов и закрываем соединения с БД
async function shutdown(signal) {
  console.log(`${signal}: остановка сервера`);
  await socket.close(); // заодно закрывает HTTP-сервер
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
