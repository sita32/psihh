// Проверка и приведение данных из запросов. Ошибки копятся в fields: { поле: 'что не так' },
// потом одна ошибка 422 со всеми полями сразу – форма подсветит их разом.
const { HttpError } = require('../errors');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/; // то же правило, что CHECK в БД

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// Список из строки запроса: ?topic=a,b или ?topic=a&topic=b
const list = (value) => [].concat(value ?? [])
  .flatMap((v) => String(v).split(','))
  .map((v) => v.trim())
  .filter(Boolean);

function isIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

// Сегодняшняя дата в часовом поясе сайта: 'ГГГГ-ММ-ДД'
function todayIn(timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

// Целое число из строки запроса в пределах [min, max]; пустое – undefined
function intParam(value, field, { min, max }, fields) {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    fields[field] = `Целое число от ${min} до ${max}`;
    return undefined;
  }
  return n;
}

// Необязательная строка до max символов: '' или null → null (очистить поле)
function optionalText(value, field, max, fields) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') { fields[field] = 'Ожидается текст'; return undefined; }
  const v = value.trim();
  if (v.length > max) { fields[field] = `Не длиннее ${max} символов`; return undefined; }
  return v || null;
}

// Обязательная строка 1…max символов (если поле передано)
function requiredText(value, field, max, fields, message = 'Заполните поле') {
  if (value === undefined) return undefined;
  const v = text(value);
  if (!v) { fields[field] = message; return undefined; }
  if (v.length > max) { fields[field] = `Не длиннее ${max} символов`; return undefined; }
  return v;
}

function throwIfInvalid(fields) {
  if (Object.keys(fields).length) throw new HttpError(422, 'Проверьте поля формы', { fields });
}

module.exports = {
  PHONE_RE, text, list, isIsoDate, todayIn, intParam, optionalText, requiredText, throwIfInvalid,
};
