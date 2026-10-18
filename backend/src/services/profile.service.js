// Свой профиль: клиент – личные данные, психолог – профессиональная анкета
// (методы, темы, услуги с ценами, публикация в каталоге), удаление анкеты психолога.
const config = require('../config');
const { transaction } = require('../db/postgres');
const userRepository = require('../repositories/user.repository');
const psychologistRepository = require('../repositories/psychologist.repository');
const catalogCache = require('../repositories/catalog-cache.repository');
const referenceService = require('./reference.service');
const v = require('./validation');
const { HttpError } = require('../errors');

const GENDERS = ['female', 'male'];

// Роль, для которой ведётся профиль (у модератора профиля нет)
function profileRole(user) {
  if (user.roles.includes('psychologist')) return 'psychologist';
  if (user.roles.includes('client')) return 'client';
  throw new HttpError(404, 'У этой роли нет профиля');
}

// ---------- Чтение ----------

function clientView(row) {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    gender: row.gender,
    phone: row.phone,
    avatarUrl: row.avatar_key ? `/${row.avatar_key}` : null,
    about: row.about,
  };
}

function psychologistView(row) {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    middleName: row.middle_name,
    gender: row.gender,
    birthDate: row.birth_date,
    phone: row.phone,
    avatarUrl: row.avatar_key ? `/${row.avatar_key}` : null,
    headline: row.headline,
    bio: row.bio,
    approach: row.approach,
    practiceSince: row.practice_since,
    experienceYears: row.experience_years,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    isPublished: row.is_published,
    rating: Number(row.rating_avg),
    reviewsCount: row.reviews_count,
    methods: row.methods,
    topics: row.topics,
    services: row.services.map((s) => ({ ...s, price: Number(s.price) })),
    documents: row.documents,
  };
}

// { role, profile } – profile = null, если психолог удалил анкету и ещё не создал новую
async function getOwn(user) {
  const role = profileRole(user);
  if (role === 'client') {
    const row = await userRepository.findClientProfile(user.id);
    return { role, profile: row && clientView(row) };
  }
  const row = await psychologistRepository.findOwnProfile(user.id);
  return { role, profile: row && psychologistView(row) };
}

// ---------- Проверка полей ----------

function checkDate(value, field, { max, min = '1900-01-02', message }, fields) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!v.isIsoDate(value)) { fields[field] = 'Дата в формате ГГГГ-ММ-ДД'; return undefined; }
  if (value < min || value > max) { fields[field] = message; return undefined; }
  return value;
}

function checkPhone(value, fields) {
  if (value === undefined) return undefined;
  const phone = v.text(value ?? '').replace(/[\s()-]/g, ''); // «+375 (29) 123-45-67» → «+375291234567»
  if (!phone) return null;
  if (!v.PHONE_RE.test(phone)) { fields.phone = 'Телефон в формате +375291234567'; return undefined; }
  return phone;
}

function checkGender(value, fields, { required }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    if (required) fields.gender = 'Укажите пол';
    return required ? undefined : null;
  }
  if (!GENDERS.includes(value)) { fields.gender = 'female или male'; return undefined; }
  return value;
}

function checkCodes(value, field, known, fields) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) { fields[field] = 'Ожидается список кодов'; return undefined; }
  const codes = [...new Set(value.map(String))];
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length) { fields[field] = `Неизвестные коды: ${unknown.join(', ')}`; return undefined; }
  return codes;
}

function checkServices(value, knownFormats, fields) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) { fields.services = 'Ожидается список услуг'; return undefined; }
  const seen = new Set();
  const services = [];
  for (const s of value) {
    const price = Number(s && s.price);
    const durationMin = s && s.durationMin !== undefined ? Number(s.durationMin) : 50;
    if (!s || !knownFormats.has(s.format)) { fields.services = `Неизвестный формат: ${s && s.format}`; return undefined; }
    if (seen.has(s.format)) { fields.services = `Формат ${s.format} указан дважды`; return undefined; }
    if (!(price > 0 && price <= 10000)) { fields.services = 'Цена – от 1 до 10 000 BYN'; return undefined; }
    if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 240) {
      fields.services = 'Длительность – от 15 до 240 минут'; return undefined;
    }
    seen.add(s.format);
    services.push({ format: s.format, price: Math.round(price * 100) / 100, durationMin });
  }
  return services;
}

// ---------- Изменение ----------

