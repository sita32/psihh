// /api/roles – роли и права (страница модератора «Роли и права»).
const { Router } = require('express');
const accessService = require('../services/access.service');
const { requirePermission } = require('../middleware/auth');

const router = Router();

// GET /api/roles – все роли с их правами и список прав
router.get('/', requirePermission('roles.assign'), async (req, res) => {
  res.json(await accessService.getRolesOverview());
});

module.exports = router;
