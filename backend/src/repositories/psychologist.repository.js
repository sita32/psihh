// Психологи: каталог (представление v_psychologist_catalog), анкета, методы, темы, услуги,
// документы об образовании, свободные окна расписания.
const { pool } = require('../db/postgres');

// Методы, темы и форматы психолога – массивами { code, name } (для карточки и анкеты)
const REFERENCES_SQL = `
  coalesce((SELECT json_agg(json_build_object('code', m.code, 'name', m.name) ORDER BY m.id)
              FROM psychologist_methods pm JOIN methods m ON m.id = pm.method_id
             WHERE pm.psychologist_id = p.user_id), '[]') AS methods,
  coalesce((SELECT json_agg(json_build_object('code', t.code, 'name', t.name) ORDER BY t.id)
              FROM psychologist_topics pt JOIN topics t ON t.id = pt.topic_id
             WHERE pt.psychologist_id = p.user_id), '[]') AS topics,
  coalesce((SELECT json_agg(json_build_object('code', f.code, 'name', f.name, 'price', s.price,
                                              'durationMin', s.duration_min) ORDER BY f.id)
              FROM psychologist_services s JOIN session_formats f ON f.id = s.format_id
             WHERE s.psychologist_id = p.user_id AND s.is_active), '[]') AS services`;

// Экранирование % и _ для поиска через ILIKE
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Поиск по каталогу.
 * f: { q, topics[], methods[], formats[], gender, expMin, expMax, priceMax,
 *      date ('ГГГГ-ММ-ДД'), times ['10:00'], parts ['morning'|'day'|'evening'], sort, limit, offset, timezone }
 * next_slot – ближайшее свободное окно, подходящее под фильтр по дню и времени.
 */
