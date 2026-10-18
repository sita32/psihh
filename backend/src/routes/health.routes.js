// GET /api/health – состояние сервера, PostgreSQL и Redis.
const { Router } = require('express');
const healthService = require('../services/health.service');

const router = Router();

router.get('/', async (req, res) => {
  const health = await healthService.getHealth();
  // 503 – чтобы Docker и nginx видели, что сервер работает без БД или Redis
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

module.exports = router;
