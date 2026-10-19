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

/* Дата и время по часовому поясу сайта (Минск) – окна и фильтры считаются в нём */
const minskParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function minsk(iso) {
  const p = Object.fromEntries(minskParts.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
/** Дата через n дней от сегодняшней по Минску: 'ГГГГ-ММ-ДД' */
const minskDay = (n = 0) => minsk(Date.now() + n * 86400000).date;

/* Маленькие файлы для загрузки: картинка 1×1 PNG и «PDF» (сервер проверяет тип по содержимому) */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

/**
 * Психолог, который виден в каталоге: анкета → диплом → заявка → одобрение модератора → публикация.
 * Возвращает то же, что registerClient, и id психолога.
 */
async function verifiedPsychologist({ price = 60, formats = ['individual'] } = {}) {
  const psy = await registerPsychologist();
  const step = async (res, status) => {
    if (res.status !== status) throw new Error(`${res.req.method} ${res.req.path}: ${res.status} ${JSON.stringify(res.body)}`);
    return res;
  };
  await step(await psy.agent.patch('/api/profile').send({
    headline: 'Психолог', bio: 'Работаю с тревогой и стрессом', methods: ['cbt'], topics: ['anxiety'],
    services: formats.map((format) => ({ format, price })),
  }), 200);
  await step(await psy.agent.post('/api/profile/documents').attach('file', PDF, 'diploma.pdf')
    .field('type', 'diploma').field('institution', 'БГУ'), 201);
  const sent = await step(await psy.agent.post('/api/profile/verification'), 201);
  const moderator = await loginAs(DEMO.moderator);
  await step(await moderator.patch(`/api/admin/verification-requests/${sent.body.requests[0].id}`).send({ status: 'approved' }), 200);
  await step(await psy.agent.patch('/api/profile').send({ isPublished: true }), 200);
  return { ...psy, id: psy.user.id };
}

/** Открыть окна психологу и вернуть их (в том же порядке): [{ id, date, time, status }] */
async function openSlots(psy, items) {
  const res = await psy.agent.post('/api/schedule/slots').send({ slots: items });
  if (res.status !== 201 || res.body.created !== items.length) throw new Error(`Окна: ${res.status} ${JSON.stringify(res.body)}`);
  const dates = items.map((x) => x.date).sort();
  const { slots } = (await psy.agent.get('/api/schedule/slots').query({ from: dates[0], to: dates[dates.length - 1] })).body;
  return items.map((x) => slots.find((s) => s.date === x.date && s.time === x.time));
}

/**
 * «Время прошло»: окно записи сдвигается в прошлое прямо в тестовой базе –
 * так проверяются правила, которые зависят от начала встречи (отметки, отмена после начала).
 * Каждое окно – на свой час: окна одного психолога не могут пересекаться (ex_slots_no_overlap).
 */
let pastShift = 0;
async function moveToPast(appointmentId) {
  pastShift += 1;
  const hoursAgo = 1 + pastShift;
  const { pool } = require('../src/db/postgres');
  await pool.query(
    `UPDATE schedule_slots SET starts_at = now() - make_interval(hours => $2), ends_at = now() - make_interval(hours => $2) + interval '50 minutes'
      WHERE id = (SELECT slot_id FROM appointments WHERE id = $1)`,
    [appointmentId, hoursAgo],
  );
}

module.exports = {
  app, request, DEMO, DEMO_PASSWORD, browser, nextIp, uniqueEmail, loginAs, registerClient, registerPsychologist, cookieFrom,
  minsk, minskDay, PNG, PDF, verifiedPsychologist, openSlots, moveToPast,
};
