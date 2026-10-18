// Журнал запросов: метод, адрес, статус и время ответа – после того как ответ отправлен.
function requestLogger(req, res, next) {
  const started = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - started);
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms} мс`);
  });
  next();
}

module.exports = requestLogger;
