// Записи на консультации: запись клиента, список и подробности, отмена и перенос с причиной,
// отметка психолога после встречи («состоялась» / «клиент не пришёл»).
// Допустимость переходов и занятость окна дополнительно проверяют триггеры БД.
const config = require('../config');
const { transaction } = require('../db/postgres');
const appointmentRepository = require('../repositories/appointment.repository');
const catalogCache = require('../repositories/catalog-cache.repository');
const v = require('./validation');
const { HttpError } = require('../errors');

const { timezone } = config;
const SCOPES = ['upcoming', 'past', 'cancelled', 'all'];

// Ошибки триггеров (check_violation) и ограничений (уникальность активной записи на окно) → 409
async function guarded(fn, message) {
  try {
    return await fn();
  } catch (err) {
    if (['23514', '23505', '23P01'].includes(err.code)) throw new HttpError(409, message, { code: 'CONFLICT' });
    throw err;
  }
}

function checkReason(value) {
  const reason = v.text(value);
  if (reason.length < 3) throw new HttpError(422, 'Укажите причину', { fields: { reason: 'Напишите причину – её увидит другая сторона' } });
  if (reason.length > 500) throw new HttpError(422, 'Причина слишком длинная', { fields: { reason: 'Не длиннее 500 символов' } });
  return reason;
}

// ---------- Как запись выглядит в ответе ----------

// История с цепочкой переносов → понятные события: создана, перенесена (с → на), отменена, состоялась…
function historyView(rows) {
  const events = [];
  rows.forEach((h, i) => {
    const by = h.changed_by ? { id: h.changed_by, name: h.changed_by_name, role: h.changed_by_role } : null;
    const when = { date: h.local_date, time: h.local_time };
    if (h.old_status === null) {
      // Создание новой записи после переноса – уже показано событием «перенесена»
      if (i > 0 && rows[i - 1].new_status === 'rescheduled') return;
      events.push({ type: 'created', at: h.changed_at, by, slot: when });
    } else if (h.new_status === 'rescheduled') {
      const next = rows.slice(i + 1).find((x) => x.old_status === null);
      events.push({ type: 'rescheduled', at: h.changed_at, by, reason: h.reason,
        from: when, to: next ? { date: next.local_date, time: next.local_time } : null });
    } else {
      events.push({ type: h.new_status, at: h.changed_at, by, reason: h.reason });
    }
  });
  return events;
}

// Что текущий пользователь может сделать с записью – интерфейс показывает только эти кнопки
function actionsFor(row, user) {
  const isPsy = row.psychologist_id === user.id;
  const open = row.status === 'scheduled';
  return {
    cancel: open && !row.is_started,
    reschedule: open && !row.is_started,
    markCompleted: isPsy && open && row.is_started,
    markNoShow: isPsy && open && row.is_started,
    review: !isPsy && row.status === 'completed' && !row.has_review,
  };
}

function appointmentView(row, user, history) {
  return {
    id: row.id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    date: row.local_date,
    time: row.local_time,
    format: { code: row.format_code, name: row.format_name, durationMin: row.duration_min },
    price: Number(row.price_at_booking),
    note: row.client_note,
    meetingUrl: row.meeting_url,
    nth: row.nth,
    needsMark: row.status === 'scheduled' && row.is_started, // прошла, психолог ещё не отметил
    psychologist: {
      id: row.psychologist_id,
      name: `${row.psy_first_name} ${row.psy_last_name}`,
      headline: row.psy_headline,
      avatarUrl: row.psy_avatar_key ? `/${row.psy_avatar_key}` : null,
    },
    client: {
      id: row.client_id,
      name: [row.client_first_name, row.client_last_name].filter(Boolean).join(' '),
      avatarUrl: row.client_avatar_key ? `/${row.client_avatar_key}` : null,
    },
    hasReview: row.has_review,
    review: row.review, // { id, status } – отзыв клиента по этой встрече, если есть
    actions: actionsFor(row, user),
    history,
  };
}

async function withHistory(rows, user) {
  if (!rows.length) return [];
  const history = await appointmentRepository.findHistory(rows.map((r) => r.id), timezone);
  return rows.map((row) => appointmentView(row, user, historyView(history.filter((h) => h.root_id === row.id))));
}

// Запись, в которой пользователь участвует (клиент или психолог); чужая – 404, чтобы не раскрывать, что она есть
async function findOwn(user, id) {
  const row = Number.isSafeInteger(id) ? await appointmentRepository.findById(id, timezone) : null;
  if (!row || (row.client_id !== user.id && row.psychologist_id !== user.id)) {
    throw new HttpError(404, 'Запись не найдена');
  }
  return row;
}

async function view(user, id) {
  const [item] = await withHistory([await findOwn(user, id)], user);
  return item;
}

// ---------- Чтение ----------

// as – чьи записи: клиента или психолога (по умолчанию – по роли)
async function list(user, query) {
  const as = query.as || (user.roles.includes('psychologist') ? 'psychologist' : 'client');
  const scope = query.scope || 'upcoming';
  if (!['client', 'psychologist'].includes(as) || !user.roles.includes(as)) {
    throw new HttpError(403, 'Нет записей для этой роли');
  }
  if (!SCOPES.includes(scope)) {
    throw new HttpError(422, `scope – одно из: ${SCOPES.join(', ')}`, { fields: { scope: SCOPES.join(', ') } });
  }
  const rows = await appointmentRepository.list(user.id, as, scope, timezone);
  return { as, scope, items: await withHistory(rows, user) };
}

