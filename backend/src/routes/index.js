// Все маршруты API. Каждый модуль подключается своим префиксом.
const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const roleRoutes = require('./role.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/roles', roleRoutes);

module.exports = router;