async function search(f, db = pool) {
  const params = [];
  const param = (value) => `$${params.push(value)}`;
  const where = [];
  const slotWhere = [];

  if (f.q) {
    // Ищем по имени, подписи, описанию, методам и темам
    where.push(`concat_ws(' ', c.first_name, c.last_name, c.headline, p.bio,
                          array_to_string(c.methods, ' '), array_to_string(c.topics, ' ')) ILIKE ${param(`%${likeEscape(f.q)}%`)}`);
  }
  if (f.topics.length) {
    where.push(`EXISTS (SELECT 1 FROM psychologist_topics pt JOIN topics t ON t.id = pt.topic_id
                         WHERE pt.psychologist_id = c.psychologist_id AND t.code = ANY (${param(f.topics)}))`);
  }
  if (f.methods.length) {
    where.push(`EXISTS (SELECT 1 FROM psychologist_methods pm JOIN methods m ON m.id = pm.method_id
                         WHERE pm.psychologist_id = c.psychologist_id AND m.code = ANY (${param(f.methods)}))`);
  }
  if (f.formats.length) {
    // Все выбранные форматы сразу (например, и индивидуальная, и парная)
    const codes = param(f.formats);
    where.push(`(SELECT count(DISTINCT sf.code) FROM psychologist_services s JOIN session_formats sf ON sf.id = s.format_id
                  WHERE s.psychologist_id = c.psychologist_id AND s.is_active AND sf.code = ANY (${codes}))
                = cardinality(${codes}::text[])`);
  }
  if (f.gender) where.push(`c.gender = ${param(f.gender)}`);
  if (f.expMin !== undefined) where.push(`c.experience_years >= ${param(f.expMin)}`);
  if (f.expMax !== undefined) where.push(`c.experience_years <= ${param(f.expMax)}`);
  if (f.priceMax !== undefined) where.push(`c.price_from <= ${param(f.priceMax)}`);

  // Фильтр по дню и времени – по свободным окнам в часовом поясе сайта
  let tz;
  const local = () => `(sl.starts_at AT TIME ZONE ${(tz ??= param(f.timezone))})`;
  const minutes = () => `(extract(hour FROM ${local()}) * 60 + extract(minute FROM ${local()}))`;
  if (f.date) slotWhere.push(`${local()}::date = ${param(f.date)}::date`);
  if (f.times.length) slotWhere.push(`to_char(${local()}, 'HH24:MI') = ANY (${param(f.times)})`);
  if (f.parts.length) {
    const RANGES = { morning: [0, 720], day: [720, 1020], evening: [1020, 1440] };
    slotWhere.push(`(${f.parts.map((part) => `${minutes()} >= ${RANGES[part][0]} AND ${minutes()} < ${RANGES[part][1]}`).join(' OR ')})`);
  }
  if (slotWhere.length) where.push('ns.starts_at IS NOT NULL');

  const ORDER = {
    rating: 'c.rating_avg DESC, c.reviews_count DESC',
    soon: 'ns.starts_at ASC NULLS LAST, c.rating_avg DESC',
    cheap: 'c.price_from ASC',
    expensive: 'c.price_from DESC',
    exp: 'c.experience_years DESC',
  };

  const { rows } = await db.query(
    `SELECT c.psychologist_id AS id, c.first_name, c.last_name, c.gender, c.avatar_key, c.headline,
            c.experience_years, c.rating_avg, c.reviews_count, c.price_from,
            EXTRACT(YEAR FROM age(p.birth_date))::int AS age,
            ns.starts_at AS next_slot,
            ${REFERENCES_SQL},
            count(*) OVER () AS total
       FROM v_psychologist_catalog c
       JOIN psychologist_profiles p ON p.user_id = c.psychologist_id
       LEFT JOIN LATERAL (
            SELECT sl.starts_at FROM schedule_slots sl
             WHERE sl.psychologist_id = c.psychologist_id AND sl.status = 'free' AND sl.starts_at > now()
                   ${slotWhere.map((w) => `AND ${w}`).join(' ')}
             ORDER BY sl.starts_at LIMIT 1) ns ON true
      ${where.length ? `WHERE ${where.join('\n        AND ')}` : ''}
      ORDER BY ${ORDER[f.sort]}, c.psychologist_id
      LIMIT ${param(f.limit)} OFFSET ${param(f.offset)}`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

// Психолог из каталога (подтверждён, опубликован, не заблокирован) – для страницы профиля
async function findPublicById(id, db = pool) {
  const { rows } = await db.query(
    `SELECT c.psychologist_id AS id, c.first_name, c.last_name, c.gender, c.avatar_key, c.headline,
            c.experience_years, c.rating_avg, c.reviews_count, c.price_from, c.nearest_slot,
            p.middle_name, p.bio, p.approach, p.practice_since, p.verified_at,
            EXTRACT(YEAR FROM age(p.birth_date))::int AS age,
            ${REFERENCES_SQL},
            coalesce((SELECT json_agg(json_build_object('type', d.doc_type, 'institution', d.institution,
                                                        'specialty', d.specialty, 'year', d.issued_year)
                                      ORDER BY d.doc_type, d.issued_year)
                        FROM documents d
                       WHERE d.psychologist_id = p.user_id AND d.status = 'approved'), '[]') AS education
       FROM v_psychologist_catalog c
       JOIN psychologist_profiles p ON p.user_id = c.psychologist_id
      WHERE c.psychologist_id = $1`,
    [id],
  );
  return rows[0] || null;
}

// Все психологи каталога с данными для подбора по анкете
async function findForMatching(db = pool) {
  const { rows } = await db.query(
    `SELECT c.psychologist_id AS id, c.first_name, c.last_name, c.gender, c.avatar_key, c.headline,
            c.experience_years, c.rating_avg, c.reviews_count, c.price_from,
            EXTRACT(YEAR FROM age(p.birth_date))::int AS age,
            ${REFERENCES_SQL}
       FROM v_psychologist_catalog c
       JOIN psychologist_profiles p ON p.user_id = c.psychologist_id`,
  );
  return rows;
}

// Свободные окна психологов в промежутке [from, to)
async function findFreeSlots(psychologistIds, from, to, db = pool) {
  const { rows } = await db.query(
    `SELECT psychologist_id, starts_at
       FROM schedule_slots
      WHERE psychologist_id = ANY ($1) AND status = 'free'
        AND starts_at > greatest(now(), $2) AND starts_at < $3
      ORDER BY starts_at`,
    [psychologistIds, from, to],
  );
  return rows;
}

// ---------- Своя анкета психолога ----------

async function findOwnProfile(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT p.user_id AS id, p.first_name, p.last_name, p.middle_name, p.gender, p.birth_date, p.phone,
            p.avatar_key, p.headline, p.bio, p.approach, p.practice_since, p.verification_status,
            p.verified_at, p.is_published, p.rating_avg, p.reviews_count,
            EXTRACT(YEAR FROM age(CURRENT_DATE, p.practice_since))::int AS experience_years,
            ${REFERENCES_SQL},
            coalesce((SELECT json_agg(json_build_object('id', d.id, 'type', d.doc_type, 'institution', d.institution,
                                                        'specialty', d.specialty, 'year', d.issued_year,
                                                        'fileName', d.original_name, 'status', d.status,
                                                        'comment', d.review_comment) ORDER BY d.uploaded_at)
                        FROM documents d WHERE d.psychologist_id = p.user_id), '[]') AS documents
       FROM psychologist_profiles p
      WHERE p.user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

// Колонки анкеты, которые психолог правит сам
const PROFILE_COLUMNS = {
  firstName: 'first_name', lastName: 'last_name', middleName: 'middle_name', gender: 'gender',
  birthDate: 'birth_date', phone: 'phone', headline: 'headline', bio: 'bio', approach: 'approach',
  practiceSince: 'practice_since', isPublished: 'is_published',
};

async function createProfile(userId, data, db = pool) {
  await db.query(
    `INSERT INTO psychologist_profiles (user_id, first_name, last_name, gender, practice_since)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, data.firstName, data.lastName, data.gender, data.practiceSince],
  );
}

// Обновить только переданные поля
async function updateProfile(userId, data, db = pool) {
  const keys = Object.keys(PROFILE_COLUMNS).filter((k) => data[k] !== undefined);
  if (!keys.length) return;
  await db.query(
    `UPDATE psychologist_profiles
        SET ${keys.map((k, i) => `${PROFILE_COLUMNS[k]} = $${i + 2}`).join(', ')}
      WHERE user_id = $1`,
    [userId, ...keys.map((k) => data[k])],
  );
}

async function setAvatar(userId, key, db = pool) {
  await db.query('UPDATE psychologist_profiles SET avatar_key = $2 WHERE user_id = $1', [userId, key]);
}

// Заменить набор методов; возвращает число неизвестных кодов
async function replaceMethods(userId, codes, db = pool) {
  await db.query('DELETE FROM psychologist_methods WHERE psychologist_id = $1', [userId]);
  const { rowCount } = await db.query(
    `INSERT INTO psychologist_methods (psychologist_id, method_id)
     SELECT $1, id FROM methods WHERE code = ANY ($2)`,
    [userId, codes],
  );
  return codes.length - rowCount;
}

async function replaceTopics(userId, codes, db = pool) {
  await db.query('DELETE FROM psychologist_topics WHERE psychologist_id = $1', [userId]);
  const { rowCount } = await db.query(
    `INSERT INTO psychologist_topics (psychologist_id, topic_id)
     SELECT $1, id FROM topics WHERE code = ANY ($2)`,
    [userId, codes],
  );
  return codes.length - rowCount;
}

// Услуги: переданные форматы – активны с новой ценой, остальные выключаются.
// Удалять нельзя: на услугу ссылаются прошлые записи (цена в них сохранена отдельно)
async function replaceServices(userId, services, db = pool) {
  await db.query('UPDATE psychologist_services SET is_active = false WHERE psychologist_id = $1', [userId]);
  let saved = 0;
  for (const s of services) {
    const { rowCount } = await db.query(
      `INSERT INTO psychologist_services (psychologist_id, format_id, price, duration_min)
       SELECT $1, id, $3, $4 FROM session_formats WHERE code = $2
       ON CONFLICT (psychologist_id, format_id)
       DO UPDATE SET price = EXCLUDED.price, duration_min = EXCLUDED.duration_min, is_active = true`,
      [userId, s.format, s.price, s.durationMin],
    );
    saved += rowCount;
  }
  return services.length - saved;
}

// Записи психолога: всего и предстоящих (перед удалением анкеты)
async function countAppointments(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE a.status = 'scheduled' AND sl.starts_at > now())::int AS upcoming
       FROM appointments a JOIN schedule_slots sl ON sl.id = a.slot_id
      WHERE a.psychologist_id = $1`,
    [userId],
  );
  return rows[0];
}

// Удаление анкеты: методы, темы, услуги, документы и окна удаляются каскадом
async function deleteProfile(userId, db = pool) {
  await db.query('DELETE FROM psychologist_profiles WHERE user_id = $1', [userId]);
}

module.exports = {
  search,
  findPublicById,
  findForMatching,
  findFreeSlots,
  findOwnProfile,
  createProfile,
  updateProfile,
  setAvatar,
  replaceMethods,
  replaceTopics,
  replaceServices,
  countAppointments,
  deleteProfile,
};
