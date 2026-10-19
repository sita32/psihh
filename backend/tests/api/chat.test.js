// Чат клиента и психолога: диалоги, сообщения, файлы, «прочитано», ограничение частоты –
// и доставка в реальном времени через Socket.IO (сервер поднимается на свободном порту).
const http = require('node:http');
const { io } = require('socket.io-client');
const { app, registerClient, verifiedPsychologist, openSlots, minskDay, loginAs, DEMO, PDF } = require('../helpers');
const { attachSocket } = require('../../src/socket');

let psy;
let client;
let conv;          // диалог клиента с психологом
beforeAll(async () => {
  psy = await verifiedPsychologist();
  client = await registerClient({ name: 'Вера' });
  conv = (await client.agent.post('/api/conversations').send({ psychologistId: psy.id })).body;
});

describe('диалоги', () => {
  test('клиент начинает диалог с психологом из каталога; повтор – тот же диалог', async () => {
    expect(conv).toMatchObject({ partner: { id: psy.id, role: 'psychologist' }, unread: 0, lastMessage: null });
    const again = await client.agent.post('/api/conversations').send({ psychologistId: psy.id });
    expect(again.body.id).toBe(conv.id);
  });

  test('с психологом не из каталога – 404', async () => {
    const res = await client.agent.post('/api/conversations').send({ psychologistId: 999999 });
    expect(res.status).toBe(404);
  });

  test('психолог пишет первым только тому, кто к нему записывался', async () => {
    const stranger = await registerClient();
    expect((await psy.agent.post('/api/conversations').send({ clientId: stranger.user.id })).status).toBe(403);
    const [slot] = await openSlots(psy, [{ date: minskDay(4), time: '10:00' }]);
    await stranger.agent.post('/api/appointments').send({ slotId: slot.id });
    const res = await psy.agent.post('/api/conversations').send({ clientId: stranger.user.id });
    expect(res.status).toBe(201);
    expect(res.body.partner).toMatchObject({ id: stranger.user.id, role: 'client' });
    // В ленте диалога – событие записи
    const { events } = (await psy.agent.get(`/api/conversations/${res.body.id}/messages`)).body;
    expect(events.map((e) => e.type)).toEqual(['booked']);
  });

  test('чужой диалог не открыть – 404; модератору чат недоступен – 403', async () => {
    const other = await registerClient();
    expect((await other.agent.get(`/api/conversations/${conv.id}/messages`)).status).toBe(404);
    expect((await other.agent.post(`/api/conversations/${conv.id}/messages`).send({ body: 'Привет' })).status).toBe(404);
    expect((await (await loginAs(DEMO.moderator)).get('/api/conversations')).status).toBe(403);
  });
});

