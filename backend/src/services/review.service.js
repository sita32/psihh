// Отзывы: клиент пишет после проведённой консультации, отзыв публикуется после проверки
// модератором; психолог отвечает на отзывы о себе и может пожаловаться на некорректный.
// Рейтинг психолога по одобренным отзывам пересчитывает триггер БД.
const { transaction } = require('../db/postgres');
const reviewRepository = require('../repositories/review.repository');
const psychologistRepository = require('../repositories/psychologist.repository');
const auditRepository = require('../repositories/audit.repository');
const catalogCache = require('../repositories/catalog-cache.repository');
const realtime = require('../realtime');
const v = require('./validation');
const { HttpError } = require('../errors');

const fullName = (first, last) => [first, last].filter(Boolean).join(' ');

// viewer: 'public' – как в профиле психолога (аноним без имени), 'owner' – автор, 'psychologist', 'moderator'
function reviewView(row, viewer) {
  const author = row.is_anonymous && viewer !== 'moderator' && viewer !== 'owner'
    ? 'Аноним' : fullName(row.client_first_name, viewer === 'public' ? null : row.client_last_name);
  const view = {
    id: row.id,
    appointmentId: row.appointment_id,
    psychologist: { id: row.psychologist_id, name: fullName(row.psy_first_name, row.psy_last_name),
      avatarUrl: row.psy_avatar_key ? `/${row.psy_avatar_key}` : null },
    author,
    anonymous: row.is_anonymous,
    rating: row.rating,
    body: row.body,
    sessions: row.sessions,          // сколько встреч было у клиента с психологом
    sessionAt: row.session_at,
    createdAt: row.created_at,
    reply: row.reply ? { text: row.reply, at: row.replied_at } : null,
  };
  if (viewer !== 'public') {
    Object.assign(view, { status: row.status, moderationComment: row.moderation_comment, moderatedAt: row.moderated_at });
  }
  if (viewer === 'moderator') view.client = { id: row.client_id, name: fullName(row.client_first_name, row.client_last_name) };
  if ((viewer === 'psychologist' || viewer === 'moderator') && row.report_id) {
    view.report = { id: row.report_id, status: row.report_status, reason: row.report_reason,
      createdAt: row.report_created_at, comment: row.report_comment, resolvedAt: row.report_resolved_at };
  }
  return view;
}

