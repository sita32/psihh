// /api/matching – подбор психолога по анкете (доступен без входа).
const { Router } = require('express');
const matchingService = require('../services/matching.service');

const router = Router();

// POST /api/matching  { format, topics[], gender, age, method, parts[], soon }
router.post('/', async (req, res) => {
  res.json(await matchingService.match(req.body));
});

module.exports = router;
