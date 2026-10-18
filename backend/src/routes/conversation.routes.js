// /api/conversations – чат: диалоги, сообщения, «прочитано».
// Новые сообщения приходят через Socket.IO (socket/index.js); отправлять можно и сюда.
const { Router } = require('express');
const chatService = require('../services/chat.service');
const { requirePermission } = require('../middleware/auth');

const router = Router();
router.use(requirePermission('chat.use'));

// GET /api/conversations – мои диалоги: собеседник, «в сети», последнее сообщение, непрочитанные
router.get('/', async (req, res) => {
  res.json({ items: await chatService.listConversations(req.user) });
});

// GET /api/conversations/unread – непрочитанные: всего и по диалогам (значок в шапке)
router.get('/unread', async (req, res) => {
  res.json(await chatService.getUnread(req.user));
});

// POST /api/conversations { psychologistId } | { clientId } – начать или открыть диалог
router.post('/', async (req, res) => {
  res.status(201).json(await chatService.openConversation(req.user, req.body));
});

// GET /api/conversations/:id/messages?before=&limit= – сообщения (и события записей на первой странице)
router.get('/:id/messages', async (req, res) => {
  res.json(await chatService.getMessages(req.user, Number(req.params.id), req.query));
});

// POST /api/conversations/:id/messages { body } – отправить сообщение
router.post('/:id/messages', async (req, res) => {
  res.status(201).json(await chatService.sendMessage(req.user, Number(req.params.id), req.body && req.body.body));
});

// POST /api/conversations/:id/read – прочитал входящие
router.post('/:id/read', async (req, res) => {
  res.json(await chatService.markRead(req.user, Number(req.params.id)));
});

module.exports = router;
