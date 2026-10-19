// Расписание психолога: окна пачкой, пересечения, закрыть / открыть / удалить, закрыть день.
const { request, app, registerClient, registerPsychologist, verifiedPsychologist, openSlots, minskDay } = require('../helpers');

let psy;
beforeAll(async () => {
  psy = await verifiedPsychologist();
});

describe('новые окна', () => {
  test('пачкой: по Минскому времени, свободные, видны клиентам', async () => {
    const day = minskDay(4);
    const res = await psy.agent.post('/api/schedule/slots')
      .send({ slots: [{ date: day, time: '09:00' }, { date: day, time: '10:00' }, { date: day, time: '18:30' }] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: 3, skipped: [] });

    const own = (await psy.agent.get('/api/schedule/slots').query({ from: day, to: day })).body.slots;
    expect(own.map((s) => [s.time, s.status])).toEqual([['09:00', 'free'], ['10:00', 'free'], ['18:30', 'free']]);
    expect(Date.parse(own[0].endsAt) - Date.parse(own[0].startsAt)).toBe(50 * 60000);   // сессия – 50 минут

    const pub = (await request(app).get(`/api/psychologists/${psy.id}/slots`).query({ from: day, to: day })).body.slots;
    expect(pub.map((s) => s.time)).toEqual(['09:00', '10:00', '18:30']);
  });

  test('пересечение со своим окном и прошедшее время пропускаются – и названы', async () => {
    const day = minskDay(5);
    await openSlots(psy, [{ date: day, time: '12:00' }]);
    const res = await psy.agent.post('/api/schedule/slots').send({ slots: [
      { date: day, time: '12:30' },          // пересекается с 12:00–12:50
      { date: day, time: '13:00' },          // впритык – можно
      { date: minskDay(-1), time: '10:00' }, // вчера
    ] });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toEqual([
      { date: day, time: '12:30', reason: 'overlap' },
      { date: minskDay(-1), time: '10:00', reason: 'past' },
    ]);
  });

  test('окна разных психологов друг другу не мешают', async () => {
    const other = await verifiedPsychologist();
    const day = minskDay(4);
    const res = await other.agent.post('/api/schedule/slots').send({ slots: [{ date: day, time: '09:00' }] });
    expect(res.body.created).toBe(1);
  });

  test('неверные данные – 422', async () => {
    const bad = async (body) => (await psy.agent.post('/api/schedule/slots').send(body));
    expect((await bad({ slots: [] })).status).toBe(422);
    expect((await bad({ slots: [{ date: '20.10.2026', time: '9:00' }] })).body.error.fields).toHaveProperty('slots');
    expect((await bad({ slots: [{ date: minskDay(6), time: '10:00' }], durationMin: 300 })).body.error.fields).toHaveProperty('durationMin');
    const many = Array.from({ length: 301 }, (_, i) => ({ date: minskDay(7), time: `${String(i % 24).padStart(2, '0')}:00` }));
    expect((await bad({ slots: many })).status).toBe(422);
  });

  test('без анкеты психолога окна не открыть – 409 NO_PROFILE', async () => {
    const { agent } = await registerPsychologist();
    await agent.delete('/api/profile');
    const res = await agent.post('/api/schedule/slots').send({ slots: [{ date: minskDay(3), time: '10:00' }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_PROFILE');
  });
});

describe('своё расписание за период', () => {
  test('по умолчанию – неделя с сегодняшнего дня', async () => {
    const res = await psy.agent.get('/api/schedule/slots');
    expect(res.body.from).toBe(minskDay(0));
    expect(res.body.to).toBe(minskDay(6));
    expect(res.body.timezone).toBe('Europe/Minsk');
  });

  test('конец раньше начала и период длиннее двух месяцев – 422', async () => {
    expect((await psy.agent.get('/api/schedule/slots').query({ from: minskDay(5), to: minskDay(1) })).status).toBe(422);
    expect((await psy.agent.get('/api/schedule/slots').query({ from: minskDay(0), to: minskDay(70) })).status).toBe(422);
  });
});

describe('закрыть, открыть, удалить', () => {
  test('закрытое окно клиенты не видят, открытое – снова видят', async () => {
    const day = minskDay(8);
    const [slot] = await openSlots(psy, [{ date: day, time: '11:00' }]);
    const visible = async () => (await request(app).get(`/api/psychologists/${psy.id}/slots`).query({ from: day, to: day })).body.slots.length;

    expect((await psy.agent.patch(`/api/schedule/slots/${slot.id}`).send({ status: 'blocked' })).body).toEqual({ id: slot.id, status: 'blocked' });
    expect(await visible()).toBe(0);
    await psy.agent.patch(`/api/schedule/slots/${slot.id}`).send({ status: 'free' });
    expect(await visible()).toBe(1);
    expect((await psy.agent.patch(`/api/schedule/slots/${slot.id}`).send({ status: 'booked' })).status).toBe(422);
  });

  test('удалить можно свободное окно, чужое – 404', async () => {
    const [slot] = await openSlots(psy, [{ date: minskDay(8), time: '15:00' }]);
    const other = await verifiedPsychologist();
    expect((await other.agent.delete(`/api/schedule/slots/${slot.id}`)).status).toBe(404);
    expect((await psy.agent.delete(`/api/schedule/slots/${slot.id}`)).status).toBe(204);
    expect((await psy.agent.delete(`/api/schedule/slots/${slot.id}`)).status).toBe(404);
  });

  test('окно с записью клиента не закрыть и не удалить – 409 SLOT_BOOKED', async () => {
    const [slot] = await openSlots(psy, [{ date: minskDay(9), time: '10:00' }]);
    const { agent: client } = await registerClient();
    expect((await client.post('/api/appointments').send({ slotId: slot.id })).status).toBe(201);
    expect((await psy.agent.patch(`/api/schedule/slots/${slot.id}`).send({ status: 'blocked' })).body.error.code).toBe('SLOT_BOOKED');
    expect((await psy.agent.delete(`/api/schedule/slots/${slot.id}`)).body.error.code).toBe('SLOT_BOOKED');
  });

  test('закрыть день: закрываются только свободные, запись клиента остаётся', async () => {
    const day = minskDay(10);
    const [booked] = await openSlots(psy, [{ date: day, time: '09:00' }, { date: day, time: '11:00' }, { date: day, time: '14:00' }]);
    const { agent: client } = await registerClient();
    await client.post('/api/appointments').send({ slotId: booked.id });

    const res = await psy.agent.post('/api/schedule/block-day').send({ date: day });
    expect(res.body).toEqual({ date: day, blocked: 2 });
    const own = (await psy.agent.get('/api/schedule/slots').query({ from: day, to: day })).body.slots;
    expect(own.map((s) => s.status)).toEqual(['booked', 'blocked', 'blocked']);
    expect(own[0].appointment.client.name).toBe('Тест');
  });
});
