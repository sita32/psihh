// Временные данные чата в Redis (database/redis.md):
//   online:users – Sorted Set, score = время последней активности (мс) – только те, кто подключён;
//   online:last_seen – Hash { userId: мс } – когда пользователь закрыл последнюю вкладку;
//   chat:typing:{conversationId}:{userId} – «печатает…», несколько секунд;
//   chat:unread:{userId} – Hash { conversationId: число непрочитанных } (источник истины – messages.read_at).
const redis = require('../db/redis');

const ONLINE_KEY = 'online:users';

async function touch(userId, at = Date.now()) {
  await redis.zadd(ONLINE_KEY, at, String(userId));
}

// Закрыта последняя вкладка: из «в сети» – во «время выхода»
async function goOffline(userId, at = Date.now()) {
  await redis.multi().zrem(ONLINE_KEY, String(userId)).hset('online:last_seen', String(userId), at).exec();
}

// { userId: { activeAt, leftAt } } – время последней активности (если подключён) и выхода
async function lastSeen(userIds) {
  if (!userIds.length) return {};
  const ids = userIds.map(String);
  const [[, active], [, left]] = await redis.multi().zmscore(ONLINE_KEY, ...ids).hmget('online:last_seen', ...ids).exec();
  const num = (x) => (x === null ? null : Number(x));
  return Object.fromEntries(userIds.map((id, i) => [id, { activeAt: num(active[i]), leftAt: num(left[i]) }]));
}

// true – ключ только что поставлен (сообщать собеседнику), false – уже сообщали недавно
async function setTyping(conversationId, userId, ttlSec) {
  return (await redis.set(`chat:typing:${conversationId}:${userId}`, '1', 'EX', ttlSec, 'NX')) === 'OK';
}

async function clearTyping(conversationId, userId) {
  await redis.del(`chat:typing:${conversationId}:${userId}`);
}

// ---------- Счётчики непрочитанных ----------

async function getUnread(userId) {
  const key = `chat:unread:${userId}`;
  const [[, exists], [, hash]] = await redis.multi().exists(key).hgetall(key).exec();
  return exists ? hash : null; // null – счётчиков нет (Redis очищен), их нужно собрать из БД
}

async function setUnread(userId, counts) {
  const key = `chat:unread:${userId}`;
  // Служебное поле _ – чтобы ключ существовал и при нуле непрочитанных
  await redis.multi().del(key).hset(key, { _: '0', ...counts }).exec();
}

async function incrementUnread(userId, conversationId) {
  const key = `chat:unread:${userId}`;
  if (await redis.exists(key)) await redis.hincrby(key, String(conversationId), 1);
}

async function clearUnread(userId, conversationId) {
  await redis.hdel(`chat:unread:${userId}`, String(conversationId));
}

module.exports = { touch, goOffline, lastSeen, setTyping, clearTyping, getUnread, setUnread, incrementUnread, clearUnread };