describe('сообщения', () => {
  test('отправка, непрочитанные у собеседника, «прочитано»', async () => {
    const sent = await client.agent.post(`/api/conversations/${conv.id}/messages`).send({ body: '  Здравствуйте!  ' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ conversationId: conv.id, senderId: client.user.id, body: 'Здравствуйте!', readAt: null });

    expect((await psy.agent.get('/api/conversations/unread')).body).toEqual({ total: 1, byConversation: { [conv.id]: 1 } });
    const list = (await psy.agent.get('/api/conversations')).body.items.find((c) => c.id === conv.id);
    expect(list).toMatchObject({ unread: 1, lastMessage: { body: 'Здравствуйте!' }, partner: { name: 'Вера' } });

    expect((await psy.agent.post(`/api/conversations/${conv.id}/read`)).body).toEqual({ conversationId: conv.id, read: 1 });
    expect((await psy.agent.get('/api/conversations/unread')).body.total).toBe(0);
    const { messages } = (await client.agent.get(`/api/conversations/${conv.id}/messages`)).body;
    expect(messages.at(-1).readAt).not.toBeNull();
  });

  test('пустое и слишком длинное сообщение – 422', async () => {
    expect((await client.agent.post(`/api/conversations/${conv.id}/messages`).send({ body: '   ' })).status).toBe(422);
    expect((await client.agent.post(`/api/conversations/${conv.id}/messages`).send({ body: 'а'.repeat(5001) })).status).toBe(422);
  });

  test('история подгружается страницами вверх (before)', async () => {
    for (let i = 1; i <= 5; i += 1) await psy.agent.post(`/api/conversations/${conv.id}/messages`).send({ body: `Сообщение ${i}` });
    const first = (await client.agent.get(`/api/conversations/${conv.id}/messages`).query({ limit: 3 })).body;
    expect(first.messages.map((m) => m.body)).toEqual(['Сообщение 3', 'Сообщение 4', 'Сообщение 5']);
    expect(first.hasMore).toBe(true);
    const older = (await client.agent.get(`/api/conversations/${conv.id}/messages`).query({ limit: 3, before: first.messages[0].id })).body;
    expect(older.messages.at(-1).body).toBe('Сообщение 2');
    expect(older).not.toHaveProperty('events');
  });

  test('файл: скачать могут только участники; тип – по содержимому', async () => {
    const msg = await client.agent.post(`/api/conversations/${conv.id}/attachments`)
      .attach('file', PDF, 'Дневник мыслей.pdf').field('body', 'Заполнила дневник');
    expect(msg.status).toBe(201);
    expect(msg.body.attachment).toEqual({ name: 'Дневник мыслей.pdf' });
    const url = `/api/conversations/${conv.id}/messages/${msg.body.id}/attachment`;
    expect((await psy.agent.get(url)).status).toBe(200);
    expect((await (await registerClient()).agent.get(url)).status).toBe(404);
    const bad = await client.agent.post(`/api/conversations/${conv.id}/attachments`).attach('file', Buffer.from('#!/bin/sh'), 'run.pdf');
    expect(bad.status).toBe(422);
  });

  test('не больше 30 сообщений в минуту – дальше 429', async () => {
    const spammer = await registerClient();
    const c = (await spammer.agent.post('/api/conversations').send({ psychologistId: psy.id })).body;
    const statuses = [];
    for (let i = 0; i < 31; i += 1) {
      statuses.push((await spammer.agent.post(`/api/conversations/${c.id}/messages`).send({ body: `${i}` })).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe('реальное время (Socket.IO)', () => {
  let server;
  let socketServer;
  let url;
  const sockets = [];

  beforeAll(async () => {
    server = http.createServer(app);
    socketServer = attachSocket(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await socketServer.close();
  });

  /** Подключение с cookie входа, как у страницы чата (только websocket) */
  const connect = (accessToken) => new Promise((resolve, reject) => {
    const s = io(url, {
      transports: ['websocket'], forceNew: true, reconnection: false,
      extraHeaders: accessToken ? { Cookie: `ryadom_access=${accessToken}` } : {},
    });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
  /** Дождаться события (или ошибка через 3 с) */
  const next = (s, event) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`нет события ${event}`)), 3000);
    s.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
  const emit = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));

  test('без входа подключиться нельзя', async () => {
    await expect(connect(null)).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
  });

  test('сообщение по сокету: отправитель получает подтверждение, собеседник – сразу', async () => {
    const [cs, ps] = await Promise.all([connect(client.tokens.access), connect(psy.tokens.access)]);
    const incoming = next(ps, 'message:new');
    const ack = await emit(cs, 'message:send', { conversationId: conv.id, body: 'Можно перенести на вечер?' });
    expect(ack).toMatchObject({ ok: true, message: { body: 'Можно перенести на вечер?', senderId: client.user.id } });
    expect(await incoming).toMatchObject({ id: ack.message.id, conversationId: conv.id });
  });

  test('сообщение, отправленное обычным запросом, тоже приходит по сокету', async () => {
    const ps = await connect(psy.tokens.access);
    const incoming = next(ps, 'message:new');
    await client.agent.post(`/api/conversations/${conv.id}/messages`).send({ body: 'Через REST' });
    expect((await incoming).body).toBe('Через REST');
  });

  test('«печатает…» и «прочитано» доходят до собеседника', async () => {
    const [cs, ps] = await Promise.all([connect(client.tokens.access), connect(psy.tokens.access)]);
    const typing = next(ps, 'typing');
    cs.emit('typing', { conversationId: conv.id });
    expect(await typing).toMatchObject({ conversationId: conv.id, userId: client.user.id });

    await emit(cs, 'message:send', { conversationId: conv.id, body: 'Прочитайте, пожалуйста' });
    const read = next(cs, 'messages:read');
    expect(await emit(ps, 'messages:read', { conversationId: conv.id })).toMatchObject({ ok: true });
    expect(await read).toMatchObject({ conversationId: conv.id, readerId: psy.id });
  });

  test('ошибка в событии – подтверждение с кодом, соединение живо', async () => {
    const cs = await connect(client.tokens.access);
    expect(await emit(cs, 'message:send', { conversationId: conv.id, body: '' })).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(await emit(cs, 'message:send', { conversationId: 999999, body: 'Кому?' })).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(cs.connected).toBe(true);
  });

  test('заблокированного пользователя сервер сразу отключает', async () => {
    const victim = await registerClient();
    const s = await connect(victim.tokens.access);
    const gone = next(s, 'disconnect');
    const mod = await loginAs(DEMO.moderator);
    expect((await mod.post(`/api/admin/users/${victim.user.id}/block`).send({ reason: 'Спам' })).status).toBe(200);
    expect(await gone).toBe('io server disconnect');
    // И подключиться заново с тем же токеном уже нельзя
    await expect(connect(victim.tokens.access)).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
  });
});
