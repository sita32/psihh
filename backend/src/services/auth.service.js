// Регистрация, вход, обновление и завершение сессии.
// Сессия = refresh-токен в Redis (30 дней или сутки) + access-токен JWT на 15 минут.
const bcrypt = require('bcrypt');
const config = require('../config');
const { transaction } = require('../db/postgres');
const userRepository = require('../repositories/user.repository');
const sessionRepository = require('../repositories/session.repository');
const rateLimit = require('../repositories/rate-limit.repository');
const tokenService = require('./token.service');
const userService = require('./user.service');
const { HttpError } = require('../errors');

const { bcryptRounds, refreshTtlSec, shortRefreshTtlSec } = config.auth;

// Ограничения попыток: вход – 10 неудачных за 15 минут, регистрация – 10 за час (с одного IP)
const LOGIN_LIMIT = { max: 10, windowSec: 15 * 60 };
const REGISTER_LIMIT = { max: 10, windowSec: 60 * 60 };

const SELF_REGISTER_ROLES = ['client', 'psychologist']; // модератора назначает только модератор
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // та же проверка, что CHECK в users

// ---------- Проверка данных формы ----------

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function checkEmail(email, fields) {
  if (!email) fields.email = 'Укажите почту';
  else if (email.length > 254 || !EMAIL_RE.test(email)) fields.email = 'Проверьте адрес почты';
}

function checkPassword(password, fields) {
  if (typeof password !== 'string' || password.length < 8) {
    fields.password = 'Пароль должен быть не короче 8 символов';
  } else if (Buffer.byteLength(password) > 72) {
    fields.password = 'Пароль слишком длинный'; // bcrypt учитывает только первые 72 байта
  }
}

function checkName(value, field, label, fields) {
  if (!value) fields[field] = `Укажите ${label}`;
  else if (value.length > 64) fields[field] = 'Не длиннее 64 символов';
}

function checkPracticeSince(value, fields) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) {
    fields.practiceSince = 'Укажите дату начала практики (ГГГГ-ММ-ДД)';
  } else if (date > new Date() || value < '1950-01-01') {
    fields.practiceSince = 'Дата начала практики не может быть в будущем';
  }
}

function throwIfInvalid(fields) {
  if (Object.keys(fields).length) throw new HttpError(422, 'Проверьте поля формы', { fields });
}

async function assertNotLimited(scope, ip, limit, message) {
  if ((await rateLimit.count(scope, ip)) >= limit.max) {
    throw new HttpError(429, message, { code: 'TOO_MANY_ATTEMPTS' });
  }
}

// ---------- Сессия ----------

// Новая пара токенов; meta – { ip, userAgent }
async function startSession(account, remember, meta) {
  const access = tokenService.signAccessToken(account);
  const refreshToken = tokenService.newRefreshToken();
  const ttlSec = remember ? refreshTtlSec : shortRefreshTtlSec;
  await sessionRepository.create(
    tokenService.hashToken(refreshToken),
    { userId: account.id, jti: access.jti, remember, ...meta },
    ttlSec,
  );
  return { accessToken: access.token, refreshToken, remember };
}

// Хеш для сравнения, когда пользователя нет: время ответа то же, что при неверном пароле
let dummyHash;
async function getDummyHash() {
  dummyHash ??= await bcrypt.hash('timing-dummy-password', bcryptRounds);
  return dummyHash;
}

// ---------- Регистрация ----------

async function register(body, meta) {
  await assertNotLimited('register', meta.ip, REGISTER_LIMIT, 'Слишком много регистраций с этого адреса. Попробуйте через час');
  await rateLimit.hit('register', meta.ip, REGISTER_LIMIT.windowSec);

  const role = body.role === undefined ? 'client' : body.role;
  const email = text(body.email).toLowerCase();
  const firstName = text(body.name);
  const fields = {};
  if (!SELF_REGISTER_ROLES.includes(role)) fields.role = 'Можно зарегистрироваться как клиент или психолог';
  checkName(firstName, 'name', 'имя', fields);
  checkEmail(email, fields);
  checkPassword(body.password, fields);

  // Для анкеты психолога в БД обязательны фамилия, пол и начало практики
  const psy = { firstName, lastName: text(body.lastName), gender: body.gender, practiceSince: text(body.practiceSince) };
  if (role === 'psychologist') {
    checkName(psy.lastName, 'lastName', 'фамилию', fields);
    if (!['male', 'female'].includes(psy.gender)) fields.gender = 'Укажите пол';
    checkPracticeSince(psy.practiceSince, fields);
  }
  throwIfInvalid(fields);

  const emailTaken = () => new HttpError(409, 'Эта почта уже зарегистрирована', {
    code: 'EMAIL_TAKEN',
    fields: { email: 'Эта почта уже зарегистрирована – войдите' },
  });
  if (await userRepository.emailExists(email)) throw emailTaken();

  const passwordHash = await bcrypt.hash(body.password, bcryptRounds);
  let userId;
  try {
    userId = await transaction(async (db) => {
      const id = await userRepository.create({ email, passwordHash }, db);
      await userRepository.addRole(id, role, null, db);
      if (role === 'client') await userRepository.createClientProfile(id, { firstName }, db);
      else await userRepository.createPsychologistProfile(id, psy, db);
      return id;
    });
  } catch (err) {
    if (err.code === '23505') throw emailTaken(); // та же почта зарегистрирована параллельно
    throw err;
  }

  await userRepository.touchLastLogin(userId);
  const account = await userService.getAccount(userId);
  return { account, tokens: await startSession(account, true, meta) };
}

