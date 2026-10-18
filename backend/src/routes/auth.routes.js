// /api/auth – регистрация, вход, обновление сессии, выход, «кто я».
// Токены передаются в httpOnly-cookie: скрипты страницы их не видят (защита от XSS),
// SameSite=Strict – браузер не отправит их с чужого сайта (защита от CSRF).
const { Router } = require('express');
const config = require('../config');
const authService = require('../services/auth.service');
const userService = require('../services/user.service');
const tokenService = require('../services/token.service');
const { requireAuth, readCookie, ACCESS_COOKIE, REFRESH_COOKIE } = require('../middleware/auth');

const router = Router();

const cookieBase = { httpOnly: true, sameSite: 'strict', secure: config.auth.cookieSecure };
// access-токен нужен и API (/api), и чату (/socket.io) – поэтому на весь сайт
const accessCookie = { ...cookieBase, path: '/' };
const refreshCookie = { ...cookieBase, path: '/api/auth' }; // refresh-токен уходит только на /api/auth
// Раньше access-cookie ставилась на /api – у входивших она осталась, её убираем при входе и выходе
const legacyAccessCookie = { ...cookieBase, path: '/api' };

// Без «Запомнить меня» cookie без срока – удаляются при закрытии браузера.
// Cookie access-токена живёт дольше самого токена: истёкший JWT дойдёт до сервера,
// и тот ответит TOKEN_EXPIRED – интерфейс поймёт, что пора вызвать /refresh.
function setSessionCookies(res, { accessToken, refreshToken, remember }) {
  const maxAge = remember ? { maxAge: config.auth.refreshTtlSec * 1000 } : {};
  res.clearCookie(ACCESS_COOKIE, legacyAccessCookie);
  res.cookie(ACCESS_COOKIE, accessToken, { ...accessCookie, ...maxAge });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookie, ...maxAge });
}

function clearSessionCookies(res) {
  res.clearCookie(ACCESS_COOKIE, legacyAccessCookie);
  res.clearCookie(ACCESS_COOKIE, accessCookie);
  res.clearCookie(REFRESH_COOKIE, refreshCookie);
}

// Откуда пришёл запрос – сохраняется в сессии
function meta(req) {
  return { ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 300) };
}

// POST /api/auth/register  { role, name, email, password, [lastName, gender, practiceSince] }
router.post('/register', async (req, res) => {
  const { account, tokens } = await authService.register(req.body || {}, meta(req));
  setSessionCookies(res, tokens);
  res.status(201).json({ user: account });
});

// POST /api/auth/login  { email, password, remember }
router.post('/login', async (req, res) => {
  const { account, tokens } = await authService.login(req.body || {}, meta(req));
  setSessionCookies(res, tokens);
  res.json({ user: account });
});

// POST /api/auth/refresh – новая пара токенов, когда access-токен истёк (ответ 401 TOKEN_EXPIRED)
router.post('/refresh', async (req, res) => {
  try {
    const { account, tokens } = await authService.refresh(readCookie(req, REFRESH_COOKIE), meta(req));
    setSessionCookies(res, tokens);
    res.json({ user: account });
  } catch (err) {
    clearSessionCookies(res);
    throw err;
  }
});

// POST /api/auth/logout – завершить сессию на этом устройстве
router.post('/logout', async (req, res) => {
  const access = tokenService.verifyAccessToken(readCookie(req, ACCESS_COOKIE) || '');
  await authService.logout(readCookie(req, REFRESH_COOKIE), access && !access.expired ? access : null);
  clearSessionCookies(res);
  res.status(204).end();
});

// GET /api/auth/me – кто вошёл: роли, права, имя
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await userService.getAccount(req.user.id) });
});

module.exports = router;
