// Каталог психологов: разбор фильтров, поиск, кэш выдачи на 5 минут, страница психолога.
const crypto = require('node:crypto');
const config = require('../config');
const psychologistRepository = require('../repositories/psychologist.repository');
const catalogCache = require('../repositories/catalog-cache.repository');
const { toCard, toProfile } = require('./psychologist-view');
const { text, list, isIsoDate, todayIn, intParam, throwIfInvalid } = require('./validation');
const { HttpError } = require('../errors');

const CACHE_TTL_SEC = 5 * 60;
const FACET_DAYS = 14;   // лента «Когда удобно» – две недели
const SORTS = ['rating', 'soon', 'cheap', 'expensive', 'exp'];
const PARTS = ['morning', 'day', 'evening'];
const GENDERS = { female: 'female', male: 'male', f: 'female', m: 'male' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Фильтры из строки запроса:
 * q, topic, method, format (коды через запятую), gender, expMin, expMax, priceMax,
 * date (ГГГГ-ММ-ДД), time (10:00,12:30), part (morning,day,evening), sort, page, limit
 */
function parseFilters(query) {
  const fields = {};
  const f = {
    q: text(query.q).slice(0, 100),
    topics: list(query.topic),
    methods: list(query.method),
    formats: list(query.format),
    gender: undefined,
    expMin: intParam(query.expMin, 'expMin', { min: 0, max: 80 }, fields),
    expMax: intParam(query.expMax, 'expMax', { min: 0, max: 80 }, fields),
    priceMax: intParam(query.priceMax, 'priceMax', { min: 1, max: 100000 }, fields),
    date: undefined,
    times: list(query.time),
    parts: list(query.part),
    sort: query.sort || 'rating',
    timezone: config.timezone,
  };
  // «Тревога» должна находить «Тревожность»: длинное слово ищем по первым 5 буквам, как на сайте
  if (f.q.length > 5) f.q = f.q.slice(0, 5);

  if (query.gender && query.gender !== 'any') {
    f.gender = GENDERS[query.gender];
    if (!f.gender) fields.gender = 'female, male или any';
  }
  if (query.date) {
    if (!isIsoDate(query.date)) fields.date = 'Дата в формате ГГГГ-ММ-ДД';
    else if (query.date < todayIn(config.timezone)) fields.date = 'Дата уже прошла';
    else f.date = query.date;
  }
  if (f.times.some((t) => !TIME_RE.test(t))) fields.time = 'Время в формате ЧЧ:ММ';
  if (f.parts.some((p) => !PARTS.includes(p))) fields.part = `Одно из: ${PARTS.join(', ')}`;
  if (!SORTS.includes(f.sort)) fields.sort = `Одно из: ${SORTS.join(', ')}`;

  const page = intParam(query.page, 'page', { min: 1, max: 1000 }, fields) || 1;
  const limit = intParam(query.limit, 'limit', { min: 1, max: 50 }, fields) || 6;
  throwIfInvalid(fields);
  return { ...f, page, limit, offset: (page - 1) * limit };
}

async function search(query) {
  const filters = parseFilters(query);
  const hash = crypto.createHash('sha1').update(JSON.stringify(filters)).digest('hex');

  const cached = await catalogCache.get(hash);
  if (cached.value) return cached.value;

  const [{ rows, total }, facets] = await Promise.all([
    psychologistRepository.search(filters),
    psychologistRepository.facets(filters, { from: todayIn(config.timezone), days: FACET_DAYS }),
  ]);
  const result = {
    items: rows.map(toCard),
    total,
    page: filters.page,
    limit: filters.limit,
    pages: Math.ceil(total / filters.limit),
    facets, // подсказки к фильтрам: сколько психологов по методам, форматам, дням и времени
  };
  await catalogCache.set(cached.version, hash, result, CACHE_TTL_SEC);
  return result;
}

// Страница психолога – только тех, кто виден в каталоге
async function getPsychologist(id) {
  const row = Number.isSafeInteger(id) && id > 0 ? await psychologistRepository.findPublicById(id) : null;
  if (!row) throw new HttpError(404, 'Психолог не найден');
  return toProfile(row);
}

module.exports = { search, getPsychologist, parseFilters };
