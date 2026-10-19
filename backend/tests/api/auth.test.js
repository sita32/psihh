// Регистрация, вход, сессия (access + refresh в httpOnly-cookie), выход, блокировка, ограничение попыток.
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const { browser, uniqueEmail, loginAs, registerClient, registerPsychologist, cookieFrom, DEMO, DEMO_PASSWORD } = require('../helpers');

describe('регистрация', () => {
  test('клиент: 201, роль client, сессия в httpOnly-cookie', async () => {
    const agent = browser();
    const email = uniqueEmail('anna');
    const res = await agent.post('/api/auth/register').send({ name: 'Анна', email, password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, roles: ['client'], firstName: 'Анна' });
    expect(res.body.user.permissions).toContain('appointments.book');

    const access = cookieFrom(res, 'ryadom_access');
    const refresh = cookieFrom(res, 'ryadom_refresh');
    expect(access.attrs).toEqual(expect.arrayContaining(['httponly', 'path=/', 'samesite=strict']));
    expect(refresh.attrs).toEqual(expect.arrayContaining(['httponly', 'path=/api/auth']));
    // Пароль нигде не возвращается
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  test('почта сохраняется в нижнем регистре, повтор – 409 EMAIL_TAKEN', async () => {
    const email = uniqueEmail('Case').replace('case', 'CaSe');
    const first = await browser().post('/api/auth/register').send({ name: 'А', email, password: 'password123' });
    expect(first.body.user.email).toBe(email.toLowerCase());
    const again = await browser().post('/api/auth/register').send({ name: 'Б', email: email.toLowerCase(), password: 'password123' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EMAIL_TAKEN');
    expect(again.body.error.fields.email).toBeDefined();
  });

  test('ошибки формы – 422 со всеми полями сразу', async () => {
    const res = await browser().post('/api/auth/register').send({ name: '', email: 'не почта', password: '123' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name', 'password']);
  });

  test('психолог обязан указать фамилию, пол и начало практики', async () => {
    const res = await browser().post('/api/auth/register')
      .send({ role: 'psychologist', name: 'Ирина', email: uniqueEmail('psy'), password: 'password123' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['gender', 'lastName', 'practiceSince']);
  });

  test('психолог: анкета-черновик, права расписания и документов', async () => {
    const { user } = await registerPsychologist();
    expect(user.roles).toEqual(['psychologist']);
    expect(user.permissions).toEqual(expect.arrayContaining(['schedule.manage', 'documents.upload']));
  });

  test('зарегистрироваться модератором нельзя', async () => {
    const res = await browser().post('/api/auth/register')
      .send({ role: 'moderator', name: 'Хакер', email: uniqueEmail('mod'), password: 'password123' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.role).toBeDefined();
  });
});

describe('вход и сессия', () => {
  test('демо-клиент входит, /me возвращает его роли и права', async () => {
    const agent = await loginAs(DEMO.client);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: DEMO.client, roles: ['client'] });
  });

  test('неверный пароль и чужая почта – одинаковый ответ 401', async () => {
    const wrong = await browser().post('/api/auth/login').send({ email: DEMO.client, password: 'wrong-password' });
    const unknown = await browser().post('/api/auth/login').send({ email: uniqueEmail('nobody'), password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);   // по ответу не узнать, зарегистрирована ли почта
  });

  test('заблокированный пользователь не входит и видит причину', async () => {
    const res = await browser().post('/api/auth/login').send({ email: DEMO.blocked, password: DEMO_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
    expect(res.body.error.message).toMatch(/Причина/);
  });

  test('без входа /me – 401 UNAUTHORIZED', async () => {
    const res = await browser().get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('поддельный токен не принимается', async () => {
    const fake = jwt.sign({ roles: ['moderator'] }, 'чужой-секрет', { subject: '1', jwtid: 'x', expiresIn: 600 });
    const res = await browser().get('/api/auth/me').set('Cookie', `ryadom_access=${fake}`);
    expect(res.status).toBe(401);
  });

  test('истёкший access-токен – 401 TOKEN_EXPIRED, /refresh выдаёт новую пару', async () => {
    const { user, tokens } = await registerClient();
    const expired = jwt.sign({ roles: user.roles }, config.auth.jwtSecret,
      { subject: String(user.id), jwtid: 'expired-jti', expiresIn: -10 });
    const stale = await browser().get('/api/auth/me').set('Cookie', `ryadom_access=${expired}`);
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('TOKEN_EXPIRED');

    // Так делает js/api.js: один раз /refresh и повтор запроса с новым access-токеном
    const refreshed = await browser().post('/api/auth/refresh').set('Cookie', `ryadom_refresh=${tokens.refresh}`);
    expect(refreshed.status).toBe(200);
    const fresh = cookieFrom(refreshed, 'ryadom_access').value;
    expect((await browser().get('/api/auth/me').set('Cookie', `ryadom_access=${fresh}`)).status).toBe(200);
  });

  test('refresh-токен одноразовый: повтор старого – 401 SESSION_EXPIRED', async () => {
    const { tokens } = await registerClient();
    const first = await browser().post('/api/auth/refresh').set('Cookie', `ryadom_refresh=${tokens.refresh}`);
    expect(first.status).toBe(200);
    const replay = await browser().post('/api/auth/refresh').set('Cookie', `ryadom_refresh=${tokens.refresh}`);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');
  });

  test('выход: cookie стёрты, тот же access-токен больше не действует', async () => {
    const { agent, tokens } = await registerClient();
    const token = tokens.access;

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    // Токен отозван до конца срока – даже если его сохранить
    const reused = await browser().get('/api/auth/me').set('Cookie', `ryadom_access=${token}`);
    expect(reused.status).toBe(401);
  });
});

describe('ограничение попыток входа', () => {
  test('10 неудачных попыток с одного адреса – дальше 429, даже с верным паролем', async () => {
    const agent = browser();
    for (let i = 0; i < 10; i += 1) {
      const res = await agent.post('/api/auth/login').send({ email: DEMO.client, password: `wrong-${i}` });
      expect(res.status).toBe(401);
    }
    const blocked = await agent.post('/api/auth/login').send({ email: DEMO.client, password: DEMO_PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    // С другого адреса вход работает
    expect((await browser().post('/api/auth/login').send({ email: DEMO.client, password: DEMO_PASSWORD })).status).toBe(200);
  });
});
