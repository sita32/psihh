// Записи на консультации (appointments) и история их статусов (appointment_status_history).
// Проверки «слот свободен», «переход статуса допустим», освобождение слота и запись истории
// выполняют триггеры БД; сюда передаётся только соединение транзакции с app.user_id и app.reason.
const { pool } = require('../db/postgres');

// Окно для записи: свободно ли, в будущем ли, виден ли психолог в каталоге
async function findSlotForBooking(slotId, db = pool) {
  const { rows } = await db.query(
    `SELECT sl.id, sl.psychologist_id, sl.starts_at, sl.ends_at, sl.status,
            sl.starts_at <= now() AS is_past,
            EXISTS (SELECT 1 FROM v_psychologist_catalog c WHERE c.psychologist_id = sl.psychologist_id) AS is_listed
       FROM schedule_slots sl WHERE sl.id = $1`,
    [slotId],
  );
  return rows[0] || null;
}

// Активная услуга психолога нужного формата
async function findService(psychologistId, formatCode, db = pool) {
  const { rows } = await db.query(
    `SELECT s.id, s.price, s.duration_min, f.code AS format_code
       FROM psychologist_services s JOIN session_formats f ON f.id = s.format_id
      WHERE s.psychologist_id = $1 AND f.code = $2 AND s.is_active`,
    [psychologistId, formatCode],
  );
  return rows[0] || null;
}

// Запланированная запись клиента, пересекающаяся по времени (у любого психолога)
async function findClientOverlap(clientId, startsAt, endsAt, exceptAppointmentId = null, db = pool) {
  const { rows } = await db.query(
    `SELECT a.id FROM appointments a JOIN schedule_slots sl ON sl.id = a.slot_id
      WHERE a.client_id = $1 AND a.status = 'scheduled'
        AND tstzrange(sl.starts_at, sl.ends_at) && tstzrange($2, $3)
        AND a.id IS DISTINCT FROM $4
      LIMIT 1`,
    [clientId, startsAt, endsAt, exceptAppointmentId],
  );
  return rows[0] || null;
}

async function create({ clientId, psychologistId, slotId, serviceId, price, note, rescheduledFromId = null }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO appointments (client_id, psychologist_id, slot_id, service_id, price_at_booking, client_note, rescheduled_from_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [clientId, psychologistId, slotId, serviceId, price, note, rescheduledFromId],
  );
  return rows[0].id;
}

async function setStatus(id, status, db = pool) {
  await db.query('UPDATE appointments SET status = $2 WHERE id = $1', [id, status]);
}

// Запись со всем, что нужно для ответа. $2 – часовой пояс
const SELECT_SQL = `
  SELECT a.id, a.status, a.client_id, a.psychologist_id, a.slot_id, a.service_id,
         a.price_at_booking, a.client_note, a.meeting_url, a.rescheduled_from_id, a.created_at,
         sl.starts_at, sl.ends_at, sl.starts_at <= now() AS is_started,
         to_char(sl.starts_at AT TIME ZONE $2, 'YYYY-MM-DD') AS local_date,
         to_char(sl.starts_at AT TIME ZONE $2, 'HH24:MI')    AS local_time,
         f.code AS format_code, f.name AS format_name, s.duration_min,
         cp.first_name AS client_first_name, cp.last_name AS client_last_name, cp.avatar_key AS client_avatar_key,
         pp.first_name AS psy_first_name, pp.last_name AS psy_last_name, pp.avatar_key AS psy_avatar_key,
         pp.headline AS psy_headline,
         EXISTS (SELECT 1 FROM reviews r WHERE r.appointment_id = a.id) AS has_review,
         (SELECT json_build_object('id', r.id, 'status', r.status) FROM reviews r WHERE r.appointment_id = a.id) AS review,
         -- какая это встреча клиента с психологом по счёту (без отменённых и перенесённых)
         (SELECT count(*) FROM appointments a2 JOIN schedule_slots s2 ON s2.id = a2.slot_id
           WHERE a2.client_id = a.client_id AND a2.psychologist_id = a.psychologist_id
             AND a2.status NOT IN ('cancelled', 'rescheduled') AND s2.starts_at <= sl.starts_at)::int AS nth
    FROM appointments a
    JOIN schedule_slots sl         ON sl.id = a.slot_id
    JOIN psychologist_services s   ON s.id = a.service_id
    JOIN session_formats f         ON f.id = s.format_id
    JOIN client_profiles cp        ON cp.user_id = a.client_id
    JOIN psychologist_profiles pp  ON pp.user_id = a.psychologist_id`;

