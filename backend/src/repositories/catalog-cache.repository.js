// Кэш выдачи каталога в Redis: catalog:filters:{hash} (database/redis.md).
// В ключ входит номер версии каталога: правка анкеты увеличивает версию,
// и старые ответы больше не читаются (они сами удалятся по сроку).
const redis = require('../db/redis');

async function get(hash) {
  const version = (await redis.get('catalog:version')) || '0';
  const json = await redis.get(`catalog:filters:${version}:${hash}`);
  return { version, value: json ? JSON.parse(json) : null };
}

async function set(version, hash, value, ttlSec) {
  await redis.set(`catalog:filters:${version}:${hash}`, JSON.stringify(value), 'EX', ttlSec);
}

// Сбросить кэш после изменения анкеты, услуг или расписания
async function invalidate() {
  await redis.incr('catalog:version');
}

module.exports = { get, set, invalidate };
