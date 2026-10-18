// /api/reviews – отзывы: свои отзывы клиента, ответ и жалоба психолога.
const { Router } = require('express');
const reviewService = require('../services/review.service');
const { requirePermission } = require('../middleware/auth');

const router = Router();
const asClient = requirePermission('reviews.create');
const asPsychologist = requirePermission('reviews.reply');

// GET /api/reviews – мои отзывы со статусом проверки
router.get('/', asClient, async (req, res) => {
  res.json(await reviewService.listMine(req.user));
});

// POST /api/reviews { appointmentId, rating, body, anonymous } – уходит на проверку модератору
router.post('/', asClient, async (req, res) => {
  res.status(201).json(await reviewService.create(req.user, req.body));
});

// PATCH /api/reviews/:id { rating, body, anonymous } – правка, снова на проверку
router.patch('/:id', asClient, async (req, res) => {
  res.json(await reviewService.update(req.user, Number(req.params.id), req.body));
});

router.delete('/:id', asClient, async (req, res) => {
  await reviewService.remove(req.user, Number(req.params.id));
  res.status(204).end();
});

// PUT /api/reviews/:id/reply { text } – ответ психолога, виден в профиле
router.put('/:id/reply', asPsychologist, async (req, res) => {
  res.json(await reviewService.reply(req.user, Number(req.params.id), req.body && req.body.text));
});

router.delete('/:id/reply', asPsychologist, async (req, res) => {
  res.json(await reviewService.reply(req.user, Number(req.params.id), null));
});

// POST /api/reviews/:id/report { reason } – жалоба модератору
router.post('/:id/report', asPsychologist, async (req, res) => {
  res.status(201).json(await reviewService.report(req.user, Number(req.params.id), req.body));
});

module.exports = router;
