// Подтверждение статуса специалиста: психолог загружает дипломы и сертификаты и подаёт заявку,
// модератор смотрит документы и одобряет (анкету можно публиковать) или отклоняет с комментарием.
const { transaction } = require('../db/postgres');
const documentRepository = require('../repositories/document.repository');
const psychologistRepository = require('../repositories/psychologist.repository');
const fileRepository = require('../repositories/file.repository');
const auditRepository = require('../repositories/audit.repository');
const catalogCache = require('../repositories/catalog-cache.repository');
const accessService = require('./access.service');
const realtime = require('../realtime');
const v = require('./validation');
const { HttpError } = require('../errors');

const DOC_TYPES = ['diploma', 'certificate', 'license', 'other'];
const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']; // как CHECK в documents
const MAX_DOCUMENTS = 10;
const fullName = (first, last) => [first, last].filter(Boolean).join(' ');

function documentView(d) {
  return {
    id: d.id, type: d.doc_type, institution: d.institution, specialty: d.specialty, year: d.issued_year,
    fileName: d.original_name, mimeType: d.mime_type, size: d.size_bytes, status: d.status,
    comment: d.review_comment, reviewedAt: d.reviewed_at, uploadedAt: d.uploaded_at,
  };
}

async function requireProfile(user) {
  const profile = await psychologistRepository.findOwnProfile(user.id);
  if (!profile) throw new HttpError(409, 'Сначала заполните анкету психолога', { code: 'NO_PROFILE' });
  return profile;
}

// ---------- Документы психолога ----------

// POST /api/profile/documents (multipart: file, type, institution, specialty, year)
async function uploadDocument(user, file, body) {
  await requireProfile(user);
  if (!file) throw new HttpError(422, 'Прикрепите файл', { fields: { file: 'PDF, JPG, PNG или WEBP' } });
  const type = detectAllowed(file.buffer, DOC_MIME);
  const fields = {};
  const docType = body.type || 'diploma';
  if (!DOC_TYPES.includes(docType)) fields.type = DOC_TYPES.join(', ');
  const institution = v.optionalText(body.institution, 'institution', 255, fields) ?? null;
  const specialty = v.optionalText(body.specialty, 'specialty', 255, fields) ?? null;
  const year = v.intParam(body.year, 'year', { min: 1950, max: new Date().getFullYear() }, fields) ?? null;
  if (docType === 'diploma' && !institution) fields.institution = 'Укажите, кто выдал диплом';
  v.throwIfInvalid(fields);
  if ((await documentRepository.listByPsychologist(user.id)).length >= MAX_DOCUMENTS) {
    throw new HttpError(409, `Можно загрузить не больше ${MAX_DOCUMENTS} документов`, { code: 'TOO_MANY_DOCUMENTS' });
  }

  const key = await fileRepository.save('documents', file.buffer, type.ext);
  try {
    const doc = await documentRepository.create({
      psychologistId: user.id, type: docType, institution, specialty, year, fileKey: key,
      originalName: fileRepository.safeName(file.originalname), mimeType: type.mime, size: file.size,
    });
    return documentView(doc);
  } catch (err) {
    await fileRepository.remove(key); // запись в БД не удалась – файл не нужен
    throw err;
  }
}

// Проверенный модератором документ удалить нельзя – он основание статуса специалиста
async function deleteDocument(user, id) {
  const doc = Number.isSafeInteger(id) ? await documentRepository.findById(id) : null;
  if (!doc || doc.psychologist_id !== user.id) throw new HttpError(404, 'Документ не найден');
  if (doc.status === 'approved') throw new HttpError(409, 'Проверенный документ удалить нельзя', { code: 'DOCUMENT_APPROVED' });
  await documentRepository.remove(doc.id);
  await fileRepository.remove(doc.file_key);
}

// Файл документа: владельцу и модератору с правом проверки
async function getDocumentFile(user, id) {
  const doc = Number.isSafeInteger(id) ? await documentRepository.findById(id) : null;
  const allowed = doc && (doc.psychologist_id === user.id
    || await accessService.hasAnyPermission(user.id, ['psychologists.verify']));
  if (!allowed) throw new HttpError(404, 'Документ не найден');
  if (!(await fileRepository.exists(doc.file_key))) throw new HttpError(404, 'Файл недоступен');
  return { path: fileRepository.resolve(doc.file_key), name: doc.original_name, mimeType: doc.mime_type };
}

// Тип файла по содержимому – из разрешённых, иначе 422
function detectAllowed(buffer, allowed) {
  const type = fileRepository.detectType(buffer);
  if (!type || !allowed.includes(type.mime)) {
    throw new HttpError(422, 'Неподходящий формат файла', { fields: { file: 'Подходят PDF, JPG, PNG или WEBP' } });
  }
  return type;
}

// ---------- Заявка психолога ----------

