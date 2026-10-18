// /api/references – справочники для фильтров и анкеты: коды и названия.
const { Router } = require('express');
const referenceService = require('../services/reference.service');

const router = Router();

// GET /api/references – { methods, topics, formats }
router.get('/', async (req, res) => {
  res.json(await referenceService.getAll());
});

module.exports = router;
