// Свой профиль: клиент – личные данные и аватар, психолог – анкета, фото, документы, заявка на проверку.
const { request, app, loginAs, registerClient, registerPsychologist, DEMO, PNG, PDF } = require('../helpers');

describe('профиль клиента', () => {
  test('GET – свои данные; PATCH меняет только переданные поля', async () => {
    const { agent } = await registerClient({ name: 'Ольга' });
    const res = await agent.patch('/api/profile').send({ about: 'Хочу справиться с тревогой' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'client', profile: { firstName: 'Ольга', about: 'Хочу справиться с тревогой' } });
  });

  test('телефон приводится к виду +375291234567', async () => {
    const { agent } = await registerClient();
    const res = await agent.patch('/api/profile').send({ phone: '+375 (29) 123-45-67' });
    expect(res.body.profile.phone).toBe('+375291234567');
  });

  test('неверные телефон, дата рождения и пустое имя – 422 по полям', async () => {
    const { agent } = await registerClient();
    const res = await agent.patch('/api/profile').send({ firstName: ' ', phone: '12-34', birthDate: '2999-01-01' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['birthDate', 'firstName', 'phone']);
  });

  test('готовый аватар a01…a12 или без фото; чужое значение – 422', async () => {
    const { agent } = await registerClient();
    expect((await agent.patch('/api/profile').send({ avatar: 'a05' })).body.profile.avatarUrl).toBe('/assets/img/avatars/a05.webp');
    expect((await agent.patch('/api/profile').send({ avatar: null })).body.profile.avatarUrl).toBeNull();
    expect((await agent.patch('/api/profile').send({ avatar: '../../etc/passwd' })).status).toBe(422);
  });

  test('удалить аккаунт с предстоящими сессиями нельзя', async () => {
    const anna = await loginAs(DEMO.client);
    const res = await anna.delete('/api/profile');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_UPCOMING_APPOINTMENTS');
  });

  test('удаление аккаунта: сессия завершена, войти больше нельзя', async () => {
    const { agent, email, password } = await registerClient();
    expect((await agent.delete('/api/profile')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', '10.250.0.1').send({ email, password })).status).toBe(401);
  });
});

describe('анкета психолога', () => {
  test('после регистрации – черновик: не проверена и не в каталоге', async () => {
    const { agent } = await registerPsychologist({ name: 'Ирина' });
    const { profile } = (await agent.get('/api/profile')).body;
    expect(profile).toMatchObject({ firstName: 'Ирина', verificationStatus: 'draft', isPublished: false, methods: [], services: [] });
  });

  test('методы, темы и услуги – кодами справочников; в ответе – с названиями', async () => {
    const { agent } = await registerPsychologist();
    const res = await agent.patch('/api/profile').send({
      headline: 'Психолог-консультант', methods: ['cbt', 'act'], topics: ['anxiety'],
      services: [{ format: 'individual', price: 55 }, { format: 'couple', price: 80, durationMin: 80 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.profile.methods).toEqual([{ code: 'cbt', name: 'КПТ' }, { code: 'act', name: 'ACT' }]);
    expect(res.body.profile.services).toEqual([
      { code: 'individual', name: 'Индивидуальная', price: 55, durationMin: 50 },
      { code: 'couple', name: 'Парная', price: 80, durationMin: 80 },
    ]);
  });

  test('неизвестный код, повтор формата, нулевая цена – 422', async () => {
    const { agent } = await registerPsychologist();
    const bad = async (body) => (await agent.patch('/api/profile').send(body)).body.error.fields;
    expect(await bad({ methods: ['astrology'] })).toHaveProperty('methods');
    expect(await bad({ services: [{ format: 'individual', price: 50 }, { format: 'individual', price: 60 }] })).toHaveProperty('services');
    expect(await bad({ services: [{ format: 'individual', price: 0 }] })).toHaveProperty('services');
    expect(await bad({ practiceSince: '2999-01-01' })).toHaveProperty('practiceSince');
  });

  test('опубликовать до проверки документов нельзя – 409 NOT_VERIFIED', async () => {
    const { agent } = await registerPsychologist();
    const res = await agent.patch('/api/profile').send({ isPublished: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_VERIFIED');
  });

  test('фото: картинка сохраняется, текстовый файл с расширением .png – 422', async () => {
    const { agent } = await registerPsychologist();
    const ok = await agent.post('/api/profile/avatar').attach('file', PNG, 'me.png');
    expect(ok.status).toBe(200);
    expect(ok.body.profile.avatarUrl).toMatch(/^\/uploads\/avatars\/.+\.png$/);
    // Тип определяется по содержимому, а не по имени файла
    const fake = await agent.post('/api/profile/avatar').attach('file', Buffer.from('<script>alert(1)</script>'), 'me.png');
    expect(fake.status).toBe(422);
    expect((await agent.delete('/api/profile/avatar')).body.profile.avatarUrl).toBeNull();
  });

  test('удалить анкету без истории – можно, с предстоящими записями – нельзя', async () => {
    const { agent } = await registerPsychologist();
    expect((await agent.delete('/api/profile')).status).toBe(204);
    expect((await agent.get('/api/profile')).body.profile).toBeNull();
    const marina = await loginAs(DEMO.psychologist);
    expect((await marina.delete('/api/profile')).body.error.code).toBe('HAS_UPCOMING_APPOINTMENTS');
  });
});

describe('документы и заявка на проверку', () => {
  test('диплом без «кто выдал» – 422; PDF загружается и виден владельцу', async () => {
    const { agent } = await registerPsychologist();
    const noInst = await agent.post('/api/profile/documents').attach('file', PDF, 'diploma.pdf').field('type', 'diploma');
    expect(noInst.status).toBe(422);
    expect(noInst.body.error.fields).toHaveProperty('institution');

    const doc = await agent.post('/api/profile/documents').attach('file', PDF, 'Диплом.pdf')
      .field('type', 'diploma').field('institution', 'БГУ').field('specialty', 'психология').field('year', '2015');
    expect(doc.status).toBe(201);
    expect(doc.body).toMatchObject({ type: 'diploma', institution: 'БГУ', year: 2015, fileName: 'Диплом.pdf', status: 'pending' });
    const file = await agent.get(`/api/profile/documents/${doc.body.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-security-policy']).toBe('sandbox');   // файл не исполнится на сайте
  });

  test('чужой документ не открыть – 404', async () => {
    const owner = await registerPsychologist();
    const doc = await owner.agent.post('/api/profile/documents').attach('file', PDF, 'd.pdf').field('type', 'certificate');
    const other = await registerPsychologist();
    expect((await other.agent.get(`/api/profile/documents/${doc.body.id}/file`)).status).toBe(404);
    expect((await other.agent.delete(`/api/profile/documents/${doc.body.id}`)).status).toBe(404);
  });

  test('заявка: сначала – чего не хватает, после заполнения – на проверке, повтор – 409', async () => {
    const { agent } = await registerPsychologist();
    const empty = await agent.post('/api/profile/verification');
    expect(empty.status).toBe(422);
    expect(Object.keys(empty.body.error.fields).sort()).toEqual(['bio', 'documents', 'headline', 'methods', 'services', 'topics']);

    await agent.patch('/api/profile').send({
      headline: 'Психолог', bio: 'Работаю с тревогой', methods: ['cbt'], topics: ['anxiety'], services: [{ format: 'individual', price: 50 }],
    });
    await agent.post('/api/profile/documents').attach('file', PDF, 'd.pdf').field('type', 'diploma').field('institution', 'БГУ');
    const sent = await agent.post('/api/profile/verification');
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe('pending');
    expect((await agent.get('/api/profile')).body.profile.verificationStatus).toBe('pending');
    expect((await agent.post('/api/profile/verification')).body.error.code).toBe('REQUEST_PENDING');
  });

  test('документы загружает только психолог', async () => {
    const { agent } = await registerClient();
    expect((await agent.post('/api/profile/documents').attach('file', PDF, 'd.pdf')).status).toBe(403);
  });
});
