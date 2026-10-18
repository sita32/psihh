// Единая обработка ошибок: любой ответ с ошибкой имеет вид { error: { code, message, fields? } }.
const { HttpError } = require('../errors');

// Неизвестный адрес внутри /api – JSON, а не HTML-страница
function notFound(req, res, next) {
  next(new HttpError(404, `Маршрут не найден: ${req.method} ${req.originalUrl}`));
}

// Express 5 сам передаёт сюда ошибки из async-обработчиков
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Статус есть у HttpError и у ошибок Express (например, неверный JSON в теле – 400)
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;

  if (status >= 500) {
    // Подробности – только в лог сервера, клиенту – общее сообщение
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    return res.status(status).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }

  const code = err instanceof HttpError ? err.code : HttpError.codes[status] || 'ERROR';
  const fields = err instanceof HttpError ? err.fields : undefined;
  res.status(status).json({ error: { code, message: err.message, fields } });
}

module.exports = { notFound, errorHandler };
