// /api/profile – свой профиль: клиент – личные данные, психолог – профессиональная анкета.
const { Router } = require('express');
const profileService = require('../services/profile.service');
const verificationService = require('../services/verification.service');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { uploadFile } = require('../middleware/upload');
const { sendStoredFile } = require('./send-file');

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

// POST /api/profile/avatar (multipart: file) – фото профиля, до 5 МБ
router.post('/avatar', requirePermission('profile.edit_own'), uploadFile(5), async (req, res) => {
  res.json(await profileService.setAvatar(req.user, req.file));
});

router.delete('/avatar', requirePermission('profile.edit_own'), async (req, res) => {
  res.json(await profileService.deleteAvatar(req.user));
});

// ---------- Документы и проверка (психолог) ----------
const asPsychologist = requirePermission('documents.upload');

// GET /api/profile/verification – статус проверки, документы, история заявок
router.get('/verification', asPsychologist, async (req, res) => {
  res.json(await verificationService.getOwn(req.user));
});

// POST /api/profile/verification – отправить анкету и документы на проверку
router.post('/verification', asPsychologist, async (req, res) => {
  res.status(201).json(await verificationService.submit(req.user));
});

// POST /api/profile/documents (multipart: file, type, institution, specialty, year) – до 20 МБ
router.post('/documents', asPsychologist, uploadFile(20), async (req, res) => {
  res.status(201).json(await verificationService.uploadDocument(req.user, req.file, req.body || {}));
});

router.delete('/documents/:id', asPsychologist, async (req, res) => {
  await verificationService.deleteDocument(req.user, Number(req.params.id));
  res.status(204).end();
});

// GET /api/profile/documents/:id/file – свой скан
router.get('/documents/:id/file', asPsychologist, async (req, res) => {
  sendStoredFile(res, await verificationService.getDocumentFile(req.user, Number(req.params.id)));
});

module.exports = router;
