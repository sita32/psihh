// Проверка входа и прав для маршрутов:
//   router.get('/x', requireAuth, handler)                          – только вошедшим
//   router.get('/y', requirePermission('roles.assign'), handler)    – только с правом
const authService = require('../services/auth.service');
const accessService = require('../services/access.service');
const { HttpError } = require('../errors');

const ACCESS_COOKIE = 'ryadom_access';
const REFRESH_COOKIE = 'ryadom_refresh';

// Значение cookie из заголовка запроса (без отдельной библиотеки)
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// req.user = { id, roles, jti, exp }
async function requireAuth(req, res, next) {
  req.user = await authService.authenticate(readCookie(req, ACCESS_COOKIE));
  next();
}

// Вход + хотя бы одно из прав (коды из таблицы permissions)
function requirePermission(...codes) {
  return async (req, res, next) => {
    if (!req.user) req.user = await authService.authenticate(readCookie(req, ACCESS_COOKIE));
    if (!(await accessService.hasAnyPermission(req.user.id, codes))) {
      throw new HttpError(403, 'Недостаточно прав для этого действия');
    }
    next();
  };
}

module.exports = { requireAuth, requirePermission, readCookie, ACCESS_COOKIE, REFRESH_COOKIE };