async function getOwn(user) {
  const profile = await requireProfile(user);
  const [requests, documents] = await Promise.all([
    documentRepository.listRequestsOf(user.id),
    documentRepository.listByPsychologist(user.id),
  ]);
  return {
    status: profile.verification_status,
    documents: documents.map(documentView),
    requests: requests.map((r) => ({ id: r.id, status: r.status, submittedAt: r.submitted_at, reviewedAt: r.reviewed_at, comment: r.comment })),
  };
}

// POST /api/profile/verification – подать заявку: анкета заполнена, есть документы
async function submit(user) {
  const profile = await requireProfile(user);
  if (profile.verification_status === 'verified') throw new HttpError(409, 'Статус специалиста уже подтверждён', { code: 'ALREADY_VERIFIED' });
  if (profile.verification_status === 'pending') throw new HttpError(409, 'Заявка уже на проверке', { code: 'REQUEST_PENDING' });

  const docs = await documentRepository.listByPsychologist(user.id);
  const fields = {};
  if (!profile.headline) fields.headline = 'Добавьте короткую подпись: кто вы как специалист';
  if (!profile.bio) fields.bio = 'Расскажите об опыте';
  if (!profile.methods.length) fields.methods = 'Выберите методы работы';
  if (!profile.topics.length) fields.topics = 'Выберите темы, с которыми работаете';
  if (!profile.services.length) fields.services = 'Укажите цену хотя бы одного формата';
  if (!docs.some((d) => d.status !== 'rejected')) fields.documents = 'Загрузите диплом о психологическом образовании';
  if (Object.keys(fields).length) throw new HttpError(422, 'Перед проверкой заполните анкету', { fields });

  try {
    await documentRepository.createRequest(user.id); // триггер: анкета – «на проверке», снята с публикации
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Заявка уже на проверке', { code: 'REQUEST_PENDING' });
    throw err;
  }
  await catalogCache.invalidate();
  return getOwn(user);
}

// ---------- Модератор ----------

async function listRequests(query) {
  const status = query.status || 'pending';
  if (!['pending', 'approved', 'rejected'].includes(status)) throw new HttpError(422, 'status – pending, approved или rejected');
  const rows = await documentRepository.listRequests(status);
  return {
    status,
    items: rows.map((r) => ({
      id: r.id, status: r.status, submittedAt: r.submitted_at, reviewedAt: r.reviewed_at, comment: r.comment,
      reviewedBy: r.reviewed_by ? { id: r.reviewed_by, login: r.reviewed_by_login } : null,
      psychologist: {
        id: r.user_id, email: r.email, name: fullName(r.first_name, r.last_name), middleName: r.middle_name,
        gender: r.gender, headline: r.headline, bio: r.bio, approach: r.approach,
        avatarUrl: r.avatar_key ? `/${r.avatar_key}` : null, experienceYears: r.experience_years,
        priceFrom: r.price_from === null ? null : Number(r.price_from), methods: r.methods,
      },
      documents: r.documents,
    })),
  };
}

// PATCH /api/admin/verification-requests/:id { status: 'approved' | 'rejected', comment }
async function decide(moderator, id, body, ip) {
  const request = Number.isSafeInteger(id) ? await documentRepository.findRequest(id) : null;
  if (!request) throw new HttpError(404, 'Заявка не найдена');
  if (request.status !== 'pending') throw new HttpError(409, 'По заявке уже есть решение', { code: 'ALREADY_DECIDED' });
  const status = body && body.status;
  const comment = v.text(body && body.comment) || null;
  if (!['approved', 'rejected'].includes(status)) throw new HttpError(422, 'status – approved или rejected', { fields: { status: 'approved, rejected' } });
  if (status === 'rejected' && !comment) {
    throw new HttpError(422, 'Напишите психологу, почему заявка отклонена', { fields: { comment: 'Обязательно при отклонении' } });
  }
  const profile = await psychologistRepository.findOwnProfile(request.psychologist_id);

  await transaction(async (db) => {
    await documentRepository.decideRequest(request.id, status, comment, moderator.id, db); // триггер меняет статус анкеты
    await documentRepository.decidePending(request.psychologist_id, status, status === 'rejected' ? comment : null, moderator.id, db);
    await auditRepository.log({
      actorId: moderator.id, action: status === 'approved' ? 'verification.approve' : 'verification.reject',
      entityType: 'psychologist', entityId: request.psychologist_id, ip,
      details: { psychologist: fullName(profile.first_name, profile.last_name), comment },
    }, db);
  });
  await catalogCache.invalidate();
  realtime.emit('notify', { userIds: [request.psychologist_id], event: 'verification:decided', payload: { requestId: request.id, status, comment } });
  return { id: request.id, status, comment };
}

module.exports = {
  uploadDocument, deleteDocument, getDocumentFile, getOwn, submit, listRequests, decide, detectAllowed,
};
