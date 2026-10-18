// /api/appointments – записи на консультации клиента и психолога.
const { Router } = require('express');
const appointmentService = require('../services/appointment.service');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = Router();

// GET /api/appointments?scope=upcoming|past|cancelled|all&as=client|psychologist
router.get('/', requireAuth, async (req, res) => {
  res.json(await appointmentService.list(req.user, req.query));
});

// GET /api/appointments/:id – запись с историей статусов
router.get('/:id', requireAuth, async (req, res) => {
  res.json(await appointmentService.view(req.user, Number(req.params.id)));
});

// POST /api/appointments { slotId, format, note } – записаться
router.post('/', requirePermission('appointments.book'), async (req, res) => {
  res.status(201).json(await appointmentService.book(req.user, req.body));
});

// PATCH /api/appointments/:id { status: 'cancelled', reason } | { status: 'completed' | 'no_show' }
router.patch('/:id', requirePermission('appointments.manage_own'), async (req, res) => {
  res.json(await appointmentService.changeStatus(req.user, Number(req.params.id), req.body));
});

// POST /api/appointments/:id/reschedule { slotId, reason } – перенести
router.post('/:id/reschedule', requirePermission('appointments.manage_own'), async (req, res) => {
  res.status(201).json(await appointmentService.reschedule(req.user, Number(req.params.id), req.body));
});

module.exports = router;
