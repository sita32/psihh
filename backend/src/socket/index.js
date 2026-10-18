// Socket.IO: чат в реальном времени.
// Вход – по той же httpOnly-cookie с access-токеном, что и для REST.
// Каждый пользователь сидит в своей комнате user:{id} (все его вкладки и устройства);
// события из шины realtime рассылаются по этим комнатам. Redis-адаптер передаёт их
// между несколькими экземплярами сервера.
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const redis = require('../db/redis');
const realtime = require('../realtime');
const authService = require('../services/auth.service');
const accessService = require('../services/access.service');
const chatService = require('../services/chat.service');
const { readCookie, ACCESS_COOKIE } = require('../middleware/auth');

const HEARTBEAT_MS = 30 * 1000; // как часто отмечать «в сети» подключённых пользователей
let closing = false;

// Ответ на событие с подтверждением: { ok: true, ... } или { error: { code, message } }
function reply(ack, promise) {
  promise
    .then((data) => typeof ack === 'function' && ack({ ok: true, ...data }))
    .catch((err) => {
      const status = err.status || 500;
      if (status >= 500) console.error('[socket]', err);
      if (typeof ack === 'function') {
        ack({ error: status >= 500 ? { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } : { code: err.code, message: err.message } });
      }
    });
}

function attachSocket(httpServer) {
  // Отдельные соединения для публикации и подписки – подписанный клиент Redis не выполняет другие команды
  const pubClient = redis.duplicate({ keyPrefix: '' });
  const subClient = redis.duplicate({ keyPrefix: '' });
  const io = new Server(httpServer, {
    adapter: createAdapter(pubClient, subClient, { key: 'ryadom:socket.io' }),
    serveClient: true, // /socket.io/socket.io.js – клиентская библиотека для страниц
  });

  // Проверка входа при подключении: истёкший токен – ошибка TOKEN_EXPIRED, страница вызовет /api/auth/refresh
  io.use(async (socket, next) => {
    try {
      const user = await authService.authenticate(readCookie(socket.request, ACCESS_COOKIE));
      if (!(await accessService.hasAnyPermission(user.id, ['chat.use']))) throw Object.assign(new Error('Нет доступа к чату'), { code: 'FORBIDDEN' });
      socket.data.user = user;
      next();
    } catch (err) {
      next(Object.assign(new Error(err.message), { data: { code: err.code || 'UNAUTHORIZED' } }));
    }
  });

  io.on('connection', async (socket) => {
    const { user } = socket.data;
    socket.join(`user:${user.id}`);
    chatService.setPresence(user.id, true).catch((err) => console.error('[socket] presence', err));

    // { conversationId, body } → ack { ok, message }
    socket.on('message:send', (data, ack) => reply(ack,
      chatService.sendMessage(user, Number(data && data.conversationId), data && data.body).then((message) => ({ message }))));

    // { conversationId } → ack { ok, read }
    socket.on('messages:read', (data, ack) => reply(ack, chatService.markRead(user, Number(data && data.conversationId))));

    // { conversationId } – собеседник увидит «печатает…»
    socket.on('typing', (data) => reply(null, chatService.typing(user, Number(data && data.conversationId))));

    socket.on('disconnect', async () => {
      if (closing) return; // сервер останавливается – соединения с Redis уже закрываются
      try {
        // Вышел из сети, только если закрыта последняя вкладка (на любом экземпляре сервера)
        const left = await io.in(`user:${user.id}`).fetchSockets();
        if (!left.length) await chatService.setPresence(user.id, false);
      } catch (err) {
        console.error('[socket] presence', err.message);
      }
    });
  });

  // События сервисов → комнаты пользователей
  realtime.on('notify', ({ userIds, event, payload }) => {
    io.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
  });

  // Пользователя заблокировали или сменили роли – закрываем его соединения на всех экземплярах
  realtime.on('disconnect-user', ({ userId }) => {
    io.in(`user:${userId}`).disconnectSockets(true);
  });

  // Пока сокет подключён, пользователь «в сети»: обновляем время активности
  const heartbeat = setInterval(() => {
    const ids = new Set([...io.of('/').sockets.values()].map((s) => s.data.user.id));
    ids.forEach((id) => chatService.touch(id).catch(() => {}));
  }, HEARTBEAT_MS);

  return {
    io,
    async close() {
      closing = true;
      clearInterval(heartbeat);
      await new Promise((resolve) => io.close(() => resolve()));
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    },
  };
}

module.exports = { attachSocket };
