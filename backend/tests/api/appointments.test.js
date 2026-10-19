// Записи на консультацию: запись, занятость окна, отмена и перенос с причиной, отметки после встречи, история.
const { request, app, registerClient, verifiedPsychologist, openSlots, moveToPast, loginAs, minskDay, DEMO } = require('../helpers');

let psy;
beforeAll(async () => {
  psy = await verifiedPsychologist({ price: 60, formats: ['individual', 'couple'] });
});

/** Новое свободное окно у психолога: каждый раз своё время, по 12 окон (8:00–19:00) на день */
let n = 0;
async function freeSlot() {
  const date = minskDay(3 + Math.floor(n / 12));
  const time = `${String(8 + (n % 12)).padStart(2, '0')}:00`;
  n += 1;
  const [slot] = await openSlots(psy, [{ date, time }]);
  return slot;
}
/** Свободные окна психолога в день этого окна – как их видит клиент */
const freeIds = async (slot) => (await request(app).get(`/api/psychologists/${psy.id}/slots`)
  .query({ from: slot.date, to: slot.date })).body.slots.map((s) => s.id);

describe('запись клиента', () => {
  test('201: запись запланирована, окно больше не свободно, цена – из прайса', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const res = await agent.post('/api/appointments').send({ slotId: slot.id, note: 'Тревога перед экзаменом' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'scheduled', date: slot.date, time: slot.time, price: 60, note: 'Тревога перед экзаменом', nth: 1,
      format: { code: 'individual', durationMin: 50 }, psychologist: { id: psy.id },
      actions: { cancel: true, reschedule: true, markCompleted: false, review: false },
    });
    expect(res.body.history).toEqual([expect.objectContaining({ type: 'created', by: expect.objectContaining({ role: 'client' }) })]);
    expect(await freeIds(slot)).not.toContain(slot.id);
  });

  test('цена фиксируется при записи и не меняется вместе с прайсом', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const booked = await agent.post('/api/appointments').send({ slotId: slot.id });
    await psy.agent.patch('/api/profile').send({ services: [{ format: 'individual', price: 99 }, { format: 'couple', price: 120 }] });
    try {
      expect((await agent.get(`/api/appointments/${booked.body.id}`)).body.price).toBe(60);
    } finally {
      await psy.agent.patch('/api/profile').send({ services: [{ format: 'individual', price: 60 }, { format: 'couple', price: 90 }] });
    }
  });

  test('занятое окно – 409 SLOT_TAKEN', async () => {
    const slot = await freeSlot();
    await (await registerClient()).agent.post('/api/appointments').send({ slotId: slot.id });
    const res = await (await registerClient()).agent.post('/api/appointments').send({ slotId: slot.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');
  });

  test('два клиента одновременно на одно окно – запишется ровно один', async () => {
    const slot = await freeSlot();
    const clients = await Promise.all([registerClient(), registerClient(), registerClient()]);
    const results = await Promise.all(clients.map((c) => c.agent.post('/api/appointments').send({ slotId: slot.id })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  test('у клиента уже есть консультация в это время (у другого психолога) – 409 CLIENT_BUSY', async () => {
    const other = await verifiedPsychologist();
    const date = minskDay(6);
    const [mine] = await openSlots(psy, [{ date, time: '19:00' }]);
    const [theirs] = await openSlots(other, [{ date, time: '19:30' }]);
    const { agent } = await registerClient();
    expect((await agent.post('/api/appointments').send({ slotId: mine.id })).status).toBe(201);
    const res = await agent.post('/api/appointments').send({ slotId: theirs.id });
    expect(res.body.error.code).toBe('CLIENT_BUSY');
  });

  test('формат, в котором психолог не работает, – 422; несуществующее окно – 404', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    expect((await agent.post('/api/appointments').send({ slotId: slot.id, format: 'child' })).status).toBe(422);
    expect((await agent.post('/api/appointments').send({ slotId: 999999 })).status).toBe(404);
  });

  test('парная консультация – по цене парной', async () => {
    const slot = await freeSlot();
    const res = await (await registerClient()).agent.post('/api/appointments').send({ slotId: slot.id, format: 'couple' });
    expect(res.body).toMatchObject({ format: { code: 'couple' }, price: 90 });
  });

  test('психолог и модератор записаться не могут – 403', async () => {
    const slot = await freeSlot();
    expect((await psy.agent.post('/api/appointments').send({ slotId: slot.id })).status).toBe(403);
    expect((await (await loginAs(DEMO.moderator)).post('/api/appointments').send({ slotId: slot.id })).status).toBe(403);
  });
});

describe('кто видит запись', () => {
  test('клиент и его психолог – да, посторонний – 404', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: slot.id })).body;
    expect((await psy.agent.get(`/api/appointments/${id}`)).status).toBe(200);
    expect((await (await registerClient()).agent.get(`/api/appointments/${id}`)).status).toBe(404);
  });

  test('списки по вкладкам: предстоящие клиента и психолога', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: slot.id })).body;
    const mine = (await agent.get('/api/appointments').query({ scope: 'upcoming' })).body;
    expect(mine).toMatchObject({ as: 'client', scope: 'upcoming' });
    expect(mine.items.map((a) => a.id)).toEqual([id]);
    const theirs = (await psy.agent.get('/api/appointments').query({ as: 'psychologist', scope: 'upcoming' })).body;
    expect(theirs.items.map((a) => a.id)).toContain(id);
    expect((await agent.get('/api/appointments').query({ scope: 'soon' })).status).toBe(422);
  });
});

