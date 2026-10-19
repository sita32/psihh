// Правила базы данных (schema.sql) напрямую, без сервера: даже ошибка в коде не даст нарушить их.
// Каждый тест – в транзакции, которая откатывается: тестовая база не меняется.
const { pool } = require('../../src/db/postgres');
const { verifiedPsychologist, registerClient, openSlots, minskDay } = require('../helpers');

let psy;
let client;
let service;
beforeAll(async () => {
  psy = await verifiedPsychologist();
  client = await registerClient();
  ({ rows: [service] } = await pool.query('SELECT id, price FROM psychologist_services WHERE psychologist_id = $1', [psy.id]));
});

/** Выполнить в транзакции с откатом; set – параметры для триггеров (кто и почему) */
async function inRollback(fn, { userId, reason } = {}) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    if (userId) await db.query("SELECT set_config('app.user_id', $1, true), set_config('app.reason', $2, true)", [String(userId), reason || '']);
    return await fn(db);
  } finally {
    await db.query('ROLLBACK');
    db.release();
  }
}
const book = (db, slotId) => db.query(
  `INSERT INTO appointments (client_id, psychologist_id, slot_id, service_id, price_at_booking)
   VALUES ($1, $2, $3, $4, $5) RETURNING id`,
  [client.user.id, psy.id, slotId, service.id, service.price],
);
// Ошибка PostgreSQL: 23514 – check_violation, 23505 – unique, 23P01 – exclusion
const sqlError = (promise) => promise.then(() => null, (err) => err.code);

describe('триггеры записей', () => {
  test('запись переводит окно в «занято», на занятое окно – check_violation', async () => {
    const [slot] = await openSlots(psy, [{ date: minskDay(12), time: '10:00' }]);
    await inRollback(async (db) => {
      await book(db, slot.id);
      const { rows: [s] } = await db.query('SELECT status FROM schedule_slots WHERE id = $1', [slot.id]);
      expect(s.status).toBe('booked');
      expect(await sqlError(book(db, slot.id))).toBe('23514');
    });
  });

  test('на прошедшее время записаться нельзя', async () => {
    const [slot] = await openSlots(psy, [{ date: minskDay(12), time: '11:00' }]);
    await inRollback(async (db) => {
      await db.query("UPDATE schedule_slots SET starts_at = now() - interval '1 day', ends_at = now() - interval '1 day' + interval '50 minutes' WHERE id = $1", [slot.id]);
      expect(await sqlError(book(db, slot.id))).toBe('23514');
    });
  });

  test('отмена без причины – check_violation (история требует причину)', async () => {
    const [slot] = await openSlots(psy, [{ date: minskDay(12), time: '12:00' }]);
    await inRollback(async (db) => {
      const { rows: [a] } = await book(db, slot.id);
      expect(await sqlError(db.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [a.id]))).toBe('23514');
    });
  });

  test('отмена с причиной: окно свободно, в истории – кто и почему', async () => {
    const [slot] = await openSlots(psy, [{ date: minskDay(12), time: '13:00' }]);
    await inRollback(async (db) => {
      const { rows: [a] } = await book(db, slot.id);
      await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [a.id]);
      const { rows: [s] } = await db.query('SELECT status FROM schedule_slots WHERE id = $1', [slot.id]);
      expect(s.status).toBe('free');
      const { rows: history } = await db.query(
        'SELECT old_status, new_status, changed_by, reason FROM appointment_status_history WHERE appointment_id = $1 ORDER BY id', [a.id],
      );
      expect(history).toEqual([
        { old_status: null, new_status: 'scheduled', changed_by: client.user.id, reason: null },
        { old_status: 'scheduled', new_status: 'cancelled', changed_by: client.user.id, reason: 'Заболела' },
      ]);
    }, { userId: client.user.id, reason: 'Заболела' });
  });

  test('отметить встречу до её начала нельзя; из «состоялась» статус не меняется', async () => {
    const [slot] = await openSlots(psy, [{ date: minskDay(12), time: '14:00' }]);
    await inRollback(async (db) => {
      const { rows: [a] } = await book(db, slot.id);
      expect(await sqlError(db.query("UPDATE appointments SET status = 'completed' WHERE id = $1", [a.id]))).toBe('23514');
    });
    await inRollback(async (db) => {
      const { rows: [a] } = await book(db, slot.id);
      await db.query("UPDATE schedule_slots SET starts_at = now() - interval '2 hours', ends_at = now() - interval '70 minutes' WHERE id = $1", [slot.id]);
      await db.query("UPDATE appointments SET status = 'completed' WHERE id = $1", [a.id]);
      expect(await sqlError(db.query("UPDATE appointments SET status = 'scheduled' WHERE id = $1", [a.id]))).toBe('23514');
    }, { userId: psy.id });
  });
});

describe('ограничения расписания и записей', () => {
  test('окна одного психолога не пересекаются – exclusion constraint', async () => {
    await inRollback(async (db) => {
      const ins = (start) => db.query(
        "INSERT INTO schedule_slots (psychologist_id, starts_at, ends_at) VALUES ($1, $2::timestamptz, $2::timestamptz + interval '50 minutes')",
        [psy.id, start],
      );
      await ins('2030-01-10T10:00:00Z');
      expect(await sqlError(ins('2030-01-10T10:30:00Z'))).toBe('23P01');
    });
  });

  test('окно и услуга должны принадлежать тому же психологу (составной внешний ключ)', async () => {
    const other = await verifiedPsychologist();
    const [foreign] = await openSlots(other, [{ date: minskDay(12), time: '15:00' }]);
    await inRollback(async (db) => {
      expect(await sqlError(book(db, foreign.id))).toBe('23503');   // foreign_key_violation
    });
  });

  test('цена записи – больше нуля (CHECK)', async () => {
    const [slot] = await openSlots(psy, [{ date: minskDay(12), time: '16:00' }]);
    await inRollback(async (db) => {
      expect(await sqlError(db.query(
        'INSERT INTO appointments (client_id, psychologist_id, slot_id, service_id, price_at_booking) VALUES ($1, $2, $3, $4, 0)',
        [client.user.id, psy.id, slot.id, service.id],
      ))).toBe('23514');
    });
  });
});
