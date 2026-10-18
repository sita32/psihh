// /api/admin – панель модератора: пользователи, заявки психологов, отзывы и жалобы,
// роли и права, журнал действий. Каждый раздел – под своим правом из role_permissions.
const { Router } = require('express');
const moderationService = require('../services/moderation.service');
const reviewService = require('../services/review.service');
const verificationService = require('../services/verification.service');
const accessService = require('../services/access.service');
const { requirePermission } = require('../middleware/auth');
const { sendStoredFile } = require('./send-file');

const router = Router();
const id = (req) => Number(req.params.id);

// ---------- Пользователи ----------

// GET /api/admin/users?q=&role=&status=&page=&limit=
router.get('/users', requirePermission('users.view'), async (req, res) => {
  res.json(await moderationService.listUsers(req.query));
});

// GET /api/admin/users/:id – карточка: профиль, записи, история блокировок
router.get('/users/:id', requirePermission('users.view'), async (req, res) => {
  res.json(await moderationService.getUser(id(req)));
});

// PATCH /api/admin/users/:id – правка профиля (поля – как в PATCH /api/profile)
router.patch('/users/:id', requirePermission('users.edit'), async (req, res) => {
  res.json(await moderationService.updateUser(req.user, id(req), req.body, req.ip));
});

// POST /api/admin/users/:id/block { reason, until? }
router.post('/users/:id/block', requirePermission('users.block'), async (req, res) => {
  res.json(await moderationService.blockUser(req.user, id(req), req.body, req.ip));
});

router.post('/users/:id/unblock', requirePermission('users.block'), async (req, res) => {
  res.json(await moderationService.unblockUser(req.user, id(req), req.ip));
});

// PUT /api/admin/users/:id/roles { roles: ['client', 'psychologist'] }
router.put('/users/:id/roles', requirePermission('roles.assign'), async (req, res) => {
  res.json(await moderationService.setRoles(req.user, id(req), req.body, req.ip));
});

// ---------- Роли и права ----------

// GET /api/admin/roles – роли с правами и список всех прав
router.get('/roles', requirePermission('roles.assign'), async (req, res) => {
  res.json(await accessService.getRolesOverview());
});

// PUT /api/admin/roles/:code/permissions { permissions: [коды] }
router.put('/roles/:code/permissions', requirePermission('roles.assign'), async (req, res) => {
  res.json(await moderationService.setRolePermissions(req.user, req.params.code, req.body, req.ip));
});

// ---------- Заявки психологов ----------

// GET /api/admin/verification-requests?status=pending
router.get('/verification-requests', requirePermission('psychologists.verify'), async (req, res) => {
  res.json(await verificationService.listRequests(req.query));
});

// PATCH /api/admin/verification-requests/:id { status: 'approved' | 'rejected', comment }
router.patch('/verification-requests/:id', requirePermission('psychologists.verify'), async (req, res) => {
  res.json(await verificationService.decide(req.user, id(req), req.body, req.ip));
});

// GET /api/admin/documents/:id/file – скан документа
router.get('/documents/:id/file', requirePermission('psychologists.verify'), async (req, res) => {
  sendStoredFile(res, await verificationService.getDocumentFile(req.user, id(req)));
});

// ---------- Отзывы и жалобы ----------

// GET /api/admin/reviews?status=pending
router.get('/reviews', requirePermission('reviews.moderate'), async (req, res) => {
  res.json(await reviewService.listForModeration(req.query));
});

// PATCH /api/admin/reviews/:id { status: 'approved' | 'rejected', comment }
router.patch('/reviews/:id', requirePermission('reviews.moderate'), async (req, res) => {
  res.json(await reviewService.moderate(req.user, id(req), req.body, req.ip));
});

// GET /api/admin/review-reports?status=pending
router.get('/review-reports', requirePermission('reviews.moderate'), async (req, res) => {
  res.json(await reviewService.listReports(req.query));
});

// PATCH /api/admin/review-reports/:id { decision: 'hide' | 'keep', comment }
router.patch('/review-reports/:id', requirePermission('reviews.moderate'), async (req, res) => {
  res.json(await reviewService.resolveReport(req.user, id(req), req.body, req.ip));
});

// ---------- Журнал ----------

// GET /api/admin/audit?action=user.&actorId=&q=&page=
router.get('/audit', requirePermission('audit.view'), async (req, res) => {
  res.json(await moderationService.listAudit(req.query));
});

module.exports = router;