function checkReviewBody(body) {
  const fields = {};
  const rating = Number(body && body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = 'Оценка от 1 до 5';
  const text = v.optionalText(body && body.body, 'body', 3000, fields);
  v.throwIfInvalid(fields);
  return { rating, body: text ?? null, anonymous: body.anonymous === true };
}

// ---------- Клиент ----------

async function listMine(user) {
  return { items: (await reviewRepository.listByClient(user.id)).map((r) => reviewView(r, 'owner')) };
}

// POST /api/reviews { appointmentId, rating, body, anonymous }
async function create(user, body) {
  const appointmentId = Number(body && body.appointmentId);
  const data = checkReviewBody(body);
  const a = Number.isSafeInteger(appointmentId) ? await reviewRepository.findAppointment(appointmentId) : null;
  if (!a || a.client_id !== user.id) throw new HttpError(404, 'Консультация не найдена', { fields: { appointmentId: 'Нет такой консультации' } });
  if (a.status !== 'completed') throw new HttpError(409, 'Отзыв можно оставить после проведённой консультации', { code: 'NOT_COMPLETED' });
  if (a.has_review) throw new HttpError(409, 'Отзыв по этой консультации уже есть – его можно изменить', { code: 'ALREADY_REVIEWED' });
  const id = await reviewRepository.create({ appointmentId, clientId: user.id, psychologistId: a.psychologist_id, ...data });
  return reviewView(await reviewRepository.findById(id), 'owner');
}

async function findOwn(user, id) {
  const row = Number.isSafeInteger(id) ? await reviewRepository.findById(id) : null;
  if (!row || row.client_id !== user.id) throw new HttpError(404, 'Отзыв не найден');
  return row;
}

// Правка – отзыв снова уходит на проверку (и до неё не учитывается в рейтинге)
async function update(user, id, body) {
  const row = await findOwn(user, id);
  await reviewRepository.update(row.id, checkReviewBody(body));
  if (row.status === 'approved') await catalogCache.invalidate();
  return reviewView(await reviewRepository.findById(row.id), 'owner');
}

async function remove(user, id) {
  const row = await findOwn(user, id);
  await reviewRepository.remove(row.id);
  if (row.status === 'approved') await catalogCache.invalidate();
}

// ---------- Публично и в кабинете психолога ----------

// viewer 'public' – страница психолога из каталога; 'psychologist' – свой кабинет
async function listForPsychologist(psychologistId, query, viewer) {
  if (viewer === 'public' && (!Number.isSafeInteger(psychologistId) || !(await psychologistRepository.findPublicById(psychologistId)))) {
    throw new HttpError(404, 'Психолог не найден');
  }
  const fields = {};
  const page = v.intParam(query.page, 'page', { min: 1, max: 1000 }, fields) || 1;
  const limit = v.intParam(query.limit, 'limit', { min: 1, max: 50 }, fields) || 10;
  v.throwIfInvalid(fields);
  const [rows, s] = await Promise.all([
    reviewRepository.listApproved(psychologistId, { limit, offset: (page - 1) * limit }),
    reviewRepository.summary(psychologistId),
  ]);
  return {
    summary: { rating: s.avg === null ? null : Number(s.avg), count: s.count,
      distribution: { 5: s.r5, 4: s.r4, 3: s.r3, 2: s.r2, 1: s.r1 } },
    items: rows.map((r) => reviewView(r, viewer)),
    page,
    pages: Math.ceil(s.count / limit),
  };
}

// Отзыв о себе (для ответа и жалобы) – только опубликованный
async function findAboutMe(user, id) {
  const row = Number.isSafeInteger(id) ? await reviewRepository.findById(id) : null;
  if (!row || row.psychologist_id !== user.id || row.status !== 'approved') throw new HttpError(404, 'Отзыв не найден');
  return row;
}

// PUT /api/reviews/:id/reply { text } – ответ психолога (null – убрать)
async function reply(user, id, text) {
  const row = await findAboutMe(user, id);
  let value = null;
  if (text !== null) {
    const fields = {};
    value = v.requiredText(text ?? '', 'text', 2000, fields, 'Напишите ответ');
    v.throwIfInvalid(fields);
  }
  await reviewRepository.setReply(row.id, value);
  return reviewView(await reviewRepository.findById(row.id), 'psychologist');
}

// POST /api/reviews/:id/report { reason } – жалоба модератору
async function report(user, id, body) {
  const row = await findAboutMe(user, id);
  const fields = {};
  const reason = v.requiredText(body && body.reason, 'reason', 1000, fields, 'Опишите, что не так с отзывом');
  if (reason === undefined && !fields.reason) fields.reason = 'Опишите, что не так с отзывом';
  v.throwIfInvalid(fields);
  try {
    await reviewRepository.createReport(row.id, user.id, reason);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Жалоба на этот отзыв уже на рассмотрении', { code: 'REPORT_PENDING' });
    throw err;
  }
  return reviewView(await reviewRepository.findById(row.id), 'psychologist');
}

// ---------- Модерация ----------

const STATUSES = ['pending', 'approved', 'rejected'];

async function listForModeration(query) {
  const status = query.status || 'pending';
  if (!STATUSES.includes(status)) throw new HttpError(422, `status – ${STATUSES.join(', ')}`);
  return { status, items: (await reviewRepository.listForModeration(status)).map((r) => reviewView(r, 'moderator')) };
}

function checkDecision(body, allowed) {
  const status = body && body.status;
  const comment = v.text(body && body.comment) || null;
  if (!allowed.includes(status)) throw new HttpError(422, `status – ${allowed.join(' или ')}`, { fields: { status: allowed.join(', ') } });
  return { status, comment };
}

// PATCH /api/admin/reviews/:id { status: 'approved' | 'rejected', comment } – комментарий обязателен при отклонении
async function moderate(moderator, id, body, ip) {
  const row = Number.isSafeInteger(id) ? await reviewRepository.findById(id) : null;
  if (!row) throw new HttpError(404, 'Отзыв не найден');
  const { status, comment } = checkDecision(body, ['approved', 'rejected']);
  if (status === 'rejected' && !comment) {
    throw new HttpError(422, 'Напишите клиенту, почему отзыв не опубликован', { fields: { comment: 'Обязательно при отклонении' } });
  }
  await transaction(async (db) => {
    await reviewRepository.moderate(row.id, status, comment, moderator.id, db);
    await auditRepository.log({
      actorId: moderator.id, action: status === 'approved' ? 'review.approve' : 'review.reject', entityType: 'review',
      entityId: row.id, ip,
      details: { psychologist: fullName(row.psy_first_name, row.psy_last_name), rating: row.rating, comment },
    }, db);
  });
  await catalogCache.invalidate(); // рейтинг психолога мог измениться
  realtime.emit('notify', { userIds: [row.client_id], event: 'review:moderated', payload: { reviewId: row.id, status, comment } });
  return reviewView(await reviewRepository.findById(row.id), 'moderator');
}

async function listReports(query) {
  const status = query.status || 'pending';
  if (!STATUSES.includes(status)) throw new HttpError(422, `status – ${STATUSES.join(', ')}`);
  const rows = await reviewRepository.listReports(status);
  return {
    status,
    items: rows.map((r) => ({
      id: r.report_row_id, status: r.row_status, reason: r.row_reason, createdAt: r.row_created_at,
      comment: r.row_comment, resolvedAt: r.row_resolved_at, review: reviewView(r, 'moderator'),
    })),
  };
}

// PATCH /api/admin/review-reports/:id { decision: 'hide' | 'keep', comment }:
// hide – жалоба принята, отзыв снят с публикации; keep – жалоба отклонена, отзыв остаётся
async function resolveReport(moderator, id, body, ip) {
  const rep = Number.isSafeInteger(id) ? await reviewRepository.findReport(id) : null;
  if (!rep) throw new HttpError(404, 'Жалоба не найдена');
  if (rep.status !== 'pending') throw new HttpError(409, 'По жалобе уже есть решение', { code: 'ALREADY_RESOLVED' });
  const decision = body && body.decision;
  const comment = v.text(body && body.comment);
  if (!['hide', 'keep'].includes(decision)) throw new HttpError(422, 'decision – hide или keep', { fields: { decision: 'hide, keep' } });
  if (!comment) throw new HttpError(422, 'Напишите комментарий к решению', { fields: { comment: 'Обязательно' } });
  const review = await reviewRepository.findById(rep.review_id);

  await transaction(async (db) => {
    await reviewRepository.resolveReport(rep.id, decision === 'hide' ? 'approved' : 'rejected', comment, moderator.id, db);
    if (decision === 'hide') await reviewRepository.moderate(rep.review_id, 'rejected', comment, moderator.id, db);
    await auditRepository.log({
      actorId: moderator.id, action: decision === 'hide' ? 'review.hide' : 'review.keep', entityType: 'review',
      entityId: rep.review_id, ip,
      details: { psychologist: fullName(review.psy_first_name, review.psy_last_name), report: rep.reason, comment },
    }, db);
  });
  if (decision === 'hide') await catalogCache.invalidate();
  realtime.emit('notify', { userIds: [rep.reporter_id], event: 'review:report-resolved', payload: { reviewId: rep.review_id, decision, comment } });
  return { id: rep.id, decision, comment };
}

module.exports = {
  listMine, create, update, remove, listForPsychologist, reply, report,
  listForModeration, moderate, listReports, resolveReport,
};
