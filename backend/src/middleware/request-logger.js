// Журнал запросов: метод, адрес, статус и время ответа – после того как ответ отправлен.
// В тестах не пишется – иначе сотни строк заслоняют результаты.
const quiet = process.env.NODE_ENV === 'test';

function requestLogger(req, res, next) {
  if (quiet) return next();
  const started = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - started);
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms} мс`);
  });
  next();
}

module.exports = requestLogger;
