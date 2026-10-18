// Клиент Redis: сессии, кэш и временные данные (database/redis.md).
const Redis = require('ioredis');
const config = require('../config');

const redis = new Redis({
  ...config.redis,
  // Пока соединения нет, команда ждёт одну попытку переподключения и завершается ошибкой,
  // а не висит до бесконечности (при старте сервера она просто дождётся соединения)
  maxRetriesPerRequest: 1,
  // Переподключение с нарастающей паузой, не чаще раза в 2 секунды
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

let lastError = null;
redis.on('error', (err) => {
  // ioredis сообщает об ошибке при каждой попытке – пишем в лог только новую
  if (err.message !== lastError) console.error('[redis]', err.message);
  lastError = err.message;
});
redis.on('ready', () => {
  lastError = null;
});

module.exports = redis;