// ---------- Запись клиента ----------

// Свободное будущее окно психолога, без пересечения с другими записями клиента.
// Новая запись – только к психологу из каталога; перенос (psychologistId) – и к скрытому из каталога
async function checkSlot(slotId, clientId, { psychologistId, exceptAppointmentId } = {}) {
  const slot = Number.isSafeInteger(slotId) ? await appointmentRepository.findSlotForBooking(slotId) : null;
  if (!slot || (psychologistId ? slot.psychologist_id !== psychologistId : !slot.is_listed)) {
    throw new HttpError(404, 'Окно не найдено', { fields: { slotId: 'Выберите другое время' } });
  }
  if (slot.is_past) throw new HttpError(409, 'Это время уже прошло', { code: 'SLOT_PAST' });
  if (slot.status !== 'free') throw new HttpError(409, 'Это время уже заняли – выберите другое', { code: 'SLOT_TAKEN' });
  if (await appointmentRepository.findClientOverlap(clientId, slot.starts_at, slot.ends_at, exceptAppointmentId)) {
    throw new HttpError(409, 'В это время у вас уже есть другая консультация', { code: 'CLIENT_BUSY' });
  }
  return slot;
}

// POST /api/appointments { slotId, format = 'individual', note }
async function book(user, body) {
  if (!user.roles.includes('client')) throw new HttpError(403, 'Записываться могут только клиенты');
  const slotId = Number(body && body.slotId);
  const format = v.text(body && body.format) || 'individual';
  const note = v.text(body && body.note).slice(0, 1000) || null;

  const slot = await checkSlot(slotId, user.id);
  const service = await appointmentRepository.findService(slot.psychologist_id, format);
  if (!service) throw new HttpError(422, 'Психолог не работает в этом формате', { fields: { format: 'Выберите другой формат' } });

  const id = await guarded(() => transaction((db) => appointmentRepository.create({
    clientId: user.id,
    psychologistId: slot.psychologist_id,
    slotId: slot.id,
    serviceId: service.id,
    price: service.price, // цена фиксируется в записи и не меняется вместе с прайсом
    note,
  }, db), { userId: user.id }), 'Это время уже заняли – выберите другое');

  await catalogCache.invalidate(); // у психолога сдвинулось ближайшее окно
  return view(user, id);
}

// ---------- Смена статуса ----------

// PATCH /api/appointments/:id { status: 'cancelled', reason } | { status: 'completed' | 'no_show' }
async function changeStatus(user, id, body) {
  const row = await findOwn(user, id);
  const status = body && body.status;
  const actions = actionsFor(row, user);

  if (status === 'cancelled') {
    const reason = checkReason(body.reason);
    if (!actions.cancel) throw new HttpError(409, 'Отменить можно только запланированную встречу до её начала', { code: 'CANNOT_CANCEL' });
    await guarded(() => transaction((db) => appointmentRepository.setStatus(row.id, 'cancelled', db),
      { userId: user.id, reason }), 'Запись уже изменилась – обновите страницу');
    await catalogCache.invalidate(); // окно снова свободно
  } else if (status === 'completed' || status === 'no_show') {
    if (row.psychologist_id !== user.id) throw new HttpError(403, 'Отметить встречу может только психолог');
    if (!actions.markCompleted) {
      throw new HttpError(409, row.status === 'scheduled' ? 'Консультация ещё не началась' : 'Встреча уже отмечена', { code: 'CANNOT_MARK' });
    }
    await guarded(() => transaction((db) => appointmentRepository.setStatus(row.id, status, db),
      { userId: user.id }), 'Запись уже изменилась – обновите страницу');
  } else {
    throw new HttpError(422, 'status – cancelled, completed или no_show', { fields: { status: 'cancelled, completed, no_show' } });
  }
  return view(user, row.id);
}

// POST /api/appointments/:id/reschedule { slotId, reason } – перенос на другое окно того же психолога.
// Старая запись получает статус «перенесена», новая ссылается на неё; цена остаётся прежней.
async function reschedule(user, id, body) {
  const row = await findOwn(user, id);
  const reason = checkReason(body && body.reason);
  if (!actionsFor(row, user).reschedule) {
    throw new HttpError(409, 'Перенести можно только запланированную встречу до её начала', { code: 'CANNOT_RESCHEDULE' });
  }
  const slot = await checkSlot(Number(body.slotId), row.client_id,
    { psychologistId: row.psychologist_id, exceptAppointmentId: row.id });

  const newId = await guarded(() => transaction(async (db) => {
    await appointmentRepository.setStatus(row.id, 'rescheduled', db); // триггер освободит старое окно и запишет причину
    return appointmentRepository.create({
      clientId: row.client_id,
      psychologistId: row.psychologist_id,
      slotId: slot.id,
      serviceId: row.service_id,
      price: row.price_at_booking,
      note: row.client_note,
      rescheduledFromId: row.id,
    }, db);
  }, { userId: user.id, reason }), 'Это время уже заняли – выберите другое');

  await catalogCache.invalidate();
  return view(user, newId);
}

module.exports = { list, view, book, changeStatus, reschedule };
