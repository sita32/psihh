// Приложение Express: промежуточные обработчики и маршруты.
// Отдельно от server.js, чтобы в тестах (supertest) запускать без открытия порта.
const express = require('express');
const requestLogger = require('./middleware/request-logger');
const { notFound, errorHandler } = require('./middleware/error-handler');
const routes = require('./routes');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // перед сервером стоит nginx: настоящий IP клиента – в X-Forwarded-For

app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));

app.use('/api', routes);
app.use('/api', notFound);

app.use(errorHandler);

module.exports = app;
