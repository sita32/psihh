// Общие помощники тестов: «браузер» с cookie, вход демо-аккаунтами, новые пользователи.
const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../src/app');

// Демо-аккаунты из database/demo.sql, пароль у всех – demo1234
const DEMO_PASSWORD = 'demo1234';
const DEMO = {
  client: 'anna@mail.com',
  psychologist: 'marina@ryadom.by',
  moderator: 'moderator@ryadom.by',
  blocked: 'dk_1990@yandex.by',
};

let ipCounter = 0;
/** Уникальный адрес «клиента»: ограничения попыток считаются по IP, у каждого теста – свой */
const nextIp = () => {
  ipCounter += 1;
  return `10.${process.pid % 250}.${Math.floor(ipCounter / 250)}.${ipCounter % 250 + 1}`;
};

/** Отдельный «браузер»: хранит cookie между запросами, ходит со своего IP (сервер за nginx) */
function browser(ip = nextIp()) {
  return request.agent(app).set('X-Forwarded-For', ip);
}

/** Уникальная почта для нового пользователя */
const uniqueEmail = (prefix = 'user') => `${prefix}-${crypto.randomUUID().slice(0, 8)}@test.ryadom.by`;

/** Вошедший браузер; бросает ошибку, если вход не удался */
async function loginAs(email, password = DEMO_PASSWORD) {
  const agent = browser();
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Вход ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Новый клиент: { agent, user, email, password, tokens: { access, refresh } } */
async function registerClient(overrides = {}) {
  const agent = browser();
  const body = { name: 'Тест', email: uniqueEmail('client'), password: 'password123', ...overrides };
  const res = await agent.post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`Регистрация: ${res.status} ${JSON.stringify(res.body)}`);
  const tokens = { access: cookieFrom(res, 'ryadom_access').value, refresh: cookieFrom(res, 'ryadom_refresh').value };
  return { agent, user: res.body.user, email: body.email, password: body.password, tokens };
}

/** Новый психолог (анкета-черновик): то же, что registerClient */
async function registerPsychologist(overrides = {}) {
  return registerClient({
    role: 'psychologist', lastName: 'Тестов', gender: 'female', practiceSince: '2018-09-01', ...overrides,
  });
}

/** Значение cookie из ответа (Set-Cookie): { value, attrs } */
function cookieFrom(res, name) {
  const line = (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`));
  if (!line) return null;
  const [pair, ...attrs] = line.split(';').map((s) => s.trim());
  return { value: decodeURIComponent(pair.slice(name.length + 1)), attrs: attrs.map((a) => a.toLowerCase()) };
}

module.exports = { app, request, DEMO, DEMO_PASSWORD, browser, nextIp, uniqueEmail, loginAs, registerClient, registerPsychologist, cookieFrom };
