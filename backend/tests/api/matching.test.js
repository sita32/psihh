// Анкета подбора (quiz.html): кто подходит полностью, а если таких мало – ближайшие варианты.
const { request, app, minsk } = require('../helpers');

const match = (body) => request(app).post('/api/matching').send(body);
const codes = (list) => list.map((x) => x.code);

describe('POST /api/matching', () => {
  test('формат и тема: не больше трёх, точные совпадения выполняют оба условия', async () => {
    const res = await match({ format: 'individual', topics: ['anxiety'] });
    expect(res.status).toBe(200);
    expect(res.body.exact).toBe(true);
    expect(res.body.results.length).toBeLessThanOrEqual(3);
    expect(res.body.total).toBeGreaterThanOrEqual(res.body.results.length);
    res.body.results.filter((p) => !p.match.misses.length).forEach((p) => {
      expect(codes(p.services)).toContain('individual');
      expect(codes(p.topics)).toContain('anxiety');
      expect(codes(p.match.topics)).toEqual(['anxiety']);   // «почему подходит»
    });
  });

  test('совпавших тем больше – психолог выше', async () => {
    const res = await match({ format: 'individual', topics: ['anxiety', 'burnout', 'self_esteem', 'panic'] });
    const hits = res.body.results.map((p) => p.match.topics.length);
    expect(hits).toEqual([...hits].sort((a, b) => b - a));
  });

  test('никто не подходит полностью – близкие варианты: формат и тема соблюдены, отличия названы', async () => {
    // Мужчина, парная терапия, тема «Панические атаки» – в демо-данных такого нет
    const res = await match({ format: 'couple', topics: ['panic', 'relationships'], gender: 'male', age: 'young', method: 'emdr' });
    expect(res.status).toBe(200);
    expect(res.body.exact).toBe(false);
    expect(res.body.total).toBe(0);
    expect(res.body.results.length).toBeGreaterThan(0);
    res.body.results.forEach((p) => {
      expect(codes(p.services)).toContain('couple');
      expect(p.match.misses.length).toBeGreaterThan(0);
      expect(p.match.misses).not.toContain('format');
      expect(p.match.misses).not.toContain('topics');
    });
  });

  test('«вечером» – ближайшее окно точных совпадений после 17:00 по Минску', async () => {
    const res = await match({ format: 'individual', topics: ['anxiety'], parts: ['evening'] });
    res.body.results.filter((p) => !p.match.misses.length).forEach((p) => {
      expect(minsk(p.nextSlot).minutes).toBeGreaterThanOrEqual(17 * 60);
    });
  });

  test('«нужно скоро» – окно не позже чем через два дня', async () => {
    const res = await match({ format: 'individual', topics: ['stress'], soon: true });
    res.body.results.filter((p) => !p.match.misses.length).forEach((p) => {
      expect(Date.parse(p.nextSlot) - Date.now()).toBeLessThan(3 * 86400000);
    });
  });

  test('неверные пол, возраст и время дня – 422 по полям', async () => {
    const res = await match({ gender: 'other', age: 'child', parts: ['night'] });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['age', 'gender', 'parts']);
  });

  test('анкета без ответов – лучшие по рейтингу, работает и без входа', async () => {
    const res = await match({});
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(3);
  });
});
