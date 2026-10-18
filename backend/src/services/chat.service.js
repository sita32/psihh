// Чат клиента и психолога: диалоги, сообщения, «прочитано», статус «в сети», «печатает…».
// Сообщения хранятся в PostgreSQL, временные данные – в Redis; доставка в реальном времени –
// через шину realtime (её слушает Socket.IO), поэтому одинаково работают отправка по REST и по сокету.
const config = require('../config');
const chatRepository = require('../repositories/chat.repository');
const presence = require('../repositories/presence.repository');
const rateLimit = require('../repositories/rate-limit.repository');
const psychologistRepository = require('../repositories/psychologist.repository');
const fileRepository = require('../repositories/file.repository');
const realtime = require('../realtime');
const v = require('./validation');
const { HttpError } = require('../errors');

const { timezone } = config;
const ONLINE_WINDOW_MS = 75 * 1000;            // активен за последние 75 секунд – «в сети»
const TYPING_TTL_SEC = 4;                      // «печатает…» гаснет сам, если ввод прекратился
const MESSAGE_LIMIT = { max: 30, windowSec: 60 }; // не больше 30 сообщений в минуту
const MAX_BODY = 5000;                         // как CHECK в таблице messages

const fullName = (first, last) => [first, last].filter(Boolean).join(' ');
// «В сети» – подключён и был активен недавно (если экземпляр сервера упал, heartbeat перестанет обновлять время)
const isOnline = (s) => Boolean(s && s.activeAt !== null && Date.now() - s.activeAt < ONLINE_WINDOW_MS);
const lastSeenAt = (s) => (s && (s.activeAt ?? s.leftAt) ? new Date(s.activeAt ?? s.leftAt) : null);
const attachmentView = (key) => (key ? { name: key.split('/').pop() } : null);

