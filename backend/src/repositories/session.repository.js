// Сессии входа и отозванные токены в Redis (database/redis.md):
//   session:{refreshTokenHash} – Hash сессии, user:{userId}:sessions – все сессии пользователя,
//   jwt:denylist:{jti} – access-токены, отозванные до истечения срока.
const redis = require('../db/redis');

async function create(tokenHash, { userId, jti, remember, userAgent, ip }, ttlSec) {
  const key = `session:${tokenHash}`;
  const userKey = `user:${userId}:sessions`;
  await redis
    .multi()
    .hset(key, {
      userId: String(userId),
      jti,
      remember: remember ? '1' : '0',
      userAgent: userAgent || '',
      ip: ip || '',
      createdAt: new Date().toISOString(),
    })
    .expire(key, ttlSec)
    .sadd(userKey, tokenHash)
    .expire(userKey, ttlSec, 'GT') // набор живёт столько же, сколько самая долгая сессия
    .expire(userKey, ttlSec, 'NX')
    .exec();
}

async function find(tokenHash) {
  const session = await redis.hgetall(`session:${tokenHash}`);
  if (!session.userId) return null;
  return { ...session, userId: Number(session.userId), remember: session.remember === '1' };
}

async function remove(tokenHash, userId) {
  await redis.multi().del(`session:${tokenHash}`).srem(`user:${userId}:sessions`, tokenHash).exec();
}

// Удалить все сессии пользователя (блокировка аккаунта); возвращает jti их access-токенов
async function removeAllForUser(userId) {
  const userKey = `user:${userId}:sessions`;
  const hashes = await redis.smembers(userKey);
  if (!hashes.length) return [];
  const tx = redis.multi();
  hashes.forEach((h) => tx.hget(`session:${h}`, 'jti'));
  tx.del(...hashes.map((h) => `session:${h}`), userKey);
  const results = await tx.exec();
  return results.slice(0, hashes.length).map(([, jti]) => jti).filter(Boolean);
}

async function denyToken(jti, ttlSec) {
  if (ttlSec > 0) await redis.set(`jwt:denylist:${jti}`, '1', 'EX', ttlSec);
}

async function isTokenDenied(jti) {
  return (await redis.exists(`jwt:denylist:${jti}`)) === 1;
}

module.exports = { create, find, remove, removeAllForUser, denyToken, isTokenDenied };
