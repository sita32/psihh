// Состояние сервера и единый формат ошибок API.
const { request, app } = require('../helpers');

describe('GET /api/health', () => {
  test('PostgreSQL и Redis доступны – 200 и число таблиц схемы', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.postgres.status).toBe('ok');
    expect(res.body.services.postgres.tables).toBe(24);   // 24 таблицы в database/schema.sql
    expect(res.body.services.redis.status).toBe('ok');
  });
});

describe('ошибки в формате { error: { code, message } }', () => {
  test('неизвестный адрес внутри /api – 404 JSON', async () => {
    const res = await request(app).get('/api/no-such-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('неверный JSON в теле – 400, без подробностей сервера', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  test('заголовок X-Powered-By не раскрывает Express', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
