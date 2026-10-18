// Бизнес-логика проверки состояния: опрашивает хранилища и решает, здоров ли сервер.
const healthRepository = require('../repositories/health.repository');

const TIMEOUT_MS = 2000; // дольше ждать ответа хранилища нет смысла

// Выполняет проверку с ограничением по времени и замеряет задержку
async function check(fn) {
  const started = performance.now();
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`нет ответа за ${TIMEOUT_MS} мс`)), TIMEOUT_MS);
    });
    const details = await Promise.race([fn(), timeout]);
    return { status: 'ok', latencyMs: Math.round(performance.now() - started), ...details };
  } catch (err) {
    return { status: 'error', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function getHealth() {
  const [postgres, redis] = await Promise.all([
    check(async () => {
      await healthRepository.pingPostgres();
      return { tables: await healthRepository.countTables() };
    }),
    check(async () => {
      await healthRepository.pingRedis();
      return {};
    }),
  ]);

  const ok = postgres.status === 'ok' && redis.status === 'ok';
  return {
    status: ok ? 'ok' : 'degraded',
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
    services: { postgres, redis },
  };
}

module.exports = { getHealth };
