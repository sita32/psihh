// Подбор психолога по анкете (quiz.html): кто подходит полностью, а если никто –
// ближайшие варианты (формат и тема обязательны, остальным можно уступить).
// Правила те же, что были в демо на странице, теперь по данным из БД.
const config = require('../config');
const psychologistRepository = require('../repositories/psychologist.repository');
const { toCard } = require('./psychologist-view');
const v = require('./validation');
const { HttpError } = require('../errors');

const LOOK_AHEAD_DAYS = 30;  // окна ищем на месяц вперёд
const SOON_DAYS = 2;         // «нужно скоро» – окно не позже чем послезавтра
const RESULTS = 3;           // сколько психологов показать
const PARTS = { morning: [0, 720], day: [720, 1020], evening: [1020, 1440] };

// Дата (ГГГГ-ММ-ДД) и минута суток по часовому поясу сайта
const localFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function local(date) {
  const p = Object.fromEntries(localFormat.formatToParts(date).map(({ type, value }) => [type, value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Ответы анкеты: коды из справочников (format, topics, method), gender, age, parts, soon
function parseAnswers(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Ожидается JSON-объект');
  const fields = {};
  const a = {
    format: v.text(body.format),
    topics: Array.isArray(body.topics) ? body.topics.map(String) : [],
    gender: v.text(body.gender),
    age: v.text(body.age),
    method: v.text(body.method),
    parts: Array.isArray(body.parts) ? body.parts.map(String) : [],
    soon: body.soon === true,
  };
  if (a.gender && !['female', 'male'].includes(a.gender)) fields.gender = 'female, male или пусто';
  if (a.age && !['young', 'older'].includes(a.age)) fields.age = 'young (до 35), older (старше 35) или пусто';
  if (a.parts.some((p) => !PARTS[p])) fields.parts = 'morning, day, evening';
  v.throwIfInvalid(fields);
  return a;
}

// Ближайшее окно в выбранное время дня: { slot, days } или null
function nextFree(slots, parts, today) {
  const slot = slots.find((s) => !parts.length || parts.some((p) => s.minutes >= PARTS[p][0] && s.minutes < PARTS[p][1]));
  return slot ? { slot: slot.startsAt, days: daysBetween(today, slot.day) } : null;
}

// Какие условия психолог НЕ выполняет (пустой список – подходит полностью)
function misses(p, a) {
  const out = [];
  if (a.format && !p.formatCodes.includes(a.format)) out.push('format');
  if (a.topics.length && !p.topicCodes.some((t) => a.topics.includes(t))) out.push('topics');
  if (a.gender && p.gender !== a.gender) out.push('gender');
  if (a.age === 'young' && !(p.age < 35)) out.push('age');
  if (a.age === 'older' && !(p.age >= 35)) out.push('age');
  if (a.method && !p.methodCodes.includes(a.method)) out.push('method');
  if (a.parts.length && !p.free) out.push('time');
  if (a.soon && !(p.free && p.free.days <= SOON_DAYS)) out.push('soon');
  return out;
}

// Насколько хорошо подходит: совпавшие темы важнее всего, потом подход, рейтинг и близость окна
function score(p, a) {
  const hits = p.topicCodes.filter((t) => a.topics.includes(t)).length;
  const soon = p.free ? Math.max(0, 4 - p.free.days) : 0;
  return hits * 10 + (a.method && p.methodCodes.includes(a.method) ? 4 : 0) + Number(p.row.rating_avg) + soon * 0.5;
}

async function match(body) {
  const a = parseAnswers(body);
  const rows = await psychologistRepository.findForMatching();
  const now = new Date();
  const today = local(now).day;
  const slots = rows.length
    ? await psychologistRepository.findFreeSlots(rows.map((r) => r.id), now,
      new Date(now.getTime() + LOOK_AHEAD_DAYS * 86400000))
    : [];

  const candidates = rows.map((row) => {
    const own = slots.filter((s) => s.psychologist_id === row.id).map((s) => ({ startsAt: s.starts_at, ...local(s.starts_at) }));
    const p = {
      row,
      gender: row.gender,
      age: row.age,
      topicCodes: row.topics.map((t) => t.code),
      methodCodes: row.methods.map((m) => m.code),
      formatCodes: row.services.map((s) => s.code),
      free: nextFree(own, a.parts, today),
      anyFree: nextFree(own, [], today),
    };
    p.miss = misses(p, a);
    p.score = score(p, a);
    return p;
  });

  const exact = candidates.filter((p) => !p.miss.length).sort((x, y) => y.score - x.score);
  const closest = candidates
    .filter((p) => p.miss.length && !p.miss.includes('format') && !p.miss.includes('topics'))
    .sort((x, y) => x.miss.length - y.miss.length || y.score - x.score);
  const shown = exact.length ? exact : closest;

  return {
    total: exact.length,        // сколько подходит полностью («Подходят 5 психологов»)
    exact: exact.length > 0,    // false – показаны близкие варианты
    results: shown.slice(0, RESULTS).map((p) => ({
      ...toCard(p.row),
      nextSlot: (p.free || p.anyFree || {}).slot || null,
      match: {
        topics: p.row.topics.filter((t) => a.topics.includes(t.code)), // совпавшие темы
        method: Boolean(a.method) && p.methodCodes.includes(a.method),
        misses: p.miss,              // чем вариант не совпал: gender, age, method, time, soon
      },
    })),
  };
}

module.exports = { match };
