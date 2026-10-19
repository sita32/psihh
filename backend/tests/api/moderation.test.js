// Панель модератора: заявки психологов, пользователи, блокировка, роли, права ролей, журнал действий.
const { request, app, browser, registerClient, registerPsychologist, loginAs, DEMO, DEMO_PASSWORD, PDF } = require('../helpers');

let moderator;
let moderatorId;
beforeAll(async () => {
  moderator = await loginAs(DEMO.moderator);
  moderatorId = (await moderator.get('/api/auth/me')).body.user.id;
});

/** Психолог с поданной заявкой: { psy, requestId } */
async function submittedRequest() {
  const psy = await registerPsychologist();
  await psy.agent.patch('/api/profile').send({
    headline: 'Психолог', bio: 'О себе', methods: ['cbt'], topics: ['stress'], services: [{ format: 'individual', price: 40 }],
  });
  const doc = await psy.agent.post('/api/profile/documents').attach('file', PDF, 'Диплом.pdf').field('type', 'diploma').field('institution', 'БГУ');
  const sent = await psy.agent.post('/api/profile/verification');
  return { psy, requestId: sent.body.requests[0].id, documentId: doc.body.id };
}
/** Последние записи журнала */
const audit = async (query = {}) => (await moderator.get('/api/admin/audit').query({ limit: 20, ...query })).body.items;