async function findById(id, timezone, db = pool) {
  const { rows } = await db.query(`${SELECT_SQL} WHERE a.id = $1`, [id, timezone]);
  return rows[0] || null;
}

/**
 * Записи участника. as – 'client' | 'psychologist'; scope:
 *   upcoming – запланированные, ещё не начались; past – начались (в том числе не отмеченные);
 *   cancelled – отменённые; all – все, кроме перенесённых (они видны в истории новой записи)
 */
async function list(userId, as, scope, timezone, db = pool) {
  const SCOPES = {
    upcoming: "a.status = 'scheduled' AND sl.starts_at > now()",
    past: "a.status IN ('scheduled', 'completed', 'no_show') AND sl.starts_at <= now()",
    cancelled: "a.status = 'cancelled'",
    all: "a.status <> 'rescheduled'",
  };
  const owner = as === 'client' ? 'a.client_id' : 'a.psychologist_id';
  const order = scope === 'upcoming' ? 'sl.starts_at ASC' : 'sl.starts_at DESC';
  const { rows } = await db.query(
    `${SELECT_SQL} WHERE ${owner} = $1 AND ${SCOPES[scope]} ORDER BY ${order}`,
    [userId, timezone],
  );
  return rows;
}

// История записей вместе с цепочкой переносов (rescheduled_from_id): кто, когда, на что и почему
async function findHistory(appointmentIds, timezone, db = pool) {
  const { rows } = await db.query(
    `WITH RECURSIVE chain AS (
         SELECT id AS root_id, id, rescheduled_from_id FROM appointments WHERE id = ANY ($1)
         UNION ALL
         SELECT c.root_id, a.id, a.rescheduled_from_id
           FROM appointments a JOIN chain c ON a.id = c.rescheduled_from_id)
     SELECT c.root_id, h.appointment_id, h.old_status, h.new_status, h.reason, h.changed_at, h.changed_by,
            coalesce(cp.first_name, pp.first_name) AS changed_by_name,
            CASE WHEN h.changed_by = a.client_id THEN 'client'
                 WHEN h.changed_by = a.psychologist_id THEN 'psychologist'
                 WHEN h.changed_by IS NOT NULL THEN 'moderator' END AS changed_by_role,
            to_char(sl.starts_at AT TIME ZONE $2, 'YYYY-MM-DD') AS local_date,
            to_char(sl.starts_at AT TIME ZONE $2, 'HH24:MI')    AS local_time
       FROM chain c
       JOIN appointment_status_history h ON h.appointment_id = c.id
       JOIN appointments a               ON a.id = c.id
       JOIN schedule_slots sl            ON sl.id = a.slot_id
       LEFT JOIN client_profiles cp       ON cp.user_id = h.changed_by
       LEFT JOIN psychologist_profiles pp ON pp.user_id = h.changed_by
      -- перенос и создание новой записи идут в одной транзакции с одним временем:
      -- создание записи-преемника ставим после события «перенесена»
      ORDER BY c.root_id, h.changed_at, (h.old_status IS NULL AND a.rescheduled_from_id IS NOT NULL), h.id`,
    [appointmentIds, timezone],
  );
  return rows;
}

module.exports = { findSlotForBooking, findService, findClientOverlap, create, setStatus, findById, list, findHistory };
