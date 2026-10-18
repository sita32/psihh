// Окна расписания психолога (schedule_slots). Время окна хранится в timestamptz,
// а в ответах дополнительно отдаётся дата и время по часовому поясу сайта.
const { pool } = require('../db/postgres');

// Поля окна для ответа; $tz – номер параметра с часовым поясом
const slotColumns = (tz) => `
  sl.id, sl.starts_at, sl.ends_at, sl.status,
  to_char(sl.starts_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS local_date,
  to_char(sl.starts_at AT TIME ZONE ${tz}, 'HH24:MI')    AS local_time`;

// Свои окна психолога за промежуток дат [from, to] (включительно), с записью клиента, если окно занято
async function findOwnSlots(psychologistId, from, to, timezone, db = pool) {
  const { rows } = await db.query(
    `SELECT ${slotColumns('$4')},
            a.id AS appointment_id, a.status AS appointment_status, a.client_note,
            a.client_id, cp.first_name AS client_first_name, cp.last_name AS client_last_name,
            f.code AS format_code, f.name AS format_name
       FROM schedule_slots sl
       LEFT JOIN LATERAL (
            SELECT * FROM appointments ap
             WHERE ap.slot_id = sl.id AND ap.status IN ('scheduled', 'completed', 'no_show')
             ORDER BY ap.created_at DESC LIMIT 1) a ON true
       LEFT JOIN client_profiles cp       ON cp.user_id = a.client_id
       LEFT JOIN psychologist_services s  ON s.id = a.service_id
       LEFT JOIN session_formats f        ON f.id = s.format_id
      WHERE sl.psychologist_id = $1
        AND sl.starts_at >= ($2::date)::timestamp AT TIME ZONE $4
        AND sl.starts_at <  ($3::date + 1)::timestamp AT TIME ZONE $4
      ORDER BY sl.starts_at`,
    [psychologistId, from, to, timezone],
  );
  return rows;
}

// Свободные будущие окна психолога – для записи клиента
async function findFreeSlots(psychologistId, from, to, timezone, db = pool) {
  const { rows } = await db.query(
    `SELECT ${slotColumns('$4')}
       FROM schedule_slots sl
      WHERE sl.psychologist_id = $1 AND sl.status = 'free' AND sl.starts_at > now()
        AND sl.starts_at >= ($2::date)::timestamp AT TIME ZONE $4
        AND sl.starts_at <  ($3::date + 1)::timestamp AT TIME ZONE $4
      ORDER BY sl.starts_at`,
    [psychologistId, from, to, timezone],
  );
  return rows;
}

// Перевести локальные дату и время в момент времени и отметить прошедшие
async function resolveTimes(items, timezone, db = pool) {
  const { rows } = await db.query(
    `SELECT i.date, i.time,
            (i.date::date + i.time::time) AT TIME ZONE $3 AS starts_at,
            (i.date::date + i.time::time) AT TIME ZONE $3 <= now() AS is_past
       FROM unnest($1::text[], $2::text[]) AS i(date, time)`,
    [items.map((i) => i.date), items.map((i) => i.time), timezone],
  );
  return rows;
}

// Новые окна; пересекающиеся с существующими пропускаются (ограничение ex_slots_no_overlap)
async function createSlots(psychologistId, startsAt, durationMin, db = pool) {
  const created = [];
  // По одному: так пересечения внутри самой пачки тоже отсекаются ограничением
  for (const start of startsAt) {
    const { rows } = await db.query(
      `INSERT INTO schedule_slots (psychologist_id, starts_at, ends_at)
       VALUES ($1, $2, $2::timestamptz + make_interval(mins => $3))
       ON CONFLICT DO NOTHING
       RETURNING id, starts_at`,
      [psychologistId, start, durationMin],
    );
    if (rows[0]) created.push(rows[0]);
  }
  return created;
}

async function findSlot(id, db = pool) {
  const { rows } = await db.query(
    'SELECT id, psychologist_id, starts_at, ends_at, status, starts_at <= now() AS is_past FROM schedule_slots WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

async function setStatus(id, status, db = pool) {
  await db.query('UPDATE schedule_slots SET status = $2 WHERE id = $1', [id, status]);
}

// Есть ли у окна записи (даже отменённые) – такое окно хранится для истории
async function hasAppointments(id, db = pool) {
  const { rows } = await db.query('SELECT 1 FROM appointments WHERE slot_id = $1 LIMIT 1', [id]);
  return rows.length > 0;
}

async function remove(id, db = pool) {
  await db.query('DELETE FROM schedule_slots WHERE id = $1', [id]);
}

// Закрыть все свободные будущие окна дня; возвращает число закрытых
async function blockDay(psychologistId, date, timezone, db = pool) {
  const { rowCount } = await db.query(
    `UPDATE schedule_slots SET status = 'blocked'
      WHERE psychologist_id = $1 AND status = 'free' AND starts_at > now()
        AND starts_at >= ($2::date)::timestamp AT TIME ZONE $3
        AND starts_at <  ($2::date + 1)::timestamp AT TIME ZONE $3`,
    [psychologistId, date, timezone],
  );
  return rowCount;
}

module.exports = {
  findOwnSlots, findFreeSlots, resolveTimes, createSlots, findSlot, setStatus, hasAppointments, remove, blockDay,
};