describe('заявки психологов', () => {
  test('в очереди – анкета и документы; модератор открывает скан', async () => {
    const { psy, requestId, documentId } = await submittedRequest();
    const item = (await moderator.get('/api/admin/verification-requests')).body.items.find((r) => r.id === requestId);
    expect(item.psychologist).toMatchObject({ id: psy.user.id, email: psy.email, headline: 'Психолог', priceFrom: 40, methods: ['КПТ'] });
    expect(item.documents).toEqual([expect.objectContaining({ id: documentId, type: 'diploma', institution: 'БГУ', status: 'pending' })]);
    const file = await moderator.get(`/api/admin/documents/${documentId}/file`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
  });

  test('одобрение: статус «проверен», документы подтверждены, теперь можно в каталог', async () => {
    const { psy, requestId } = await submittedRequest();
    const res = await moderator.patch(`/api/admin/verification-requests/${requestId}`).send({ status: 'approved' });
    expect(res.body).toEqual({ id: requestId, status: 'approved', comment: null });
    const { profile } = (await psy.agent.get('/api/profile')).body;
    expect(profile.verificationStatus).toBe('verified');
    expect(profile.documents.every((d) => d.status === 'approved')).toBe(true);
    expect((await psy.agent.patch('/api/profile').send({ isPublished: true })).status).toBe(200);
    expect((await request(app).get(`/api/psychologists/${psy.user.id}`)).status).toBe(200);
    // Решение уже есть – второй раз нельзя
    expect((await moderator.patch(`/api/admin/verification-requests/${requestId}`).send({ status: 'rejected', comment: 'x' })).body.error.code).toBe('ALREADY_DECIDED');
  });

  test('отказ – только с комментарием; психолог видит его и может отправить заявку снова', async () => {
    const { psy, requestId } = await submittedRequest();
    expect((await moderator.patch(`/api/admin/verification-requests/${requestId}`).send({ status: 'rejected' })).status).toBe(422);
    await moderator.patch(`/api/admin/verification-requests/${requestId}`).send({ status: 'rejected', comment: 'Скан не читается' });
    const v = (await psy.agent.get('/api/profile/verification')).body;
    expect(v).toMatchObject({ status: 'rejected', requests: [{ status: 'rejected', comment: 'Скан не читается' }] });
    expect(v.documents[0]).toMatchObject({ status: 'rejected', comment: 'Скан не читается' });
    // Новый скан – и снова на проверку
    await psy.agent.post('/api/profile/documents').attach('file', PDF, 'Диплом-2.pdf').field('type', 'diploma').field('institution', 'БГУ');
    expect((await psy.agent.post('/api/profile/verification')).status).toBe(201);
  });

  test('проверенный документ психолог удалить не может', async () => {
    const { psy, requestId, documentId } = await submittedRequest();
    await moderator.patch(`/api/admin/verification-requests/${requestId}`).send({ status: 'approved' });
    expect((await psy.agent.delete(`/api/profile/documents/${documentId}`)).body.error.code).toBe('DOCUMENT_APPROVED');
  });
});

describe('пользователи', () => {
  test('поиск по имени и почте, фильтры по роли и статусу, страницы', async () => {
    const { email } = await registerClient({ name: 'Евлампия' });
    const byName = (await moderator.get('/api/admin/users').query({ q: 'Евлампия' })).body;
    expect(byName.items.map((u) => u.email)).toEqual([email]);
    const blocked = (await moderator.get('/api/admin/users').query({ status: 'blocked' })).body.items;
    expect(blocked.every((u) => u.status === 'blocked')).toBe(true);
    expect(blocked.map((u) => u.email)).toContain(DEMO.blocked);
    const psychologists = (await moderator.get('/api/admin/users').query({ role: 'psychologist', limit: 100 })).body.items;
    expect(psychologists.every((u) => u.roles.includes('psychologist'))).toBe(true);
    const page = (await moderator.get('/api/admin/users').query({ limit: 5 })).body;
    expect(page.items).toHaveLength(5);
    expect(page.pages).toBe(Math.ceil(page.total / 5));
    expect((await moderator.get('/api/admin/users').query({ role: 'admin' })).status).toBe(422);
  });

  test('карточка: профиль, число записей, история блокировок', async () => {
    const card = (await moderator.get('/api/admin/users').query({ q: DEMO.blocked })).body.items[0];
    const res = await moderator.get(`/api/admin/users/${card.id}`);
    expect(res.body).toMatchObject({ email: DEMO.blocked, status: 'blocked', appointments: { asClient: expect.any(Number) } });
    expect(res.body.blocks[0]).toMatchObject({ reason: expect.any(String), unblockedAt: null });
  });

  test('правка имени; почту модератор не меняет', async () => {
    const { user, agent } = await registerClient();
    expect((await moderator.patch(`/api/admin/users/${user.id}`).send({ firstName: 'Исправлено' })).status).toBe(200);
    expect((await agent.get('/api/profile')).body.profile.firstName).toBe('Исправлено');
    expect((await moderator.patch(`/api/admin/users/${user.id}`).send({ email: 'new@mail.by' })).status).toBe(422);
  });

  test('блокировка: сразу выходит со всех устройств, не может войти, видит причину; разблокировка возвращает доступ', async () => {
    const { user, agent, email, password } = await registerClient();
    const res = await moderator.post(`/api/admin/users/${user.id}/block`).send({ reason: 'Спам в чате' });
    expect(res.body).toMatchObject({ status: 'blocked', block: { reason: 'Спам в чате' } });
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    const login = await browser().post('/api/auth/login').send({ email, password });
    expect(login.body.error).toMatchObject({ code: 'ACCOUNT_BLOCKED', message: expect.stringContaining('Спам в чате') });
    expect((await moderator.post(`/api/admin/users/${user.id}/block`).send({ reason: 'Ещё раз' })).body.error.code).toBe('ALREADY_BLOCKED');

    await moderator.post(`/api/admin/users/${user.id}/unblock`);
    expect((await browser().post('/api/auth/login').send({ email, password })).status).toBe(200);
    const blocks = (await moderator.get(`/api/admin/users/${user.id}`)).body.blocks;
    expect(blocks[0].unblockedAt).not.toBeNull();
  });

  test('блокировка без причины – 422; себя и других модераторов – 403', async () => {
    const { user } = await registerClient();
    expect((await moderator.post(`/api/admin/users/${user.id}/block`).send({})).status).toBe(422);
    expect((await moderator.post(`/api/admin/users/${moderatorId}/block`).send({ reason: 'Себя' })).status).toBe(403);
  });

  test('роли: клиенту добавили «психолога» – права новые, старые сессии завершены', async () => {
    const { user, agent, email, password } = await registerClient();
    const res = await moderator.put(`/api/admin/users/${user.id}/roles`).send({ roles: ['client', 'psychologist'] });
    expect(res.body.roles.sort()).toEqual(['client', 'psychologist']);
    expect((await agent.get('/api/auth/me')).status).toBe(401);   // роли записаны в токене – нужен новый вход
    const again = await browser().post('/api/auth/login').send({ email, password });
    expect(again.body.user.permissions).toEqual(expect.arrayContaining(['appointments.book', 'schedule.manage']));
  });

  test('назначить модератора или оставить без ролей нельзя – 422', async () => {
    const { user } = await registerClient();
    expect((await moderator.put(`/api/admin/users/${user.id}/roles`).send({ roles: ['moderator'] })).status).toBe(422);
    expect((await moderator.put(`/api/admin/users/${user.id}/roles`).send({ roles: [] })).status).toBe(422);
  });
});

describe('права ролей', () => {
  const clientPermissions = async () => (await moderator.get('/api/admin/roles')).body.roles.find((r) => r.code === 'client').permissions;

  test('снятое у роли право перестаёт действовать сразу – без нового входа', async () => {
    const { agent } = await registerClient();
    const original = await clientPermissions();
    expect((await agent.get('/api/conversations')).status).toBe(200);
    try {
      await moderator.put('/api/admin/roles/client/permissions').send({ permissions: original.filter((p) => p !== 'chat.use') });
      expect((await agent.get('/api/conversations')).status).toBe(403);
    } finally {
      await moderator.put('/api/admin/roles/client/permissions').send({ permissions: original });
    }
    expect((await agent.get('/api/conversations')).status).toBe(200);
  });

  test('у модератора нельзя снять право назначать роли – 409 LOCKOUT; неизвестное право – 422', async () => {
    const res = await moderator.put('/api/admin/roles/moderator/permissions').send({ permissions: ['users.view'] });
    expect(res.body.error.code).toBe('LOCKOUT');
    expect((await moderator.put('/api/admin/roles/client/permissions').send({ permissions: ['fly.away'] })).status).toBe(422);
    expect((await moderator.put('/api/admin/roles/admin/permissions').send({ permissions: [] })).status).toBe(404);
  });
});

describe('журнал действий', () => {
  test('каждое действие модератора записано: кто, что и подробности', async () => {
    const { user } = await registerClient({ name: 'Журнал' });
    await moderator.post(`/api/admin/users/${user.id}/block`).send({ reason: 'Проверка журнала' });
    await moderator.post(`/api/admin/users/${user.id}/unblock`);
    const [unblock, block] = await audit();
    expect(block).toMatchObject({
      action: 'user.block', entityType: 'user', entityId: user.id,
      details: { user: 'Журнал', reason: 'Проверка журнала' }, actor: { id: moderatorId, email: DEMO.moderator },
    });
    expect(unblock.action).toBe('user.unblock');
  });

  test('фильтр по разделу и поиск по подробностям', async () => {
    const users = await audit({ action: 'user.' });
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((e) => e.action.startsWith('user.'))).toBe(true);
    const found = await audit({ q: 'Проверка журнала' });
    expect(found.map((e) => e.action)).toEqual(expect.arrayContaining(['user.block']));
  });

  test('журнал видит только модератор', async () => {
    const anna = await loginAs(DEMO.client, DEMO_PASSWORD);
    expect((await anna.get('/api/admin/audit')).status).toBe(403);
  });
});
