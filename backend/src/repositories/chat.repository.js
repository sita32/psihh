// Чат: диалоги (conversations) и сообщения (messages).
// Что отправитель – участник диалога, проверяет ещё и триггер message_before_insert.
const { pool } = require('../db/postgres');

// Диалоги пользователя с собеседником, последним сообщением, непрочитанными и ближайшей встречей
async function findForUser(userId, timezone, db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.client_id, c.psychologist_id, c.created_at, c.last_message_at,
            cp.first_name AS client_first_name, cp.last_name AS client_last_name, cp.avatar_key AS client_avatar_key,
            pp.first_name AS psy_first_name, pp.last_name AS psy_last_name, pp.avatar_key AS psy_avatar_key,
            pp.headline AS psy_headline,
            lm.id AS last_id, lm.sender_id AS last_sender_id, lm.body AS last_body,
            lm.attachment_key AS last_attachment_key, lm.created_at AS last_created_at,
            (SELECT count(*)::int FROM messages m
              WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_id <> $1 AND m.deleted_at IS NULL) AS unread,
            ns.starts_at AS next_session_at,
            to_char(ns.starts_at AT TIME ZONE $2, 'YYYY-MM-DD') AS next_session_date,
            to_char(ns.starts_at AT TIME ZONE $2, 'HH24:MI')    AS next_session_time,
            (SELECT count(*)::int FROM appointments a
              WHERE a.client_id = c.client_id AND a.psychologist_id = c.psychologist_id
                AND a.status IN ('completed', 'scheduled')) AS sessions_count
       FROM conversations c
       JOIN client_profiles cp       ON cp.user_id = c.client_id
       JOIN psychologist_profiles pp ON pp.user_id = c.psychologist_id
       LEFT JOIN LATERAL (
            SELECT * FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
             ORDER BY m.created_at DESC, m.id DESC LIMIT 1) lm ON true
       LEFT JOIN LATERAL (
            SELECT sl.starts_at FROM appointments a JOIN schedule_slots sl ON sl.id = a.slot_id
             WHERE a.client_id = c.client_id AND a.psychologist_id = c.psychologist_id
               AND a.status = 'scheduled' AND sl.starts_at > now()
             ORDER BY sl.starts_at LIMIT 1) ns ON true
      WHERE $1 IN (c.client_id, c.psychologist_id)
      ORDER BY coalesce(c.last_message_at, c.created_at) DESC`,
    [userId, timezone],
  );
  return rows;
}

async function findById(id, db = pool) {
  const { rows } = await db.query('SELECT id, client_id, psychologist_id FROM conversations WHERE id = $1', [id]);
  return rows[0] || null;
}

// Найти диалог пары или создать новый
async function findOrCreate(clientId, psychologistId, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO conversations (client_id, psychologist_id) VALUES ($1, $2)
     ON CONFLICT (client_id, psychologist_id) DO UPDATE SET client_id = EXCLUDED.client_id
     RETURNING id, client_id, psychologist_id`,
    [clientId, psychologistId],
  );
  return rows[0];
}

// Id всех диалогов пользователя и собеседников – для сокета (комнаты, статус «в сети»)
async function findPartnerIds(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, CASE WHEN client_id = $1 THEN psychologist_id ELSE client_id END AS partner_id
       FROM conversations WHERE $1 IN (client_id, psychologist_id)`,
    [userId],
  );
  return rows;
}

// Сообщения страницами от новых к старым: before – id самого старого уже загруженного
async function findMessages(conversationId, { before, limit }, db = pool) {
  const { rows } = await db.query(
    `SELECT id, conversation_id, sender_id, body, attachment_key, created_at, read_at
       FROM messages
      WHERE conversation_id = $1 AND deleted_at IS NULL AND ($2::bigint IS NULL OR id < $2)
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [conversationId, before || null, limit + 1],
  );
  return { rows: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
}

async function createMessage(conversationId, senderId, body, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)
     RETURNING id, conversation_id, sender_id, body, attachment_key, created_at, read_at`,
    [conversationId, senderId, body],
  );
  return rows[0];
}

// Отметить прочитанными сообщения собеседника; возвращает id отмеченных
async function markRead(conversationId, readerId, db = pool) {
  const { rows } = await db.query(
    `UPDATE messages SET read_at = now()
      WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL
      RETURNING id`,
    [conversationId, readerId],
  );
  return rows.map((r) => r.id);
}

// Непрочитанные по всем диалогам пользователя (для восстановления счётчиков в Redis)
async function countUnread(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT m.conversation_id, count(*)::int AS unread
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE $1 IN (c.client_id, c.psychologist_id) AND m.sender_id <> $1
        AND m.read_at IS NULL AND m.deleted_at IS NULL
      GROUP BY m.conversation_id`,
    [userId],
  );
  return rows;
}

// События записей пары для ленты чата: записались, перенесли, отменили, встреча состоялась
async function findAppointmentEvents(clientId, psychologistId, timezone, db = pool) {
  const { rows } = await db.query(
    `SELECT h.appointment_id, h.old_status, h.new_status, h.reason, h.changed_at, h.changed_by,
            a.rescheduled_from_id,
            to_char(sl.starts_at AT TIME ZONE $3, 'YYYY-MM-DD') AS local_date,
            to_char(sl.starts_at AT TIME ZONE $3, 'HH24:MI')    AS local_time
       FROM appointment_status_history h
       JOIN appointments a    ON a.id = h.appointment_id
       JOIN schedule_slots sl ON sl.id = a.slot_id
      WHERE a.client_id = $1 AND a.psychologist_id = $2
      ORDER BY h.changed_at, (h.old_status IS NULL AND a.rescheduled_from_id IS NOT NULL), h.id`,
    [clientId, psychologistId, timezone],
  );
  return rows;
}

// Есть ли у психолога записи с клиентом (психолог может написать только своему клиенту)
async function haveAppointments(clientId, psychologistId, db = pool) {
  const { rows } = await db.query(
    'SELECT 1 FROM appointments WHERE client_id = $1 AND psychologist_id = $2 LIMIT 1',
    [clientId, psychologistId],
  );
  return rows.length > 0;
}

module.exports = {
  findForUser, findById, findOrCreate, findPartnerIds, findMessages, createMessage, markRead,
  countUnread, findAppointmentEvents, haveAppointments,
};
