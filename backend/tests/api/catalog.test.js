// Каталог психологов, страница психолога, свободные окна, отзывы и справочники (доступны без входа).
const { request, app, loginAs, minsk, minskDay, DEMO } = require('../helpers');

const get = (url, query) => request(app).get(url).query(query || {});
const codes = (list) => list.map((x) => x.code);

describe('GET /api/references', () => {
  test('справочники: 7 методов, 10 тем, 3 формата – коды и названия', async () => {
    const res = await get('/api/references');
    expect(res.status).toBe(200);
    expect(res.body.methods).toHaveLength(7);
    expect(res.body.topics).toHaveLength(10);
    expect(codes(res.body.formats)).toEqual(['individual', 'couple', 'child']);
    expect(res.body.methods[0]).toEqual(expect.objectContaining({ code: expect.any(String), name: expect.any(String) }));
  });
});

describe('каталог: выдача', () => {
  let all;
  beforeAll(async () => {
    all = (await get('/api/psychologists', { limit: 50 })).body;
  });

  test('только проверенные и опубликованные: 12 психологов из демо-данных', () => {
    expect(all.total).toBe(12);
    expect(all.items).toHaveLength(12);
    // Психологи с заявкой на проверке в каталог не попадают
    expect(all.items.map((p) => p.name)).not.toContain('Юлия Ковалёва');
  });

  test('карточка без личных данных: ни почты, ни телефона', () => {
    const card = all.items[0];
    expect(card).toEqual(expect.objectContaining({
      id: expect.any(Number), name: expect.any(String), experienceYears: expect.any(Number),
      priceFrom: expect.any(Number), methods: expect.any(Array), topics: expect.any(Array), services: expect.any(Array),
    }));
    expect(card).not.toHaveProperty('email');
    expect(card).not.toHaveProperty('phone');
  });

  test('подсказки к фильтрам: методы, форматы и две недели дней', () => {
    expect(all.facets.methods.cbt).toBeGreaterThan(0);
    expect(all.facets.formats.individual).toBe(12);
    expect(Object.keys(all.facets.days)).toHaveLength(14);
    Object.values(all.facets.days).forEach((n) => expect(n).toBeLessThanOrEqual(all.total));
  });

  test('страницы не пересекаются и вместе дают всех', async () => {
    const pages = await Promise.all([1, 2, 3].map((page) => get('/api/psychologists', { limit: 5, page })));
    const ids = pages.flatMap((r) => r.body.items.map((p) => p.id));
    expect(pages[0].body.pages).toBe(3);
    expect(new Set(ids).size).toBe(12);
  });
});

