// /api/psychologists – каталог и страница психолога (доступны без входа).
const { Router } = require('express');
const catalogService = require('../services/catalog.service');
const scheduleService = require('../services/schedule.service');
const reviewService = require('../services/review.service');
const { requirePermission } = require('../middleware/auth');

const router = Router();

// GET /api/psychologists?topic=anxiety,stress&method=cbt&format=individual&gender=female
//   &expMin=5&priceMax=80&date=2026-10-20&time=10:00&part=evening&sort=soon&page=1&limit=6
router.get('/', async (req, res) => {
  res.json(await catalogService.search(req.query));
});

// GET /api/psychologists/me/reviews – отзывы о себе в кабинете психолога (с ответами и жалобами)
router.get('/me/reviews', requirePermission('reviews.reply'), async (req, res) => {
  res.json(await reviewService.listForPsychologist(req.user.id, req.query, 'psychologist'));
});

// GET /api/psychologists/:id/reviews?page=&limit= – опубликованные отзывы и сводка по оценкам
router.get('/:id/reviews', async (req, res) => {
  res.json(await reviewService.listForPsychologist(Number(req.params.id), req.query, 'public'));
});

// GET /api/psychologists/:id – анкета, услуги с ценами, образование
router.get('/:id', async (req, res) => {
  res.json(await catalogService.getPsychologist(Number(req.params.id)));
});

// GET /api/psychologists/:id/slots?from=…&to=… – свободные окна для записи (по умолчанию – 2 недели)
router.get('/:id/slots', async (req, res) => {
  res.json(await scheduleService.getFreeSlots(Number(req.params.id), req.query));
});

module.exports = router;
