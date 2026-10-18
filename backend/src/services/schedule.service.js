// Расписание психолога: свои окна по неделям, добавление пачкой, закрыть/открыть, удалить,
// закрыть весь день. Свободные окна любого психолога из каталога – для записи клиента.
const config = require('../config');
const scheduleRepository = require('../repositories/schedule.repository');
const psychologistRepository = require('../repositories/psychologist.repository');
const catalogCache = require('../repositories/catalog-cache.repository');
const v = require('./validation');
const { HttpError } = require('../errors');

const { timezone } = config;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RANGE_DAYS = 62;   // за раз – не больше двух месяцев
const MAX_NEW_SLOTS = 300;   // окон за один запрос («6 недель × 7 дней × 7 времён» помещается)

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Промежуток дат from…to из строки запроса; по умолчанию – неделя с сегодняшнего дня
function parseRange(query) {
  const fields = {};
  const today = v.todayIn(timezone);
  const from = query.from || today;
  const to = query.to || addDays(from, 6);
  if (!v.isIsoDate(from)) fields.from = 'Дата в формате ГГГГ-ММ-ДД';
  if (!v.isIsoDate(to)) fields.to = 'Дата в формате ГГГГ-ММ-ДД';
  v.throwIfInvalid(fields);
  if (to < from) throw new HttpError(422, 'Конец периода раньше начала', { fields: { to: 'Раньше, чем from' } });
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) {
    throw new HttpError(422, `Период – не больше ${MAX_RANGE_DAYS} дней`, { fields: { to: 'Слишком длинный период' } });
  }
  return { from, to };
}

function slotView(row) {
  const slot = {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    date: row.local_date,
    time: row.local_time,
    status: row.status,
  };
  if (row.appointment_id) {
    slot.appointment = {
      id: row.appointment_id,
      status: row.appointment_status,
      client: { id: row.client_id, name: [row.client_first_name, row.client_last_name].filter(Boolean).join(' ') },
      format: { code: row.format_code, name: row.format_name },
      price: Number(row.price_at_booking),
      note: row.client_note,
    };
  }
  return slot;
}

// Только психолог с анкетой ведёт расписание
async function assertHasProfile(user) {
  if (!(await psychologistRepository.findOwnProfile(user.id))) {
    throw new HttpError(409, 'Сначала заполните анкету психолога', { code: 'NO_PROFILE' });
  }
}

async function getOwnSlots(user, query) {
  const { from, to } = parseRange(query);
  const rows = await scheduleRepository.findOwnSlots(user.id, from, to, timezone);
  return { from, to, timezone, slots: rows.map(slotView) };
}

// Свободные окна психолога из каталога (для страницы психолога и переноса записи)
async function getFreeSlots(psychologistId, query) {
  if (!Number.isSafeInteger(psychologistId) || psychologistId <= 0
      || !(await psychologistRepository.findPublicById(psychologistId))) {
    throw new HttpError(404, 'Психолог не найден');
  }
  const range = parseRange({ from: query.from, to: query.to || addDays(query.from || v.todayIn(timezone), 13) });
  const rows = await scheduleRepository.findFreeSlots(psychologistId, range.from, range.to, timezone);
  return { ...range, timezone, slots: rows.map(slotView) };
}

/**
 * Новые окна: { slots: [{ date: 'ГГГГ-ММ-ДД', time: 'ЧЧ:ММ' }], durationMin = 50 }.
 * Прошедшее время и окна, пересекающиеся с уже существующими, пропускаются – в ответе видно какие.
 */
async function createSlots(user, body) {
  await assertHasProfile(user);
  const items = Array.isArray(body && body.slots) ? body.slots : null;
  const durationMin = body && body.durationMin !== undefined ? Number(body.durationMin) : 50;
  const fields = {};
  if (!items || !items.length) fields.slots = 'Передайте хотя бы одно окно: [{ date, time }]';
  else if (items.length > MAX_NEW_SLOTS) fields.slots = `Не больше ${MAX_NEW_SLOTS} окон за раз`;
  else if (items.some((i) => !i || !v.isIsoDate(i.date) || !TIME_RE.test(i.time))) fields.slots = 'Каждое окно – { date: ГГГГ-ММ-ДД, time: ЧЧ:ММ }';
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 240) fields.durationMin = 'От 15 до 240 минут';
  v.throwIfInvalid(fields);

  const resolved = await scheduleRepository.resolveTimes(items, timezone);
  const future = resolved.filter((r) => !r.is_past);
  const created = await scheduleRepository.createSlots(user.id, future.map((r) => r.starts_at), durationMin);
  const createdAt = new Set(created.map((c) => c.starts_at.getTime()));
  if (created.length) await catalogCache.invalidate();

  return {
    created: created.length,
    skipped: resolved
      .filter((r) => r.is_past || !createdAt.has(r.starts_at.getTime()))
      .map((r) => ({ date: r.date, time: r.time, reason: r.is_past ? 'past' : 'overlap' })),
  };
}

// Своё окно, которое ещё можно менять
async function findOwnSlot(user, id) {
  const slot = Number.isSafeInteger(id) ? await scheduleRepository.findSlot(id) : null;
  if (!slot || slot.psychologist_id !== user.id) throw new HttpError(404, 'Окно не найдено');
  if (slot.is_past) throw new HttpError(409, 'Это время уже прошло', { code: 'SLOT_PAST' });
  if (slot.status === 'booked') {
    throw new HttpError(409, 'На это окно записан клиент – сначала отмените или перенесите запись', { code: 'SLOT_BOOKED' });
  }
  return slot;
}

// Закрыть (blocked) или снова открыть (free) окно
async function setSlotStatus(user, id, body) {
  const status = body && body.status;
  if (!['free', 'blocked'].includes(status)) {
    throw new HttpError(422, 'Статус окна – free или blocked', { fields: { status: 'free или blocked' } });
  }
  const slot = await findOwnSlot(user, id);
  if (slot.status !== status) {
    await scheduleRepository.setStatus(slot.id, status);
    await catalogCache.invalidate();
  }
  return { id: slot.id, status };
}

async function deleteSlot(user, id) {
  const slot = await findOwnSlot(user, id);
  if (await scheduleRepository.hasAppointments(slot.id)) {
    // Отменённая запись ссылается на окно – удалить нельзя, иначе пропадёт история
    throw new HttpError(409, 'С этим окном связана история записей – его можно закрыть, но не удалить', { code: 'SLOT_HAS_HISTORY' });
  }
  await scheduleRepository.remove(slot.id);
  await catalogCache.invalidate();
}

// Закрыть все свободные окна дня; записи клиентов остаются
async function blockDay(user, body) {
  const date = body && body.date;
  if (!v.isIsoDate(date)) throw new HttpError(422, 'Дата в формате ГГГГ-ММ-ДД', { fields: { date: 'ГГГГ-ММ-ДД' } });
  const blocked = await scheduleRepository.blockDay(user.id, date, timezone);
  if (blocked) await catalogCache.invalidate();
  return { date, blocked };
}

module.exports = { getOwnSlots, getFreeSlots, createSlots, setSlotStatus, deleteSlot, blockDay };
