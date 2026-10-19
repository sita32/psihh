// Отзывы: клиент пишет после проведённой консультации, модератор публикует, рейтинг считает база;
// психолог отвечает и жалуется, модератор решает по жалобе.
const { request, app, registerClient, verifiedPsychologist, openSlots, minskDay, completedSession, loginAs, DEMO } = require('../helpers');

let psy;
let moderator;
beforeAll(async () => {
  psy = await verifiedPsychologist();
  moderator = await loginAs(DEMO.moderator);
});

const publicReviews = async () => (await request(app).get(`/api/psychologists/${psy.id}/reviews`).query({ limit: 50 })).body;
const rating = async () => (await request(app).get(`/api/psychologists/${psy.id}`)).body;
/** Клиент с проведённой консультацией и его опубликованный отзыв */
async function publishedReview(rate, extra = {}) {
  const client = await registerClient();
  const appointmentId = await completedSession(psy, client);
  const review = (await client.agent.post('/api/reviews').send({ appointmentId, rating: rate, body: 'Спасибо за работу', ...extra })).body;
  await moderator.patch(`/api/admin/reviews/${review.id}`).send({ status: 'approved' });
  return { client, review };
}

describe('клиент пишет отзыв', () => {
  test('до проведённой консультации – 409 NOT_COMPLETED', async () => {
    const client = await registerClient();
    const [slot] = await openSlots(psy, [{ date: minskDay(5), time: '10:00' }]);
    const { id } = (await client.agent.post('/api/appointments').send({ slotId: slot.id })).body;
    const res = await client.agent.post('/api/reviews').send({ appointmentId: id, rating: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_COMPLETED');
  });

  test('после консультации: уходит на проверку, в профиле психолога пока не виден', async () => {
    const client = await registerClient();
    const appointmentId = await completedSession(psy, client);
    const res = await client.agent.post('/api/reviews').send({ appointmentId, rating: 5, body: 'Очень помогло' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'pending', rating: 5, body: 'Очень помогло', psychologist: { id: psy.id } });
    expect((await publicReviews()).items.map((r) => r.id)).not.toContain(res.body.id);
    // Второй отзыв на ту же консультацию – нельзя
    expect((await client.agent.post('/api/reviews').send({ appointmentId, rating: 4 })).body.error.code).toBe('ALREADY_REVIEWED');
  });

  test('чужая консультация – 404, оценка вне 1…5 – 422', async () => {
    const owner = await registerClient();
    const appointmentId = await completedSession(psy, owner);
    const stranger = await registerClient();
    expect((await stranger.agent.post('/api/reviews').send({ appointmentId, rating: 5 })).status).toBe(404);
    expect((await owner.agent.post('/api/reviews').send({ appointmentId, rating: 6 })).status).toBe(422);
  });
});

describe('модерация и рейтинг', () => {
  test('опубликованные отзывы дают рейтинг – его пересчитывает база', async () => {
    await publishedReview(5);
    await publishedReview(4);
    const p = await rating();
    expect(p.reviewsCount).toBe(2);
    expect(p.rating).toBe(4.5);
    expect((await publicReviews()).summary).toMatchObject({ count: 2, rating: 4.5, distribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 } });
  });

  test('отклонить можно только с комментарием – клиент его видит', async () => {
    const client = await registerClient();
    const appointmentId = await completedSession(psy, client);
    const { id } = (await client.agent.post('/api/reviews').send({ appointmentId, rating: 1, body: 'Мой телефон +375291234567' })).body;
    expect((await moderator.patch(`/api/admin/reviews/${id}`).send({ status: 'rejected' })).status).toBe(422);
    await moderator.patch(`/api/admin/reviews/${id}`).send({ status: 'rejected', comment: 'Уберите личные контакты' });
    const mine = (await client.agent.get('/api/reviews')).body.items.find((r) => r.id === id);
    expect(mine).toMatchObject({ status: 'rejected', moderationComment: 'Уберите личные контакты' });
  });

  test('правка опубликованного отзыва – снова на проверку и не в рейтинге; удаление пересчитывает', async () => {
    const before = await rating();
    const { client, review } = await publishedReview(1);
    expect((await rating()).reviewsCount).toBe(before.reviewsCount + 1);

    const edited = await client.agent.patch(`/api/reviews/${review.id}`).send({ rating: 3, body: 'Подумал и смягчил оценку' });
    expect(edited.body.status).toBe('pending');
    expect((await rating()).reviewsCount).toBe(before.reviewsCount);

    await moderator.patch(`/api/admin/reviews/${review.id}`).send({ status: 'approved' });
    expect((await client.agent.delete(`/api/reviews/${review.id}`)).status).toBe(204);
    expect(await rating()).toMatchObject({ reviewsCount: before.reviewsCount, rating: before.rating });
  });

  test('анонимный отзыв: в профиле – «Аноним», психологу – тоже, модератору – настоящее имя', async () => {
    const { review } = await publishedReview(5, { anonymous: true });
    expect((await publicReviews()).items.find((r) => r.id === review.id).author).toBe('Аноним');
    expect((await psy.agent.get('/api/psychologists/me/reviews')).body.items.find((r) => r.id === review.id).author).toBe('Аноним');
    const approved = (await moderator.get('/api/admin/reviews').query({ status: 'approved' })).body.items.find((r) => r.id === review.id);
    expect(approved.client.name).toBe('Тест');
  });
});

describe('ответ и жалоба психолога', () => {
  test('ответ виден в профиле, его можно убрать', async () => {
    const { review } = await publishedReview(5);
    const res = await psy.agent.put(`/api/reviews/${review.id}/reply`).send({ text: 'Спасибо!' });
    expect(res.body.reply).toEqual({ text: 'Спасибо!', at: expect.any(String) });
    expect((await publicReviews()).items.find((r) => r.id === review.id).reply.text).toBe('Спасибо!');
    expect((await psy.agent.delete(`/api/reviews/${review.id}/reply`)).body.reply).toBeNull();
    expect((await psy.agent.put(`/api/reviews/${review.id}/reply`).send({ text: '  ' })).status).toBe(422);
  });

  test('отвечать и жаловаться можно только на отзывы о себе', async () => {
    const { review } = await publishedReview(4);
    const other = await verifiedPsychologist();
    expect((await other.agent.put(`/api/reviews/${review.id}/reply`).send({ text: 'Чужой' })).status).toBe(404);
    expect((await other.agent.post(`/api/reviews/${review.id}/report`).send({ reason: 'Не мой' })).status).toBe(404);
  });

  test('жалоба: одна на рассмотрении; «оставить» – отзыв остаётся, «скрыть» – пропадает и рейтинг пересчитан', async () => {
    const kept = (await publishedReview(2)).review;
    const hidden = (await publishedReview(1)).review;

    const report = await psy.agent.post(`/api/reviews/${kept.id}/report`).send({ reason: 'Клиент не был на сессии' });
    expect(report.status).toBe(201);
    expect(report.body.report).toMatchObject({ status: 'pending', reason: 'Клиент не был на сессии' });
    expect((await psy.agent.post(`/api/reviews/${kept.id}/report`).send({ reason: 'Ещё раз' })).body.error.code).toBe('REPORT_PENDING');

    const queue = (await moderator.get('/api/admin/review-reports')).body.items;
    const keepId = queue.find((r) => r.review.id === kept.id).id;
    expect((await moderator.patch(`/api/admin/review-reports/${keepId}`).send({ decision: 'keep' })).status).toBe(422);  // без комментария
    await moderator.patch(`/api/admin/review-reports/${keepId}`).send({ decision: 'keep', comment: 'Отзыв не нарушает правила' });
    const mine = (await psy.agent.get('/api/psychologists/me/reviews')).body.items.find((r) => r.id === kept.id);
    expect(mine.report).toMatchObject({ status: 'rejected', comment: 'Отзыв не нарушает правила' });

    const before = await rating();
    await psy.agent.post(`/api/reviews/${hidden.id}/report`).send({ reason: 'Оскорбления' });
    const hideId = (await moderator.get('/api/admin/review-reports')).body.items.find((r) => r.review.id === hidden.id).id;
    await moderator.patch(`/api/admin/review-reports/${hideId}`).send({ decision: 'hide', comment: 'Оскорбительные выражения' });
    expect((await publicReviews()).items.map((r) => r.id)).not.toContain(hidden.id);
    expect((await rating()).reviewsCount).toBe(before.reviewsCount - 1);
    // Решение уже принято – повторно нельзя
    expect((await moderator.patch(`/api/admin/review-reports/${hideId}`).send({ decision: 'keep', comment: 'Передумал' })).status).toBe(409);
  });

  test('психолог видит, сколько новых отзывов ещё на проверке', async () => {
    const client = await registerClient();
    const appointmentId = await completedSession(psy, client);
    const before = (await psy.agent.get('/api/psychologists/me/reviews')).body.summary.pending;
    await client.agent.post('/api/reviews').send({ appointmentId, rating: 5 });
    expect((await psy.agent.get('/api/psychologists/me/reviews')).body.summary.pending).toBe(before + 1);
  });
});
