// Документы об образовании (documents) и заявки на подтверждение статуса (verification_requests).
// Заявка меняет статус анкеты психолога триггером apply_verification_request.
const { pool } = require('../db/postgres');

const DOC_COLUMNS = `id, psychologist_id, doc_type, institution, specialty, issued_year, file_key, original_name,
                     mime_type, size_bytes, status, review_comment, reviewed_at, uploaded_at`;

async function create(d, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO documents (psychologist_id, doc_type, institution, specialty, issued_year, file_key, original_name, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${DOC_COLUMNS}`,
    [d.psychologistId, d.type, d.institution, d.specialty, d.year, d.fileKey, d.originalName, d.mimeType, d.size],
  );
  return rows[0];
}

async function findById(id, db = pool) {
  const { rows } = await db.query(`SELECT ${DOC_COLUMNS} FROM documents WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function listByPsychologist(psychologistId, db = pool) {
  const { rows } = await db.query(
    `SELECT ${DOC_COLUMNS} FROM documents WHERE psychologist_id = $1 ORDER BY uploaded_at`,
    [psychologistId],
  );
  return rows;
}

async function remove(id, db = pool) {
  await db.query('DELETE FROM documents WHERE id = $1', [id]);
}

// Решение по заявке переносится на документы, которые ещё ждали проверки
async function decidePending(psychologistId, status, comment, moderatorId, db = pool) {
  await db.query(
    `UPDATE documents SET status = $2, review_comment = $3, reviewed_by = $4, reviewed_at = now()
      WHERE psychologist_id = $1 AND status = 'pending'`,
    [psychologistId, status, comment, moderatorId],
  );
}

// ---------- Заявки ----------

async function createRequest(psychologistId, db = pool) {
  const { rows } = await db.query(
    'INSERT INTO verification_requests (psychologist_id) VALUES ($1) RETURNING id',
    [psychologistId],
  );
  return rows[0].id;
}

async function listRequestsOf(psychologistId, db = pool) {
  const { rows } = await db.query(
    `SELECT id, status, submitted_at, reviewed_at, comment
       FROM verification_requests WHERE psychologist_id = $1 ORDER BY submitted_at DESC`,
    [psychologistId],
  );
  return rows;
}

async function findRequest(id, db = pool) {
  const { rows } = await db.query('SELECT * FROM verification_requests WHERE id = $1', [id]);
  return rows[0] || null;
}

// Заявки для модератора: анкета психолога и его документы
async function listRequests(status, db = pool) {
  const { rows } = await db.query(
    `SELECT vr.id, vr.status, vr.submitted_at, vr.reviewed_at, vr.comment, vr.reviewed_by,
            split_part(m.email::text, '@', 1) AS reviewed_by_login,
            u.id AS user_id, u.email,
            p.first_name, p.last_name, p.middle_name, p.gender, p.headline, p.bio, p.approach, p.avatar_key,
            EXTRACT(YEAR FROM age(CURRENT_DATE, p.practice_since))::int AS experience_years,
            (SELECT min(s.price) FROM psychologist_services s WHERE s.psychologist_id = p.user_id AND s.is_active) AS price_from,
            ARRAY(SELECT m2.name FROM psychologist_methods pm JOIN methods m2 ON m2.id = pm.method_id
                   WHERE pm.psychologist_id = p.user_id ORDER BY m2.id) AS methods,
            coalesce((SELECT json_agg(json_build_object('id', d.id, 'type', d.doc_type, 'institution', d.institution,
                                                        'specialty', d.specialty, 'year', d.issued_year,
                                                        'fileName', d.original_name, 'mimeType', d.mime_type,
                                                        'size', d.size_bytes, 'status', d.status,
                                                        'comment', d.review_comment) ORDER BY d.uploaded_at)
                        FROM documents d WHERE d.psychologist_id = p.user_id), '[]') AS documents
       FROM verification_requests vr
       JOIN psychologist_profiles p ON p.user_id = vr.psychologist_id
       JOIN users u                 ON u.id = vr.psychologist_id
       LEFT JOIN users m            ON m.id = vr.reviewed_by
      WHERE vr.status = $1
      ORDER BY vr.submitted_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status],
  );
  return rows;
}

async function decideRequest(id, status, comment, moderatorId, db = pool) {
  await db.query(
    `UPDATE verification_requests SET status = $2, comment = $3, reviewed_by = $4, reviewed_at = now()
      WHERE id = $1`,
    [id, status, comment, moderatorId],
  );
}

module.exports = {
  create, findById, listByPsychologist, remove, decidePending,
  createRequest, listRequestsOf, findRequest, listRequests, decideRequest,
};
