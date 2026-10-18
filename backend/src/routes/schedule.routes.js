// /api/schedule – расписание психолога: свои окна для записи клиентов.
const { Router } = require('express');
const scheduleService = require('../services/schedule.service');
const { requirePermission } = require('../middleware/auth');

const router = Router();
router.use(requirePermission('schedule.manage'));

// GET /api/schedule/slots?from=2026-10-19&to=2026-10-25 – окна с записями клиентов
router.get('/slots', async (req, res) => {
  res.json(await scheduleService.getOwnSlots(req.user, req.query));
});

// POST /api/schedule/slots { slots: [{ date, time }], durationMin } – новые окна (пачкой)
router.post('/slots', async (req, res) => {
  res.status(201).json(await scheduleService.createSlots(req.user, req.body));
});

// PATCH /api/schedule/slots/:id { status: 'blocked' | 'free' } – закрыть или открыть окно
router.patch('/slots/:id', async (req, res) => {
  res.json(await scheduleService.setSlotStatus(req.user, Number(req.params.id), req.body));
});

// DELETE /api/schedule/slots/:id – удалить свободное или закрытое окно
router.delete('/slots/:id', async (req, res) => {
  await scheduleService.deleteSlot(req.user, Number(req.params.id));
  res.status(204).end();
});

// POST /api/schedule/block-day { date } – закрыть все свободные окна дня
router.post('/block-day', async (req, res) => {
  res.json(await scheduleService.blockDay(req.user, req.body));
});

module.exports = router;
