// Токены входа: короткий access-токен (JWT) и длинный случайный refresh-токен.
// В Redis хранится только хеш refresh-токена – утечка базы не даёт войти.
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const { jwtSecret, accessTtlSec } = config.auth;

// JWT с id пользователя (sub), ролями и уникальным jti – по нему токен можно отозвать
function signAccessToken(account) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ roles: account.roles }, jwtSecret, {
    algorithm: 'HS256',
    subject: String(account.id),
    jwtid: jti,
    expiresIn: accessTtlSec,
  });
  return { token, jti };
}

// Проверка подписи и срока; null – токен поддельный, кривой или истёк (expired: true)
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    return err instanceof jwt.TokenExpiredError ? { expired: true } : null;
  }
}

function newRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, newRefreshToken, hashToken };
