// /api/psychologists – каталог и страница психолога (доступны без входа).
const { Router } = require('express');
const catalogService = require('../services/catalog.service');

const router = Router();

// GET /api/psychologists?topic=anxiety,stress&method=cbt&format=individual&gender=female
//   &expMin=5&priceMax=80&date=2026-10-20&time=10:00&part=evening&sort=soon&page=1&limit=6
router.get('/', async (req, res) => {
  res.json(await catalogService.search(req.query));
});

// GET /api/psychologists/:id – анкета, услуги с ценами, образование
router.get('/:id', async (req, res) => {
  res.json(await catalogService.getPsychologist(Number(req.params.id)));
});

module.exports = router;