describe('отмена', () => {
  test('без причины – 422; с причиной – отменена, окно снова свободно, причина в истории', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: slot.id })).body;

    expect((await agent.patch(`/api/appointments/${id}`).send({ status: 'cancelled' })).status).toBe(422);
    const res = await agent.patch(`/api/appointments/${id}`).send({ status: 'cancelled', reason: 'Заболела' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.history.at(-1)).toMatchObject({ type: 'cancelled', reason: 'Заболела', by: { role: 'client' } });
    expect(await freeIds(slot)).toContain(slot.id);
    // Повторно отменить нельзя
    expect((await agent.patch(`/api/appointments/${id}`).send({ status: 'cancelled', reason: 'Ещё раз' })).status).toBe(409);
  });

  test('отменить может и психолог – в истории видно, кто', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: slot.id })).body;
    const res = await psy.agent.patch(`/api/appointments/${id}`).send({ status: 'cancelled', reason: 'Конференция' });
    expect(res.body.history.at(-1).by.role).toBe('psychologist');
    expect((await agent.get('/api/appointments').query({ scope: 'cancelled' })).body.items.map((a) => a.id)).toContain(id);
  });

  test('после начала встречи отменить нельзя – 409', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: slot.id })).body;
    await moveToPast(id);
    const res = await agent.patch(`/api/appointments/${id}`).send({ status: 'cancelled', reason: 'Поздно' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_CANCEL');
  });
});

describe('перенос', () => {
  test('новая запись на другом окне, старая – в истории; цена та же; окна поменялись местами', async () => {
    const [from, to] = [await freeSlot(), await freeSlot()];
    const { agent } = await registerClient();
    const old = (await agent.post('/api/appointments').send({ slotId: from.id })).body;

    const res = await agent.post(`/api/appointments/${old.id}/reschedule`).send({ slotId: to.id, reason: 'Совещание на работе' });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(old.id);
    expect(res.body).toMatchObject({ status: 'scheduled', time: to.time, price: old.price });
    expect(res.body.history.map((h) => h.type)).toEqual(['created', 'rescheduled']);
    expect(res.body.history[1]).toMatchObject({ reason: 'Совещание на работе', from: { time: from.time }, to: { time: to.time } });

    expect(await freeIds(from)).toContain(from.id);
    expect(await freeIds(to)).not.toContain(to.id);
    // Перенесённая запись в списках не дублируется – она часть истории новой
    const all = (await agent.get('/api/appointments').query({ scope: 'all' })).body.items.map((a) => a.id);
    expect(all).toEqual([res.body.id]);
  });

  test('на занятое окно – 409, к другому психологу – 404, без причины – 422', async () => {
    const [from, taken] = [await freeSlot(), await freeSlot()];
    await (await registerClient()).agent.post('/api/appointments').send({ slotId: taken.id });
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: from.id })).body;
    const other = await verifiedPsychologist();
    const [foreign] = await openSlots(other, [{ date: minskDay(3), time: '21:00' }]);

    expect((await agent.post(`/api/appointments/${id}/reschedule`).send({ slotId: taken.id, reason: 'Причина' })).status).toBe(409);
    expect((await agent.post(`/api/appointments/${id}/reschedule`).send({ slotId: foreign.id, reason: 'Причина' })).status).toBe(404);
    expect((await agent.post(`/api/appointments/${id}/reschedule`).send({ slotId: taken.id })).status).toBe(422);
  });
});

describe('отметка после встречи', () => {
  test('до начала – 409; после – психолог отмечает «состоялась», клиент может оставить отзыв', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: slot.id })).body;

    const early = await psy.agent.patch(`/api/appointments/${id}`).send({ status: 'completed' });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('CANNOT_MARK');

    await moveToPast(id);
    const waiting = (await psy.agent.get(`/api/appointments/${id}`)).body;
    expect(waiting).toMatchObject({ needsMark: true, actions: { markCompleted: true, cancel: false } });
    // Отметить может только психолог
    expect((await agent.patch(`/api/appointments/${id}`).send({ status: 'completed' })).status).toBe(403);

    const done = await psy.agent.patch(`/api/appointments/${id}`).send({ status: 'completed' });
    expect(done.body.status).toBe('completed');
    expect((await agent.get(`/api/appointments/${id}`)).body.actions.review).toBe(true);
    // Уже отмечена – менять нельзя
    expect((await psy.agent.patch(`/api/appointments/${id}`).send({ status: 'no_show' })).status).toBe(409);
  });

  test('«клиент не пришёл» – в прошедших, отзыв оставить нельзя', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: slot.id })).body;
    await moveToPast(id);
    await psy.agent.patch(`/api/appointments/${id}`).send({ status: 'no_show' });
    const past = (await agent.get('/api/appointments').query({ scope: 'past' })).body.items;
    expect(past.find((a) => a.id === id)).toMatchObject({ status: 'no_show', actions: { review: false } });
  });

  test('неизвестный статус – 422', async () => {
    const slot = await freeSlot();
    const { agent } = await registerClient();
    const { id } = (await agent.post('/api/appointments').send({ slotId: slot.id })).body;
    expect((await psy.agent.patch(`/api/appointments/${id}`).send({ status: 'done' })).status).toBe(422);
  });
});