describe('каталог: фильтры', () => {
  test('метод: у каждого найденного есть КПТ, число совпадает с подсказкой', async () => {
    const res = await get('/api/psychologists', { method: 'cbt', limit: 50 });
    expect(res.body.items.length).toBeGreaterThan(0);
    res.body.items.forEach((p) => expect(codes(p.methods)).toContain('cbt'));
    // Подсказка не учитывает выбор в этом же фильтре – и равна числу найденных
    expect(res.body.facets.methods.cbt).toBe(res.body.total);
  });

  test('несколько форматов – нужны все сразу', async () => {
    const res = await get('/api/psychologists', { format: 'couple,child', limit: 50 });
    expect(res.body.total).toBeGreaterThan(0);
    res.body.items.forEach((p) => expect(codes(p.services)).toEqual(expect.arrayContaining(['couple', 'child'])));
  });

  test('тема, пол, опыт и цена вместе', async () => {
    const res = await get('/api/psychologists', { topic: 'anxiety', gender: 'female', expMin: 5, priceMax: 80, limit: 50 });
    expect(res.status).toBe(200);
    res.body.items.forEach((p) => {
      expect(codes(p.topics)).toContain('anxiety');
      expect(p.gender).toBe('female');
      expect(p.experienceYears).toBeGreaterThanOrEqual(5);
      expect(p.priceFrom).toBeLessThanOrEqual(80);
    });
  });

  test('поиск по фамилии', async () => {
    const res = await get('/api/psychologists', { q: 'Волкова' });
    expect(res.body.items.map((p) => p.name)).toEqual(['Марина Волкова']);
  });

  test('«Тревога» находит психологов с темой «Тревожность»', async () => {
    const res = await get('/api/psychologists', { q: 'Тревога', limit: 50 });
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('день: у каждого найденного ближайшее окно – в этот день по Минску', async () => {
    const day = minskDay(2);
    const res = await get('/api/psychologists', { date: day, limit: 50 });
    expect(res.body.total).toBeGreaterThan(0);
    res.body.items.forEach((p) => expect(minsk(p.nextSlot).date).toBe(day));
  });

  test('вечер: ближайшее подходящее окно – после 17:00', async () => {
    const res = await get('/api/psychologists', { part: 'evening', limit: 50 });
    res.body.items.forEach((p) => expect(minsk(p.nextSlot).minutes).toBeGreaterThanOrEqual(17 * 60));
  });

  test('неверные фильтры – 422 со всеми полями', async () => {
    const res = await get('/api/psychologists', { gender: 'x', sort: 'popular', limit: 0, date: '2020-01-01', time: '25:00' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['date', 'gender', 'limit', 'sort', 'time']);
  });
});

describe('каталог: сортировка', () => {
  const sorted = async (sort) => (await get('/api/psychologists', { sort, limit: 50 })).body.items;
  const isMonotonic = (values, dir) => values.every((v, i) => i === 0 || (dir > 0 ? values[i - 1] <= v : values[i - 1] >= v));

  test('дешевле – цена по возрастанию, дороже – по убыванию', async () => {
    expect(isMonotonic((await sorted('cheap')).map((p) => p.priceFrom), 1)).toBe(true);
    expect(isMonotonic((await sorted('expensive')).map((p) => p.priceFrom), -1)).toBe(true);
  });

  test('по опыту и по рейтингу – по убыванию', async () => {
    expect(isMonotonic((await sorted('exp')).map((p) => p.experienceYears), -1)).toBe(true);
    expect(isMonotonic((await sorted('rating')).map((p) => p.rating), -1)).toBe(true);
  });

  test('ближайшее окно – по времени', async () => {
    expect(isMonotonic((await sorted('soon')).map((p) => Date.parse(p.nextSlot)), 1)).toBe(true);
  });
});

describe('страница психолога', () => {
  let marinaId;
  beforeAll(async () => {
    marinaId = (await get('/api/psychologists', { q: 'Волкова' })).body.items[0].id;
  });

  test('анкета, образование и услуги – без почты', async () => {
    const res = await get(`/api/psychologists/${marinaId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: marinaId, name: 'Марина Волкова' });
    expect(res.body.bio).toEqual(expect.any(String));
    expect(res.body.education.length).toBeGreaterThan(0);
    expect(res.body.services[0]).toEqual(expect.objectContaining({ code: 'individual', price: 65 }));
    expect(res.body).not.toHaveProperty('email');
  });

  test('непроверенный, несуществующий и кривой id – 404', async () => {
    const mod = await loginAs(DEMO.moderator);
    const pending = (await mod.get('/api/admin/verification-requests').query({ status: 'pending' })).body.items[0].psychologist.id;
    for (const id of [pending, 999999, 'abc']) {
      expect((await get(`/api/psychologists/${id}`)).status).toBe(404);
    }
  });

  test('свободные окна: только будущие и свободные, по порядку, на две недели', async () => {
    const res = await get(`/api/psychologists/${marinaId}/slots`);
    expect(res.status).toBe(200);
    const times = res.body.slots.map((s) => Date.parse(s.startsAt));
    expect(times.length).toBeGreaterThan(0);
    res.body.slots.forEach((s) => expect(s.status).toBe('free'));
    expect(Math.min(...times)).toBeGreaterThan(Date.now());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(res.body.to).toBe(minskDay(13));
  });

  test('окна: конец периода раньше начала – 422', async () => {
    const res = await get(`/api/psychologists/${marinaId}/slots`, { from: minskDay(5), to: minskDay(1) });
    expect(res.status).toBe(422);
  });

  test('отзывы: только опубликованные, сводка сходится, аноним без имени', async () => {
    const res = await get(`/api/psychologists/${marinaId}/reviews`, { limit: 50 });
    const { summary, items } = res.body;
    expect(items).toHaveLength(summary.count);
    expect(Object.values(summary.distribution).reduce((a, b) => a + b, 0)).toBe(summary.count);
    const avg = items.reduce((sum, r) => sum + r.rating, 0) / items.length;
    expect(summary.rating).toBeCloseTo(avg, 1);
    items.filter((r) => r.anonymous).forEach((r) => expect(r.author).toBe('Аноним'));
    items.forEach((r) => expect(r).not.toHaveProperty('client'));   // кто именно – знает только модератор
  });
});

describe('кэш каталога сбрасывается при изменении анкеты', () => {
  test('скрытая анкета сразу пропадает из каталога и возвращается', async () => {
    const before = (await get('/api/psychologists', { limit: 50 })).body.total;
    const marina = await loginAs(DEMO.psychologist);
    try {
      expect((await marina.patch('/api/profile').send({ isPublished: false })).status).toBe(200);
      const hidden = (await get('/api/psychologists', { limit: 50 })).body;
      expect(hidden.total).toBe(before - 1);
      expect(hidden.items.map((p) => p.name)).not.toContain('Марина Волкова');
    } finally {
      await marina.patch('/api/profile').send({ isPublished: true });
    }
    expect((await get('/api/psychologists', { limit: 50 })).body.total).toBe(before);
  });
});