// ---------- Вход ----------

async function login(body, meta) {
  await assertNotLimited('login', meta.ip, LOGIN_LIMIT, 'Слишком много попыток входа. Попробуйте через 15 минут');

  const email = text(body.email).toLowerCase();
  const fields = {};
  if (!email) fields.email = 'Укажите почту';
  if (typeof body.password !== 'string' || !body.password) fields.password = 'Введите пароль';
  throwIfInvalid(fields);

  const user = await userRepository.findCredentialsByEmail(email);
  const passwordOk = await bcrypt.compare(body.password, user ? user.password_hash : await getDummyHash());
  if (!user || !passwordOk || user.status === 'deleted') {
    await rateLimit.hit('login', meta.ip, LOGIN_LIMIT.windowSec);
    // Не уточняем, что именно неверно, – иначе можно перебором узнать, чья почта зарегистрирована
    throw new HttpError(401, 'Неверная почта или пароль', { code: 'INVALID_CREDENTIALS' });
  }

  if (user.status === 'blocked') {
    const block = await userRepository.findActiveBlock(user.id);
    if (block && block.blocked_until && block.blocked_until <= new Date()) {
      await userRepository.liftBlock(block.id); // срок блокировки истёк – снимаем
    } else {
      const until = block && block.blocked_until
        ? ` до ${block.blocked_until.toLocaleDateString('ru-RU', { timeZone: 'Europe/Minsk' })}`
        : '';
      const reason = block ? `. Причина: ${block.reason}` : '';
      throw new HttpError(403, `Аккаунт заблокирован${until}${reason}`, { code: 'ACCOUNT_BLOCKED' });
    }
  }

  await rateLimit.reset('login', meta.ip);
  await userRepository.touchLastLogin(user.id);
  const account = await userService.getAccount(Number(user.id));
  return { account, tokens: await startSession(account, body.remember !== false, meta) };
}

// ---------- Обновление и выход ----------

// Новая пара токенов по refresh-токену; старый refresh-токен больше не действует
async function refresh(refreshToken, meta) {
  const expired = () => new HttpError(401, 'Сессия истекла, войдите снова', { code: 'SESSION_EXPIRED' });
  if (!refreshToken) throw expired();

  const tokenHash = tokenService.hashToken(refreshToken);
  const session = await sessionRepository.find(tokenHash);
  if (!session) throw expired();
  await sessionRepository.remove(tokenHash, session.userId);

  // Заблокированный или удалённый пользователь сессию не продлевает
  if ((await userRepository.getStatus(session.userId)) !== 'active') throw expired();

  const account = await userService.getAccount(session.userId);
  return { account, tokens: await startSession(account, session.remember, meta) };
}

// accessPayload – данные access-токена, если он ещё действует (его отзываем до конца срока)
async function logout(refreshToken, accessPayload) {
  if (refreshToken) {
    const tokenHash = tokenService.hashToken(refreshToken);
    const session = await sessionRepository.find(tokenHash);
    if (session) await sessionRepository.remove(tokenHash, session.userId);
  }
  if (accessPayload && accessPayload.jti) {
    await sessionRepository.denyToken(accessPayload.jti, accessPayload.exp - Math.floor(Date.now() / 1000));
  }
}

// Завершить все сессии пользователя – при блокировке аккаунта
async function revokeAllSessions(userId) {
  const jtis = await sessionRepository.removeAllForUser(userId);
  await Promise.all(jtis.map((jti) => sessionRepository.denyToken(jti, config.auth.accessTtlSec)));
}

// ---------- Проверка access-токена ----------

// Пользователь по access-токену: { id, roles, jti, exp } или ошибка 401
async function authenticate(accessToken) {
  const payload = accessToken ? tokenService.verifyAccessToken(accessToken) : null;
  if (payload && payload.expired) {
    throw new HttpError(401, 'Срок действия входа истёк', { code: 'TOKEN_EXPIRED' });
  }
  if (!payload || (await sessionRepository.isTokenDenied(payload.jti))) {
    throw new HttpError(401, 'Требуется вход', { code: 'UNAUTHORIZED' });
  }
  return { id: Number(payload.sub), roles: payload.roles, jti: payload.jti, exp: payload.exp };
}

module.exports = { register, login, refresh, logout, revokeAllSessions, authenticate };
