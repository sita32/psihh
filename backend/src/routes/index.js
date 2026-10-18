// Все маршруты API. Каждый модуль подключается своим префиксом.
const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const roleRoutes = require('./role.routes');
const referenceRoutes = require('./reference.routes');
const psychologistRoutes = require('./psychologist.routes');
const profileRoutes = require('./profile.routes');
const matchingRoutes = require('./matching.routes');
const scheduleRoutes = require('./schedule.routes');
const appointmentRoutes = require('./appointment.routes');
const conversationRoutes = require('./conversation.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/roles', roleRoutes);
router.use('/references', referenceRoutes);
router.use('/psychologists', psychologistRoutes);
router.use('/profile', profileRoutes);
router.use('/matching', matchingRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/conversations', conversationRoutes);

module.exports = router;
