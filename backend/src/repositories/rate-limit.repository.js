// Счётчики попыток в Redis: ratelimit:{scope}:{ip|userId} (database/redis.md).
const redis = require('../db/redis');

// Текущее число попыток в окне
async function count(scope, id) {
  return Number(await redis.get(`ratelimit:${scope}:${id}`)) || 0;
}

// +1 попытка; окно отсчитывается от первой попытки
async function hit(scope, id, windowSec) {
  const key = `ratelimit:${scope}:${id}`;
  const [[, n]] = await redis.multi().incr(key).expire(key, windowSec, 'NX').exec();
  return n;
}

async function reset(scope, id) {
  await redis.del(`ratelimit:${scope}:${id}`);
}

module.exports = { count, hit, reset };
