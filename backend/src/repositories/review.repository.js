// Отзывы (reviews) и жалобы психологов на отзывы (review_reports).
// Проверки «только по своей завершённой консультации», «жалоба – на опубликованный отзыв о себе»
// и пересчёт рейтинга психолога выполняют триггеры БД.
const { pool } = require('../db/postgres');

// Отзыв со всем, что нужно для ответа: имена, дата консультации, сколько встреч было
const SELECT_SQL = `
  SELECT r.id, r.appointment_id, r.client_id, r.psychologist_id, r.rating, r.body, r.is_anonymous, r.status,
         r.moderated_by, r.moderated_at, r.moderation_comment, r.reply, r.replied_at, r.created_at, r.updated_at,
         cp.first_name AS client_first_name, cp.last_name AS client_last_name,
         pp.first_name AS psy_first_name, pp.last_name AS psy_last_name, pp.avatar_key AS psy_avatar_key,
         sl.starts_at AS session_at,
         (SELECT count(*)::int FROM appointments a2
           WHERE a2.client_id = r.client_id AND a2.psychologist_id = r.psychologist_id AND a2.status = 'completed') AS sessions,
         rr.id AS report_id, rr.status AS report_status, rr.reason AS report_reason, rr.created_at AS report_created_at,
         rr.resolution_comment AS report_comment, rr.resolved_at AS report_resolved_at
    FROM reviews r
    JOIN client_profiles cp       ON cp.user_id = r.client_id
    JOIN psychologist_profiles pp ON pp.user_id = r.psychologist_id
    JOIN appointments a           ON a.id = r.appointment_id
    JOIN schedule_slots sl        ON sl.id = a.slot_id
    LEFT JOIN LATERAL (SELECT * FROM review_reports x WHERE x.review_id = r.id
                        ORDER BY x.created_at DESC LIMIT 1) rr ON true`;

async function findById(id, db = pool) {
  const { rows } = await db.query(`${SELECT_SQL} WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

// Запись, по которой можно оставить отзыв, и есть ли отзыв уже
async function findAppointment(appointmentId, db = pool) {
  const { rows } = await db.query(
    `SELECT a.id, a.client_id, a.psychologist_id, a.status,
            EXISTS (SELECT 1 FROM reviews r WHERE r.appointment_id = a.id) AS has_review
       FROM appointments a WHERE a.id = $1`,
    [appointmentId],
  );
  return rows[0] || null;
}

async function create({ appointmentId, clientId, psychologistId, rating, body, anonymous }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO reviews (appointment_id, client_id, psychologist_id, rating, body, is_anonymous)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [appointmentId, clientId, psychologistId, rating, body, anonymous],
  );
  return rows[0].id;
}

// Правка клиентом: отзыв снова уходит на проверку
async function update(id, { rating, body, anonymous }, db = pool) {
  await db.query(
    `UPDATE reviews
        SET rating = $2, body = $3, is_anonymous = $4, status = 'pending',
            moderated_by = NULL, moderated_at = NULL, moderation_comment = NULL
      WHERE id = $1`,
    [id, rating, body, anonymous],
  );
}

async function remove(id, db = pool) {
  await db.query('DELETE FROM reviews WHERE id = $1', [id]);
}

async function listByClient(clientId, db = pool) {
  const { rows } = await db.query(`${SELECT_SQL} WHERE r.client_id = $1 ORDER BY r.created_at DESC`, [clientId]);
  return rows;
}

// Опубликованные отзывы о психологе (страница психолога и его кабинет)
async function listApproved(psychologistId, { limit, offset }, db = pool) {
  const { rows } = await db.query(
    `${SELECT_SQL} WHERE r.psychologist_id = $1 AND r.status = 'approved'
      ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
    [psychologistId, limit, offset],
  );
  return rows;
}

// Сводка по опубликованным: средняя оценка, сколько отзывов, сколько каждой оценки
async function summary(psychologistId, db = pool) {
  const { rows } = await db.query(
    `SELECT round(avg(rating), 2) AS avg, count(*)::int AS count,
            count(*) FILTER (WHERE rating = 5)::int AS r5, count(*) FILTER (WHERE rating = 4)::int AS r4,
            count(*) FILTER (WHERE rating = 3)::int AS r3, count(*) FILTER (WHERE rating = 2)::int AS r2,
            count(*) FILTER (WHERE rating = 1)::int AS r1
       FROM reviews WHERE psychologist_id = $1 AND status = 'approved'`,
    [psychologistId],
  );
  return rows[0];
}

async function setReply(id, text, db = pool) {
  await db.query(
    'UPDATE reviews SET reply = $2, replied_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1',
    [id, text],
  );
}

// ---------- Модерация ----------

async function listForModeration(status, db = pool) {
  const { rows } = await db.query(
    `${SELECT_SQL} WHERE r.status = $1 ORDER BY r.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status],
  );
  return rows;
}

async function moderate(id, status, comment, moderatorId, db = pool) {
  await db.query(
    `UPDATE reviews SET status = $2, moderation_comment = $3, moderated_by = $4, moderated_at = now()
      WHERE id = $1`,
    [id, status, comment, moderatorId],
  );
}

// ---------- Жалобы ----------

async function createReport(reviewId, reporterId, reason, db = pool) {
  const { rows } = await db.query(
    'INSERT INTO review_reports (review_id, reporter_id, reason) VALUES ($1, $2, $3) RETURNING id',
    [reviewId, reporterId, reason],
  );
  return rows[0].id;
}

async function findReport(id, db = pool) {
  const { rows } = await db.query('SELECT * FROM review_reports WHERE id = $1', [id]);
  return rows[0] || null;
}

// Жалобы вместе с отзывом, на который жалуются (псевдоним rep – внутри SELECT_SQL уже есть rr)
async function listReports(status, db = pool) {
  const { rows } = await db.query(
    `SELECT rep.id AS report_row_id, rep.reason AS row_reason, rep.status AS row_status, rep.created_at AS row_created_at,
            rep.resolution_comment AS row_comment, rep.resolved_at AS row_resolved_at, x.*
       FROM review_reports rep
       JOIN LATERAL (${SELECT_SQL} WHERE r.id = rep.review_id) x ON true
      WHERE rep.status = $1
      ORDER BY rep.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status],
  );
  return rows;
}

async function resolveReport(id, status, comment, moderatorId, db = pool) {
  await db.query(
    `UPDATE review_reports SET status = $2, resolution_comment = $3, resolved_by = $4, resolved_at = now()
      WHERE id = $1`,
    [id, status, comment, moderatorId],
  );
}

module.exports = {
  findById, findAppointment, create, update, remove, listByClient, listApproved, summary, setReply,
  listForModeration, moderate, createReport, findReport, listReports, resolveReport,
};
