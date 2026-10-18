// Справочники (методы, темы, форматы) меняются только вместе с seed.sql –
// держим их в памяти процесса 10 минут, чтобы не ходить в БД на каждую страницу.
const referenceRepository = require('../repositories/reference.repository');

const TTL_MS = 10 * 60 * 1000;
let cache = null;
let loadedAt = 0;

async function getAll() {
  if (!cache || Date.now() - loadedAt > TTL_MS) {
    cache = await referenceRepository.findAll();
    loadedAt = Date.now();
  }
  return cache;
}

// Множества кодов – для проверки данных анкеты
async function getCodes() {
  const { methods, topics, formats } = await getAll();
  const codes = (items) => new Set(items.map((i) => i.code));
  return { methods: codes(methods), topics: codes(topics), formats: codes(formats) };
}

module.exports = { getAll, getCodes };