async function updateClient(user, body) {
  const fields = {};
  const today = v.todayIn(config.timezone);
  const data = {
    firstName: v.requiredText(body.firstName, 'firstName', 64, fields, 'Укажите имя'),
    lastName: v.optionalText(body.lastName, 'lastName', 64, fields),
    birthDate: checkDate(body.birthDate, 'birthDate', { max: today, message: 'Проверьте дату рождения' }, fields),
    gender: checkGender(body.gender, fields, { required: false }),
    phone: checkPhone(body.phone, fields),
    about: v.optionalText(body.about, 'about', 2000, fields),
  };
  if (data.birthDate === today) fields.birthDate = 'Проверьте дату рождения';
  v.throwIfInvalid(fields);
  await userRepository.updateClientProfile(user.id, data);
}

async function updatePsychologist(user, body) {
  const fields = {};
  const today = v.todayIn(config.timezone);
  const codes = await referenceService.getCodes();
  const data = {
    firstName: v.requiredText(body.firstName, 'firstName', 64, fields, 'Укажите имя'),
    lastName: v.requiredText(body.lastName, 'lastName', 64, fields, 'Укажите фамилию'),
    middleName: v.optionalText(body.middleName, 'middleName', 64, fields),
    gender: checkGender(body.gender, fields, { required: true }),
    birthDate: checkDate(body.birthDate, 'birthDate', { max: today, message: 'Проверьте дату рождения' }, fields),
    phone: checkPhone(body.phone, fields),
    headline: v.optionalText(body.headline, 'headline', 160, fields),
    bio: v.optionalText(body.bio, 'bio', 3000, fields),
    approach: v.optionalText(body.approach, 'approach', 3000, fields),
    practiceSince: checkDate(body.practiceSince, 'practiceSince',
      { min: '1950-01-01', max: today, message: 'Дата начала практики не может быть в будущем' }, fields),
    isPublished: undefined,
  };
  if (data.practiceSince === null) fields.practiceSince = 'Укажите дату начала практики';
  if (body.isPublished !== undefined) {
    if (typeof body.isPublished !== 'boolean') fields.isPublished = 'true или false';
    else data.isPublished = body.isPublished;
  }
  const methods = checkCodes(body.methods, 'methods', codes.methods, fields);
  const topics = checkCodes(body.topics, 'topics', codes.topics, fields);
  const services = checkServices(body.services, codes.formats, fields);

  const current = await psychologistRepository.findOwnProfile(user.id);
  if (!current) {
    // Анкеты нет (удалена) – создаём заново, для этого нужны обязательные поля
    for (const [key, label] of [['firstName', 'имя'], ['lastName', 'фамилию'], ['gender', 'пол'], ['practiceSince', 'дату начала практики']]) {
      if (data[key] === undefined && !fields[key]) fields[key] = `Укажите ${label}`;
    }
  }
  v.throwIfInvalid(fields);

  // Опубликовать в каталоге можно только после проверки документов (то же правило – CHECK в БД)
  const status = current ? current.verification_status : 'draft';
  if (data.isPublished && status !== 'verified') {
    throw new HttpError(409, 'Анкету можно опубликовать после проверки документов модератором', { code: 'NOT_VERIFIED' });
  }

  await transaction(async (db) => {
    if (!current) await psychologistRepository.createProfile(user.id, data, db);
    await psychologistRepository.updateProfile(user.id, data, db);
    if (methods) await psychologistRepository.replaceMethods(user.id, methods, db);
    if (topics) await psychologistRepository.replaceTopics(user.id, topics, db);
    if (services) await psychologistRepository.replaceServices(user.id, services, db);
  });
  await catalogCache.invalidate(); // карточка в каталоге изменилась
}

// Частичное обновление: меняются только переданные поля
async function updateOwn(user, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Ожидается JSON-объект');
  if (profileRole(user) === 'client') await updateClient(user, body);
  else await updatePsychologist(user, body);
  return getOwn(user);
}

// Удаление анкеты психолога. Аккаунт остаётся – анкету можно заполнить заново.
// С историей консультаций удалить нельзя (записи и цены в них должны сохраниться) – только скрыть.
async function deleteOwn(user) {
  if (profileRole(user) !== 'psychologist') throw new HttpError(403, 'Удалить можно только анкету психолога');
  const current = await psychologistRepository.findOwnProfile(user.id);
  if (!current) throw new HttpError(404, 'Анкета уже удалена');

  const { total, upcoming } = await psychologistRepository.countAppointments(user.id);
  if (upcoming) {
    throw new HttpError(409, `Сначала отмените предстоящие записи (${upcoming})`, { code: 'HAS_UPCOMING_APPOINTMENTS' });
  }
  if (total) {
    throw new HttpError(409, 'По анкете есть история консультаций – её нельзя удалить, но можно скрыть из каталога',
      { code: 'HAS_APPOINTMENTS' });
  }
  await psychologistRepository.deleteProfile(user.id);
  await catalogCache.invalidate();
}

module.exports = { getOwn, updateOwn, deleteOwn };
