/**
 * «Рядом» – демо-слой API: ответы без сервера (tools/dev-server.py или страница открыта файлом).
 * js/api.js обращается сюда сам, когда сервера нет. Ответы – в том же виде, что у сервера,
 * поэтому страницам всё равно, откуда данные. Источник – демо-данные (js/data.js и др.),
 * «вошедший» пользователь хранится в localStorage этого браузера.
 * Новые адреса добавляются через route(метод, шаблон пути, обработчик).
 */
const DEMO_API = (() => {
  const USER_KEY = 'ryadom-demo-user';

  /* Права ролей – как в database/seed.sql */
  const PERMISSIONS = {
    client: ['appointments.book', 'appointments.manage_own', 'catalog.view', 'chat.use', 'profile.edit_own', 'reviews.create'],
    psychologist: ['appointments.manage_own', 'catalog.view', 'chat.use', 'documents.upload', 'profile.edit_own', 'reviews.reply', 'schedule.manage'],
    moderator: ['audit.view', 'catalog.view', 'psychologists.verify', 'reviews.moderate', 'roles.assign', 'users.block', 'users.edit', 'users.view'],
  };

  /* Демо-аккаунты: роль определяется по почте, как раньше на странице входа */
  const ACCOUNTS = {
    'marina@ryadom.by': { id: 10, roles: ['psychologist'], firstName: 'Марина', lastName: 'Волкова',
      avatarUrl: 'assets/img/psychologists/p01.webp', verificationStatus: 'verified' },
    'moderator@ryadom.by': { id: 3, roles: ['moderator'], firstName: null, lastName: null, avatarUrl: null },
  };
  const CLIENT = { id: 4, roles: ['client'], firstName: 'Анна', lastName: 'Петрова', avatarUrl: 'assets/img/avatars/a03.webp' };

  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

  /** Ошибка в том же виде, что у сервера */
  const fail = (status, code, message, fields) => { throw { status, error: { code, message, fields } }; };

  const load = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ } };
  const forget = (key) => { try { localStorage.removeItem(key); } catch { /* приватный режим */ } };

  /** Текущий «вошедший» или 401, как у сервера */
  const me = () => load(USER_KEY) || fail(401, 'UNAUTHORIZED', 'Требуется вход');

  const account = (email, extra = {}) => {
    const base = ACCOUNTS[email] || CLIENT;
    const user = { ...base, ...extra, email, status: 'active' };
    user.permissions = [...new Set(user.roles.flatMap((r) => PERMISSIONS[r]))].sort();
    return user;
  };

  /* ---------- Вход и регистрация ---------- */

  route('POST', /^\/auth\/login$/, (body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const fields = {};
    if (!email) fields.email = 'Укажите почту';
    if (!body.password) fields.password = 'Введите пароль';
    if (Object.keys(fields).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', fields);
    const user = account(email);
    save(USER_KEY, user);
    return { user };
  });

  route('POST', /^\/auth\/register$/, (body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const fields = {};
    if (!String(body.name || '').trim()) fields.name = 'Укажите имя';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Проверьте адрес почты';
    if (String(body.password || '').length < 8) fields.password = 'Пароль должен быть не короче 8 символов';
    if (Object.keys(fields).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', fields);
    if (ACCOUNTS[email]) fail(409, 'EMAIL_TAKEN', 'Эта почта уже зарегистрирована', { email: 'Эта почта уже зарегистрирована – войдите' });
    const psy = body.role === 'psychologist';
    const user = account(email, {
      id: 100, roles: [psy ? 'psychologist' : 'client'], firstName: String(body.name).trim(),
      lastName: psy ? body.lastName : null, avatarUrl: null, verificationStatus: psy ? 'draft' : undefined,
    });
    save(USER_KEY, user);
    return { user };
  });

  route('GET', /^\/auth\/me$/, () => ({ user: me() }));

  route('POST', /^\/auth\/logout$/, () => { forget(USER_KEY); return null; });

  /* ---------- Разбор запроса ---------- */

  async function handle(method, url, body) {
    const [path, search = ''] = url.split('?');
    const query = Object.fromEntries(new URLSearchParams(search));
    const found = routes.find((r) => r.method === method && r.pattern.test(path));
    if (!found) fail(501, 'DEMO_MISSING', 'В демо-режиме без сервера это действие недоступно');
    const params = path.match(found.pattern).slice(1);
    return found.handler(body || {}, { query, params, me });
  }

  return {
    handle,
    route,
    fail,
    me,
    /** Файлы в демо – образцы (их нет на диске сайта, поэтому – картинка-заглушка из assets) */
    fileUrl: () => 'assets/img/quiz/start.webp',
  };
})();