function messageView(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    attachment: attachmentView(row.attachment_key),
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

// Диалог, в котором пользователь участвует; чужой – 404
async function findOwn(user, id) {
  const conv = Number.isSafeInteger(id) ? await chatRepository.findById(id) : null;
  if (!conv || (conv.client_id !== user.id && conv.psychologist_id !== user.id)) {
    throw new HttpError(404, 'Диалог не найден');
  }
  return conv;
}

const partnerOf = (conv, userId) => (conv.client_id === userId ? conv.psychologist_id : conv.client_id);

// ---------- Диалоги ----------

async function listConversations(user) {
  const rows = await chatRepository.findForUser(user.id, timezone);
  const seen = await presence.lastSeen(rows.map((r) => partnerOf(r, user.id)));
  return rows.map((r) => {
    const asClient = r.client_id === user.id;
    const partnerId = partnerOf(r, user.id);
    return {
      id: r.id,
      partner: asClient
        ? { id: partnerId, role: 'psychologist', name: fullName(r.psy_first_name, r.psy_last_name),
          headline: r.psy_headline, avatarUrl: r.psy_avatar_key ? `/${r.psy_avatar_key}` : null }
        : { id: partnerId, role: 'client', name: fullName(r.client_first_name, r.client_last_name),
          avatarUrl: r.client_avatar_key ? `/${r.client_avatar_key}` : null },
      online: isOnline(seen[partnerId]),
      lastSeenAt: lastSeenAt(seen[partnerId]),
      lastMessage: r.last_id ? {
        id: r.last_id, senderId: r.last_sender_id, body: r.last_body,
        attachment: attachmentView(r.last_attachment_key), createdAt: r.last_created_at,
      } : null,
      unread: r.unread,
      nextSession: r.next_session_at ? { startsAt: r.next_session_at, date: r.next_session_date, time: r.next_session_time } : null,
      sessionsCount: r.sessions_count,
    };
  });
}

// Начать диалог (или открыть существующий): клиент – с психологом из каталога,
// психолог – только со своим клиентом (у них есть записи)
async function openConversation(user, body) {
  let clientId;
  let psychologistId;
  if (user.roles.includes('client') && body && body.psychologistId !== undefined) {
    clientId = user.id;
    psychologistId = Number(body.psychologistId);
    if (!Number.isSafeInteger(psychologistId) || !(await psychologistRepository.findPublicById(psychologistId))) {
      throw new HttpError(404, 'Психолог не найден');
    }
  } else if (user.roles.includes('psychologist') && body && body.clientId !== undefined) {
    psychologistId = user.id;
    clientId = Number(body.clientId);
    if (!Number.isSafeInteger(clientId) || !(await chatRepository.haveAppointments(clientId, psychologistId))) {
      throw new HttpError(403, 'Написать можно только клиенту, который к вам записывался');
    }
  } else {
    throw new HttpError(422, 'Укажите psychologistId (для клиента) или clientId (для психолога)');
  }
  const conv = await chatRepository.findOrCreate(clientId, psychologistId);
  return (await listConversations(user)).find((c) => c.id === conv.id);
}

// ---------- Сообщения ----------

// События записей пары – для ленты чата: «записались», «перенесли с … на …», «отменили», «состоялась»
function eventsView(rows) {
  const events = [];
  rows.forEach((h, i) => {
    if (h.old_status === null && i > 0 && rows[i - 1].new_status === 'rescheduled') return;
    const event = { type: h.old_status === null ? 'booked' : h.new_status, at: h.changed_at, by: h.changed_by,
      appointmentId: h.appointment_id, slot: { date: h.local_date, time: h.local_time }, reason: h.reason };
    if (h.new_status === 'rescheduled') {
      const next = rows.slice(i + 1).find((x) => x.old_status === null);
      event.to = next ? { date: next.local_date, time: next.local_time } : null;
    }
    events.push(event);
  });
  return events;
}

// GET сообщений: before – id самого старого загруженного (подгрузка истории вверх)
async function getMessages(user, conversationId, query) {
  const conv = await findOwn(user, conversationId);
  const fields = {};
  const limit = v.intParam(query.limit, 'limit', { min: 1, max: 100 }, fields) || 50;
  const before = v.intParam(query.before, 'before', { min: 1, max: Number.MAX_SAFE_INTEGER }, fields);
  v.throwIfInvalid(fields);

  const { rows, hasMore } = await chatRepository.findMessages(conv.id, { before, limit });
  const result = { conversationId: conv.id, messages: rows.map(messageView), hasMore };
  if (!before) {
    // События записей – целиком на первой странице, их немного
    result.events = eventsView(await chatRepository.findAppointmentEvents(conv.client_id, conv.psychologist_id, timezone));
  }
  return result;
}

async function sendMessage(user, conversationId, rawBody, file = null) {
  const conv = await findOwn(user, conversationId);
  const body = v.text(rawBody) || null;
  if (!body && !file) throw new HttpError(422, 'Пустое сообщение', { fields: { body: 'Напишите сообщение' } });
  if (body && body.length > MAX_BODY) throw new HttpError(422, `Сообщение длиннее ${MAX_BODY} символов`, { fields: { body: 'Слишком длинное' } });
  if ((await rateLimit.hit('message', user.id, MESSAGE_LIMIT.windowSec)) > MESSAGE_LIMIT.max) {
    throw new HttpError(429, 'Слишком много сообщений подряд – подождите минуту', { code: 'TOO_MANY_MESSAGES' });
  }

  let attachmentKey = null;
  if (file) {
    const type = fileRepository.detectType(file.buffer);
    if (!type) throw new HttpError(422, 'Неподходящий формат файла', { fields: { file: 'Подходят PDF, JPG, PNG или WEBP' } });
    // Исходное имя сохраняется в ключе: chat/{uuid}/Дневник мыслей.pdf
    attachmentKey = await fileRepository.save('chat', file.buffer, type.ext, file.originalname);
  }
  const message = messageView(await chatRepository.createMessage(conv.id, user.id, body, attachmentKey));
  const recipientId = partnerOf(conv, user.id);
  await Promise.all([
    presence.incrementUnread(recipientId, conv.id),
    presence.clearTyping(conv.id, user.id),
    presence.touch(user.id),
  ]);
  // Обоим участникам: собеседнику – новое сообщение, отправителю – в другие его вкладки
  realtime.emit('notify', { userIds: [conv.client_id, conv.psychologist_id], event: 'message:new', payload: message });
  return message;
}

// Файл из сообщения – только участникам диалога
async function getAttachment(user, conversationId, messageId) {
  const conv = await findOwn(user, conversationId);
  const msg = Number.isSafeInteger(messageId) ? await chatRepository.findMessage(conv.id, messageId) : null;
  if (!msg || !msg.attachment_key) throw new HttpError(404, 'Файл не найден');
  if (!(await fileRepository.exists(msg.attachment_key))) throw new HttpError(404, 'Файл недоступен');
  return { path: fileRepository.resolve(msg.attachment_key), name: msg.attachment_key.split('/').pop() };
}

// Собеседник прочитал: отмечаем его входящие и сообщаем отправителю (галочки «прочитано»)
async function markRead(user, conversationId) {
  const conv = await findOwn(user, conversationId);
  const ids = await chatRepository.markRead(conv.id, user.id);
  await presence.clearUnread(user.id, conv.id);
  if (ids.length) {
    realtime.emit('notify', {
      userIds: [conv.client_id, conv.psychologist_id],
      event: 'messages:read',
      payload: { conversationId: conv.id, readerId: user.id, messageIds: ids, readAt: new Date() },
    });
  }
  return { conversationId: conv.id, read: ids.length };
}

// Счётчики непрочитанных для значка в шапке; если в Redis их нет – собираем из БД
async function getUnread(user) {
  let hash = await presence.getUnread(user.id);
  if (!hash) {
    const rows = await chatRepository.countUnread(user.id);
    hash = Object.fromEntries(rows.map((r) => [r.conversation_id, String(r.unread)]));
    await presence.setUnread(user.id, hash);
  }
  const byConversation = Object.fromEntries(Object.entries(hash)
    .filter(([id, n]) => id !== '_' && Number(n) > 0).map(([id, n]) => [id, Number(n)]));
  return { total: Object.values(byConversation).reduce((a, b) => a + b, 0), byConversation };
}

// ---------- Для сокета ----------

// Собеседник набирает текст: сообщаем не чаще раза в TYPING_TTL_SEC
async function typing(user, conversationId) {
  const conv = await findOwn(user, conversationId);
  if (await presence.setTyping(conv.id, user.id, TYPING_TTL_SEC)) {
    realtime.emit('notify', {
      userIds: [partnerOf(conv, user.id)],
      event: 'typing',
      payload: { conversationId: conv.id, userId: user.id, ttlSec: TYPING_TTL_SEC },
    });
  }
}

// Пользователь появился в сети или вышел: отмечаем в Redis и сообщаем собеседникам
async function setPresence(userId, online) {
  const at = Date.now();
  if (online) await presence.touch(userId, at);
  else await presence.goOffline(userId, at);
  const partners = await chatRepository.findPartnerIds(userId);
  if (partners.length) {
    realtime.emit('notify', {
      userIds: [...new Set(partners.map((p) => p.partner_id))],
      event: 'presence',
      payload: { userId, online, lastSeenAt: new Date(at) },
    });
  }
}

module.exports = {
  listConversations, openConversation, getMessages, sendMessage, getAttachment, markRead, getUnread, typing, setPresence,
  touch: (userId) => presence.touch(userId),
};
