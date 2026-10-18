// Настройки сервера из переменных окружения.
// В Docker их задаёт docker-compose.yml (значения – из .env в корне проекта),
// при запуске без Docker (npm run dev) – тот же .env через флаг --env-file-if-exists.

function int(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) throw new Error(`Переменная ${name} должна быть числом, получено: ${value}`);
  return n;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int('API_PORT', 3000),

  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: int('POSTGRES_PORT', 5432),
    database: process.env.POSTGRES_DB || 'ryadom',
    user: process.env.POSTGRES_USER || 'ryadom',
    password: process.env.POSTGRES_PASSWORD || '',
    max: int('POSTGRES_POOL_SIZE', 10), // соединений в пуле
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: int('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    keyPrefix: 'ryadom:', // все ключи с префиксом, см. database/redis.md
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || '',
    accessTtlSec: 15 * 60,              // access-токен (JWT) живёт 15 минут
    refreshTtlSec: 30 * 24 * 3600,      // сессия с «Запомнить меня» – 30 дней
    shortRefreshTtlSec: 24 * 3600,      // без «Запомнить меня» – сутки и до закрытия браузера
    bcryptRounds: int('BCRYPT_ROUNDS', 12),
    // Secure-cookie уходят только по HTTPS; локально сайт открыт по HTTP
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  },
};

// Без секрета любой мог бы подделать токен – в production сервер не запустится
if (!config.auth.jwtSecret) {
  if (config.env === 'production') throw new Error('Не задан JWT_SECRET (см. .env.example)');
  config.auth.jwtSecret = 'dev-only-secret';
  console.warn('[config] JWT_SECRET не задан – используется секрет для разработки');
}

module.exports = config;
