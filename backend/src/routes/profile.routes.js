// /api/profile – свой профиль: клиент – личные данные, психолог – профессиональная анкета.
const { Router } = require('express');
const profileService = require('../services/profile.service');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = Router();

// GET /api/profile – { role, profile }
router.get('/', requireAuth, async (req, res) => {
  res.json(await profileService.getOwn(req.user));
});

// PATCH /api/profile – меняются только переданные поля
router.patch('/', requirePermission('profile.edit_own'), async (req, res) => {
  res.json(await profileService.updateOwn(req.user, req.body));
});

// DELETE /api/profile – удалить анкету психолога (аккаунт остаётся)
router.delete('/', requirePermission('profile.edit_own'), async (req, res) => {
  await profileService.deleteOwn(req.user);
  res.status(204).end();
});

module.exports = router;
