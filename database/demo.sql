-- =====================================================================
--  Демо-данные для разработки и показа (те же люди, что в frontend/js/data.js).
--  Выполняется после seed.sql; в docker compose – автоматически при первом старте.
--  Пароль у всех аккаунтов: demo1234 (хеш bcrypt, 12 раундов).
--  Даты (регистрация, стаж, свободные окна) считаются от дня загрузки:
--  окна расписания – на 4 недели вперёд; обновить – docker compose down -v && docker compose up.
-- =====================================================================

BEGIN;

-- Психологи (id из data.js – колонка demo_id; по ней же считаются занятые окна, как в демо)
CREATE TEMP TABLE demo_psy (demo_id int, email citext, first_name text, last_name text, gender gender_type, age int, exp int,
    headline text, bio text, price numeric, rating numeric, reviews int, reg_days int, available_from int, work int[], slots text[],
    methods text[], topics text[], formats text[], institution text, specialty text, edu_year int) ON COMMIT DROP;
INSERT INTO demo_psy VALUES
    (1, 'marina@ryadom.by', 'Марина', 'Волкова', 'female', 34, 9,
     'Клинический психолог',
     'Помогаю справиться с тревогой и выгоранием. Вместе разбираемся, какие мысли и привычки мешают, и пробуем новые способы реагировать.',
     65, 4.9, 38, 120, 1, '{1,2,3,4,5}', '{09:00,10:00,12:30,15:00,17:00,18:30}',
     '{"КПТ","Схема-терапия"}', '{"Тревожность","Выгорание","Самооценка","Панические атаки"}', '{"Индивидуальная"}',
     'БГУ', 'психология', 2015),
    (2, 'a.lukashevich@ryadom.by', 'Андрей', 'Лукашевич', 'male', 34, 8,
     'Психолог',
     'Работаю с жизненными кризисами и потерями. Помогаю увидеть повторяющиеся сценарии и найти опору в себе.',
     90, 4.8, 61, 200, 3, '{2,4,6}', '{11:00,13:00,15:30,17:00,19:30}',
     '{"Психоанализ"}', '{"Кризис","Отношения","Утрата","Апатия"}', '{"Индивидуальная"}',
     'БГПУ им. Танка', 'психология', 2014),
    (3, 'o.ermak@ryadom.by', 'Ольга', 'Ермак', 'female', 37, 11,
     'Семейный психолог',
     'Помогаю парам и семьям договариваться. Работаю с конфликтами, ревностью и периодом после рождения ребёнка.',
     80, 4.9, 54, 180, 0, '{1,2,3,4,5,6}', '{10:00,14:00,16:00,18:00,20:00}',
     '{"Системная семейная","КПТ"}', '{"Отношения","Кризис","Стресс"}', '{"Индивидуальная","Парная","С ребёнком"}',
     'БГУ', 'психология', 2011),
    (4, 'i.kovalchuk@ryadom.by', 'Илья', 'Ковальчук', 'male', 27, 4,
     'Психолог, КПТ-терапевт',
     'Помогаю перестать откладывать важное и справляться со стрессом на работе и учёбе. Даю понятные упражнения между встречами.',
     50, 4.7, 19, 151, 0, '{1,3,5,6,0}', '{08:30,12:00,14:30,18:00,21:00}',
     '{"КПТ","ACT"}', '{"Прокрастинация","Стресс","Тревожность"}', '{"Индивидуальная"}',
     'ГрГУ им. Купалы', 'психология', 2020),
    (5, 'd.mironova@ryadom.by', 'Дарья', 'Миронова', 'female', 29, 5,
     'Психолог',
     'Работаю с самооценкой и ощущением, что «со мной что-то не так». Бережно, в своём темпе.',
     60, 5, 23, 151, 2, '{1,2,4,5}', '{10:30,13:00,15:00,17:30,19:00}',
     '{"Гештальт"}', '{"Самооценка","Апатия","Отношения"}', '{"Индивидуальная"}',
     'БГУ', 'психология', 2016),
    (6, 'd.sokolov@ryadom.by', 'Дмитрий', 'Соколов', 'male', 41, 12,
     'Гештальт-терапевт',
     'Помогаю пережить расставание и потерю, разобраться в отношениях. Работаю с парами.',
     80, 4.8, 52, 151, 2, '{1,3,5}', '{09:00,11:30,13:30,17:00,19:00}',
     '{"Гештальт"}', '{"Отношения","Кризис","Утрата"}', '{"Индивидуальная","Парная"}',
     'МГППУ', 'клиническая психология', 2010),
    (7, 'a.kovaleva@ryadom.by', 'Алина', 'Ковалёва', 'female', 29, 5,
     'Психолог',
     'Помогаю вернуть энергию и интерес к жизни. Работаю с апатией, выгоранием и перфекционизмом.',
     50, 5, 17, 151, 0, '{1,2,3,4,5}', '{12:00,15:00,17:00,18:00,20:30}',
     '{"ACT","КПТ"}', '{"Прокрастинация","Стресс","Апатия","Выгорание"}', '{"Индивидуальная"}',
     'БГУ', 'психология', 2019),
    (8, 'n.belov@ryadom.by', 'Никита', 'Белов', 'male', 33, 7,
     'Психолог',
     'Специализируюсь на панических атаках и сильной тревоге. Использую EMDR и когнитивно-поведенческий подход.',
     70, 4.6, 28, 90, 1, '{2,3,4,6}', '{08:30,10:00,12:00,16:30,19:30}',
     '{"EMDR","КПТ"}', '{"Панические атаки","Тревожность","Стресс"}', '{"Индивидуальная"}',
     'БГПУ им. Танка', 'психология', 2014),
    (9, 'v.zhuk@ryadom.by', 'Вероника', 'Жук', 'female', 31, 7,
     'Детский и подростковый психолог',
     'Работаю с детьми от 7 лет и подростками вместе с родителями: школьная тревога, конфликты, самооценка.',
     75, 4.9, 44, 151, 4, '{1,2,3,4}', '{13:00,15:00,16:30,18:00}',
     '{"Системная семейная","ACT"}', '{"Тревожность","Самооценка","Стресс"}', '{"Индивидуальная","С ребёнком"}',
     'БГУ', 'психология', 2012),
    (10, 'a.savitsky@ryadom.by', 'Артём', 'Савицкий', 'male', 27, 3,
     'Психолог',
     'Работаю со студентами и молодыми специалистами: стресс, выбор, неуверенность в себе.',
     45, 4.7, 12, 151, 1, '{1,2,3,4,5,6,0}', '{11:00,18:00,19:00,20:00,21:00}',
     '{"КПТ"}', '{"Стресс","Прокрастинация","Самооценка"}', '{"Индивидуальная"}',
     'ВГУ им. Машерова', 'психология', 2021),
    (11, 'e.novik@ryadom.by', 'Екатерина', 'Новик', 'female', 45, 18,
     'Клинический психолог',
     'Работаю с глубокими темами: горе, повторяющиеся сценарии в отношениях, хроническая тревога.',
     110, 4.9, 87, 151, 5, '{2,4}', '{10:00,12:00,14:00,16:00}',
     '{"Схема-терапия","Психоанализ"}', '{"Утрата","Кризис","Тревожность","Отношения"}', '{"Индивидуальная","Парная"}',
     'БГУ', 'клиническая психология', 2004),
    (12, 'p.gordeeva@ryadom.by', 'Полина', 'Гордеева', 'female', 30, 6,
     'Психолог',
     'Помогаю руководителям и тем, кто много работает: выгорание, потеря смысла, кризис среднего возраста.',
     70, 4.8, 33, 151, 3, '{1,3,5,6}', '{07:30,09:00,12:30,18:30,20:00}',
     '{"Гештальт","ACT"}', '{"Выгорание","Кризис","Апатия"}', '{"Индивидуальная"}',
     'БГУ', 'психология', 2017);

-- Пользователи: клиенты, модератор и психологи
INSERT INTO users (email, password_hash, created_at, last_login_at)
VALUES ('anna@mail.com',       '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - interval '40 days',  now()),
       ('dk_1990@yandex.by',   '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - interval '60 days',  now() - interval '12 days'),
       ('moderator@ryadom.by', '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - interval '365 days', now())
UNION ALL
SELECT email, '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - make_interval(days => reg_days), now() - make_interval(days => demo_id % 3)
FROM demo_psy ORDER BY 1;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM (VALUES ('anna@mail.com', 'client'),
             ('dk_1990@yandex.by', 'client'),
             ('moderator@ryadom.by', 'moderator')) AS v(email, role)
JOIN users u ON u.email = v.email
JOIN roles r ON r.code = v.role
UNION ALL
SELECT u.id, r.id FROM demo_psy d JOIN users u ON u.email = d.email JOIN roles r ON r.code = 'psychologist';

-- Профили клиентов
INSERT INTO client_profiles (user_id, first_name, last_name, gender)
SELECT id, 'Анна', 'Петрова', 'female'::gender_type FROM users WHERE email = 'anna@mail.com'
UNION ALL
SELECT id, 'Дмитрий', 'К.', 'male'::gender_type FROM users WHERE email = 'dk_1990@yandex.by';

-- Анкеты психологов: документы проверены, анкета опубликована.
-- Рейтинг и число отзывов – как в демо (обычно их пересчитывает триггер по одобренным отзывам)
INSERT INTO psychologist_profiles (user_id, first_name, last_name, gender, birth_date, headline, bio, approach,
                                   practice_since, verification_status, verified_at, is_published,
                                   rating_avg, reviews_count)
SELECT u.id, d.first_name, d.last_name, d.gender,
       CURRENT_DATE - make_interval(years => d.age, months => 3),
       d.headline, d.bio,
       'Знакомимся: вы рассказываете, что беспокоит, я задаю уточняющие вопросы. '
       || 'Вместе формулируем цель – что должно измениться после терапии. '
       || 'Встречаемся раз в неделю, между встречами – небольшие задания по желанию.',
       CURRENT_DATE - make_interval(years => d.exp, months => 1),
       'verified', now() - make_interval(days => d.reg_days - 7), true,
       d.rating, d.reviews
FROM demo_psy d JOIN users u ON u.email = d.email;

UPDATE psychologist_profiles p
   SET avatar_key = 'assets/img/psychologists/p' || lpad(d.demo_id::text, 2, '0') || '.webp'
  FROM demo_psy d JOIN users u ON u.email = d.email
 WHERE p.user_id = u.id;

-- Методы и темы (по названиям из справочников seed.sql)
INSERT INTO psychologist_methods (psychologist_id, method_id)
SELECT u.id, m.id FROM demo_psy d JOIN users u ON u.email = d.email JOIN methods m ON m.name = ANY (d.methods);

INSERT INTO psychologist_topics (psychologist_id, topic_id)
SELECT u.id, t.id FROM demo_psy d JOIN users u ON u.email = d.email JOIN topics t ON t.name = ANY (d.topics);

-- Услуги: индивидуальная – цена из демо; парная – дороже и дольше; с ребёнком – по той же цене
INSERT INTO psychologist_services (psychologist_id, format_id, price, duration_min)
SELECT u.id, f.id,
       CASE f.code WHEN 'couple' THEN round(d.price * 1.4 / 5) * 5 ELSE d.price END,
       CASE f.code WHEN 'couple' THEN 80 ELSE 50 END
FROM demo_psy d JOIN users u ON u.email = d.email JOIN session_formats f ON f.name = ANY (d.formats);

-- Документы об образовании (проверены модератором): диплом и сертификат о повышении квалификации
INSERT INTO documents (psychologist_id, doc_type, institution, specialty, issued_year, file_key, original_name,
                       mime_type, size_bytes, status, reviewed_by, reviewed_at, uploaded_at)
SELECT u.id, v.doc_type, v.institution, v.specialty, v.year,
       'demo/documents/p' || lpad(d.demo_id::text, 2, '0') || '-' || v.doc_type || '.pdf',
       v.original_name, 'application/pdf', 1048576, 'approved', m.id,
       now() - make_interval(days => d.reg_days - 7), now() - make_interval(days => d.reg_days - 1)
FROM demo_psy d
JOIN users u ON u.email = d.email
JOIN users m ON m.email = 'moderator@ryadom.by'
CROSS JOIN LATERAL (VALUES
    ('diploma'::document_type, d.institution, d.specialty, d.edu_year, 'Диплом.pdf'),
    ('certificate'::document_type, 'Институт практической психологии',
     'Повышение квалификации: ' || d.methods[1], 2021, 'Сертификат.pdf')
) AS v(doc_type, institution, specialty, year, original_name);

-- Свободные окна на 4 недели вперёд (время – минское): рабочие дни и часы из демо,
-- часть окон «занята» по той же формуле, что в data.js, – их просто нет в списке свободных
INSERT INTO schedule_slots (psychologist_id, starts_at, ends_at)
SELECT u.id, x.starts_at, x.starts_at + interval '50 minutes'
FROM demo_psy d
JOIN users u ON u.email = d.email
CROSS JOIN generate_series(0, 27) AS k
CROSS JOIN LATERAL unnest(d.slots) WITH ORDINALITY AS t(hhmm, i)
CROSS JOIN LATERAL (SELECT ((CURRENT_DATE + k) + t.hhmm::time) AT TIME ZONE 'Europe/Minsk' AS starts_at) x
WHERE k >= d.available_from
  AND extract(dow FROM CURRENT_DATE + k)::int = ANY (d.work)
  AND (d.demo_id * 7 + k * 3 + (t.i - 1)) % 5 <> 0
  AND x.starts_at > now();

-- ---------------------------------------------------------------------
-- Записи на консультации (CLIENT_SESSIONS и PSY_SESSIONS из data.js)
-- ---------------------------------------------------------------------

-- Клиенты Марины Волковой
INSERT INTO users (email, password_hash, created_at, last_login_at)
SELECT v.email, '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - make_interval(days => v.reg), now() - make_interval(days => v.last)
FROM (VALUES ('pavel.m@gmail.com', 21, 1), ('olga.s@mail.ru', 3, 2), ('irina.l@mail.ru', 70, 1),
             ('maria.v@mail.ru', 30, 1), ('kirill.sh@gmail.com', 9, 1), ('dmitry.n@mail.ru', 14, 5)) AS v(email, reg, last);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.code = 'client'
WHERE u.email IN ('pavel.m@gmail.com', 'olga.s@mail.ru', 'irina.l@mail.ru', 'maria.v@mail.ru', 'kirill.sh@gmail.com', 'dmitry.n@mail.ru');

INSERT INTO client_profiles (user_id, first_name, last_name, gender)
SELECT u.id, v.first_name, v.last_name, v.gender::gender_type
FROM (VALUES ('pavel.m@gmail.com', 'Павел', 'Морозов', 'male'), ('olga.s@mail.ru', 'Ольга', 'Сидоренко', 'female'),
             ('irina.l@mail.ru', 'Ирина', NULL, 'female'), ('maria.v@mail.ru', 'Мария', NULL, 'female'),
             ('kirill.sh@gmail.com', 'Кирилл', 'Шевчук', 'male'), ('dmitry.n@mail.ru', 'Дмитрий', NULL, 'male')) AS v(email, first_name, last_name, gender)
JOIN users u ON u.email = v.email;

-- Момент времени по минскому времени: через k дней от сегодня в ЧЧ:ММ
CREATE FUNCTION pg_temp.demo_ts(k int, hhmm text) RETURNS timestamptz
LANGUAGE sql AS $$ SELECT ((CURRENT_DATE + k) + hhmm::time) AT TIME ZONE 'Europe/Minsk' $$;

-- k, hhmm – когда встреча; created_* – когда записались; changed_* – когда сменился статус и кем;
-- from_hhmm – с какого времени того же дня перенесли
CREATE TEMP TABLE demo_appt (client citext, psy citext, k int, hhmm text, status appointment_status, note text,
    created_k int, created_hhmm text, changed_k int, changed_hhmm text, changed_by text, reason text, from_hhmm text) ON COMMIT DROP;
INSERT INTO demo_appt VALUES
    -- Анна
    ('anna@mail.com', 'marina@ryadom.by', 1, '15:00', 'scheduled', 'Тревога перед новым проектом на работе, плохо сплю',
     -3, '18:20', -1, '10:15', 'client', 'Рабочее совещание', '12:30'),
    ('anna@mail.com', 'marina@ryadom.by', 8, '15:00', 'scheduled', NULL, -1, '10:40', NULL, NULL, NULL, NULL, NULL),
    ('anna@mail.com', 'i.kovalchuk@ryadom.by', 4, '18:00', 'scheduled', 'Хочу разобраться с прокрастинацией', 0, '09:05', NULL, NULL, NULL, NULL, NULL),
    ('anna@mail.com', 'marina@ryadom.by', -6, '12:30', 'completed', NULL, -10, '20:00', -6, '13:20', 'psychologist', NULL, NULL),
    ('anna@mail.com', 'marina@ryadom.by', -13, '12:30', 'completed', NULL, -16, '19:30', -13, '13:20', 'psychologist', NULL, NULL),
    ('anna@mail.com', 'd.sokolov@ryadom.by', -17, '19:00', 'completed', NULL, -20, '11:00', -17, '19:50', 'psychologist', NULL, NULL),
    ('anna@mail.com', 'i.kovalchuk@ryadom.by', -24, '18:00', 'no_show', NULL, -27, '08:40', -24, '18:20', 'psychologist', NULL, NULL),
    ('anna@mail.com', 'n.belov@ryadom.by', -2, '10:00', 'cancelled', NULL, -9, '21:10', -4, '08:00', 'client', 'Заболела, температура', NULL),
    ('anna@mail.com', 'a.lukashevich@ryadom.by', 5, '13:00', 'cancelled', NULL, -5, '16:00', -1, '09:30', 'psychologist',
     'Болезнь специалиста – предложу другое время в чате', NULL),
    -- Другие клиенты Марины
    ('olga.s@mail.ru', 'marina@ryadom.by', 3, '10:00', 'scheduled', 'Выгорание, не могу заставить себя работать уже месяц',
     -2, '22:05', NULL, NULL, NULL, NULL, NULL),
    ('irina.l@mail.ru', 'marina@ryadom.by', 4, '12:30', 'scheduled', NULL, -6, '12:10', NULL, NULL, NULL, NULL, NULL),
    ('pavel.m@gmail.com', 'marina@ryadom.by', 5, '18:30', 'scheduled', NULL, -4, '09:00', NULL, NULL, NULL, NULL, NULL),
    ('kirill.sh@gmail.com', 'marina@ryadom.by', 6, '09:00', 'scheduled', NULL, -1, '19:45', NULL, NULL, NULL, NULL, NULL),
    -- прошли, но психолог ещё не отметил, состоялись ли
    ('maria.v@mail.ru', 'marina@ryadom.by', -1, '17:00', 'scheduled', NULL, -8, '14:30', NULL, NULL, NULL, NULL, NULL),
    ('pavel.m@gmail.com', 'marina@ryadom.by', -2, '18:30', 'scheduled', NULL, -9, '10:00', NULL, NULL, NULL, NULL, NULL),
    ('irina.l@mail.ru', 'marina@ryadom.by', -3, '12:30', 'completed', NULL, -10, '11:00', -3, '13:25', 'psychologist', NULL, NULL),
    ('dmitry.n@mail.ru', 'marina@ryadom.by', -5, '10:00', 'no_show', NULL, -7, '08:40', -5, '10:20', 'psychologist', NULL, NULL),
    ('irina.l@mail.ru', 'marina@ryadom.by', 2, '15:00', 'cancelled', NULL, -5, '18:00', -1, '09:15', 'client',
     'Командировка, вернусь через неделю', NULL),
    ('maria.v@mail.ru', 'marina@ryadom.by', 5, '17:00', 'cancelled', NULL, -3, '16:00', 0, '08:30', 'psychologist',
     'Профессиональная конференция', NULL);

-- Прошедшие встречи триггеры записать не дадут («нельзя записаться на прошедшее время»),
-- поэтому на время загрузки демо они выключены, а слоты и история заполняются здесь же
ALTER TABLE appointments DISABLE TRIGGER trg_appointments_book;
ALTER TABLE appointments DISABLE TRIGGER trg_appointments_status;

-- Окна под записи (если такого окна ещё нет) – и под время до переноса
INSERT INTO schedule_slots (psychologist_id, starts_at, ends_at)
SELECT p.id, pg_temp.demo_ts(d.k, t.hhmm), pg_temp.demo_ts(d.k, t.hhmm) + interval '50 minutes'
FROM demo_appt d
JOIN users p ON p.email = d.psy
CROSS JOIN LATERAL (VALUES (d.hhmm), (d.from_hhmm)) AS t(hhmm)
WHERE t.hhmm IS NOT NULL
ON CONFLICT DO NOTHING;

-- Записи до переноса (статус «перенесена»), затем все остальные
INSERT INTO appointments (client_id, psychologist_id, slot_id, service_id, status, price_at_booking, client_note, created_at)
SELECT c.id, p.id, sl.id, s.id, 'rescheduled', s.price, d.note, pg_temp.demo_ts(d.created_k, d.created_hhmm)
FROM demo_appt d
JOIN users c ON c.email = d.client
JOIN users p ON p.email = d.psy
JOIN schedule_slots sl ON sl.psychologist_id = p.id AND sl.starts_at = pg_temp.demo_ts(d.k, d.from_hhmm)
JOIN psychologist_services s ON s.psychologist_id = p.id AND s.format_id = (SELECT id FROM session_formats WHERE code = 'individual')
WHERE d.from_hhmm IS NOT NULL;

INSERT INTO appointments (client_id, psychologist_id, slot_id, service_id, status, price_at_booking, client_note,
                          rescheduled_from_id, created_at)
SELECT c.id, p.id, sl.id, s.id, d.status, s.price, d.note,
       (SELECT a.id FROM appointments a JOIN schedule_slots fs ON fs.id = a.slot_id
         WHERE a.client_id = c.id AND a.psychologist_id = p.id AND fs.starts_at = pg_temp.demo_ts(d.k, d.from_hhmm)),
       CASE WHEN d.from_hhmm IS NULL THEN pg_temp.demo_ts(d.created_k, d.created_hhmm)
            ELSE pg_temp.demo_ts(d.changed_k, d.changed_hhmm) END
FROM demo_appt d
JOIN users c ON c.email = d.client
JOIN users p ON p.email = d.psy
JOIN schedule_slots sl ON sl.psychologist_id = p.id AND sl.starts_at = pg_temp.demo_ts(d.k, d.hhmm)
JOIN psychologist_services s ON s.psychologist_id = p.id AND s.format_id = (SELECT id FROM session_formats WHERE code = 'individual');

-- Окна с действующими и прошедшими встречами заняты; окна отменённых и перенесённых остаются свободными
UPDATE schedule_slots sl SET status = 'booked'
 WHERE EXISTS (SELECT 1 FROM appointments a WHERE a.slot_id = sl.id AND a.status IN ('scheduled', 'completed', 'no_show'));

-- История статусов: создание записи
INSERT INTO appointment_status_history (appointment_id, old_status, new_status, changed_by, changed_at)
SELECT a.id, NULL, 'scheduled',
       CASE WHEN a.rescheduled_from_id IS NOT NULL AND d.changed_by = 'psychologist' THEN a.psychologist_id ELSE a.client_id END,
       a.created_at
FROM appointments a
JOIN users c ON c.id = a.client_id
JOIN users p ON p.id = a.psychologist_id
JOIN demo_appt d ON d.client = c.email AND d.psy = p.email
JOIN schedule_slots sl ON sl.id = a.slot_id
WHERE sl.starts_at IN (pg_temp.demo_ts(d.k, d.hhmm), pg_temp.demo_ts(d.k, d.from_hhmm));

-- История статусов: перенос, отмена, «состоялась», «не пришёл» – кем, когда и почему
INSERT INTO appointment_status_history (appointment_id, old_status, new_status, changed_by, reason, changed_at)
SELECT a.id, 'scheduled', a.status,
       CASE d.changed_by WHEN 'client' THEN a.client_id ELSE a.psychologist_id END,
       d.reason, pg_temp.demo_ts(d.changed_k, d.changed_hhmm)
FROM appointments a
JOIN users c ON c.id = a.client_id
JOIN users p ON p.id = a.psychologist_id
JOIN demo_appt d ON d.client = c.email AND d.psy = p.email
JOIN schedule_slots sl ON sl.id = a.slot_id
WHERE a.status <> 'scheduled'
  AND sl.starts_at = pg_temp.demo_ts(d.k, coalesce(CASE WHEN a.status = 'rescheduled' THEN d.from_hhmm END, d.hhmm));

ALTER TABLE appointments ENABLE TRIGGER trg_appointments_book;
ALTER TABLE appointments ENABLE TRIGGER trg_appointments_status;

-- ---------------------------------------------------------------------
-- Чат (DIALOGS и PSY_DIALOGS из chat.js): переписка Анны с Мариной и Дмитрием Соколовым,
-- Марины с Ольгой и Павлом. Время – не позже текущего момента
-- ---------------------------------------------------------------------
INSERT INTO conversations (client_id, psychologist_id, created_at)
SELECT c.id, p.id, pg_temp.demo_ts(v.k, '00:00')
FROM (VALUES ('anna@mail.com', 'marina@ryadom.by', -6), ('anna@mail.com', 'd.sokolov@ryadom.by', -17),
             ('olga.s@mail.ru', 'marina@ryadom.by', -2), ('pavel.m@gmail.com', 'marina@ryadom.by', -4)) AS v(client, psy, k)
JOIN users c ON c.email = v.client
JOIN users p ON p.email = v.psy;

-- who: client | psy; read – прочитано ли собеседником
CREATE TEMP TABLE demo_msg (client citext, psy citext, k int, hhmm text, who text, body text, attachment text, read boolean) ON COMMIT DROP;
INSERT INTO demo_msg VALUES
    ('anna@mail.com', 'marina@ryadom.by', -5, '18:02', 'psy',
     'Здравствуйте, Анна! Я получила вашу анкету. Перед первой встречей можно коротко написать, что сейчас беспокоит больше всего?', NULL, true),
    ('anna@mail.com', 'marina@ryadom.by', -5, '18:20', 'client',
     'Здравствуйте! В последнее время сложно уснуть – постоянно прокручиваю мысли о работе.', NULL, true),
    ('anna@mail.com', 'marina@ryadom.by', -5, '18:24', 'psy',
     'Спасибо, что поделились. Обсудим это на сессии. Если до встречи станет тяжело – пишите.', NULL, true),
    ('anna@mail.com', 'marina@ryadom.by', -1, '10:15', 'client',
     'Марина, можно перенести встречу на попозже? На работе совещание.', NULL, true),
    ('anna@mail.com', 'marina@ryadom.by', -1, '10:31', 'psy', 'Конечно, перенесла на 15:00. Жду вас 🙂', NULL, true),
    ('anna@mail.com', 'marina@ryadom.by', 0, '09:12', 'psy', NULL, 'demo/chat/Дневник мыслей.pdf', true),
    ('anna@mail.com', 'marina@ryadom.by', 0, '09:13', 'psy',
     'Если будет время – попробуйте заполнить этот дневник пару дней. Обсудим на встрече.', NULL, true),
    ('anna@mail.com', 'marina@ryadom.by', 0, '09:40', 'client', 'Спасибо! Начну сегодня вечером.', NULL, false),
    ('anna@mail.com', 'd.sokolov@ryadom.by', -17, '20:05', 'psy',
     'Спасибо за встречу. Если захотите продолжить – свободные окна есть в моём расписании.', NULL, true),
    ('anna@mail.com', 'd.sokolov@ryadom.by', -17, '20:40', 'client',
     'Спасибо! Пока попробую поработать с Мариной, но буду иметь в виду.', NULL, true),
    ('olga.s@mail.ru', 'marina@ryadom.by', -2, '22:10', 'client',
     'Здравствуйте. Я никогда раньше не ходила к психологу – нужно ли как-то готовиться к первой встрече?', NULL, false),
    ('pavel.m@gmail.com', 'marina@ryadom.by', -4, '19:30', 'client',
     'Спасибо за встречу, стало спокойнее. Записался на следующую среду.', NULL, true),
    ('pavel.m@gmail.com', 'marina@ryadom.by', -4, '19:45', 'psy', 'Рада слышать, Павел. До встречи!', NULL, true);

INSERT INTO messages (conversation_id, sender_id, body, attachment_key, created_at, read_at)
SELECT cv.id, CASE m.who WHEN 'client' THEN c.id ELSE p.id END, m.body, m.attachment, x.at,
       CASE WHEN m.read THEN least(x.at + interval '5 minutes', now()) END
FROM demo_msg m
JOIN users c ON c.email = m.client
JOIN users p ON p.email = m.psy
JOIN conversations cv ON cv.client_id = c.id AND cv.psychologist_id = p.id
CROSS JOIN LATERAL (SELECT least(pg_temp.demo_ts(m.k, m.hhmm), now() - interval '1 minute') AS at) x
ORDER BY x.at;

-- ---------------------------------------------------------------------
-- Отзывы (REVIEWS, CLIENT_REVIEWS, MOD_REVIEWS из data.js). Отзыв требует проведённой консультации,
-- поэтому для каждого создаётся завершённая запись (appt_k, appt_hhmm), если её ещё нет.
-- Рейтинг психологов пересчитывает триггер по одобренным отзывам
-- ---------------------------------------------------------------------
CREATE TEMP TABLE demo_review (client citext, first_name text, psy citext, k int, rating int, body text, anonymous boolean,
    status moderation_status, reply text, mod_comment text, appt_k int, appt_hhmm text) ON COMMIT DROP;
INSERT INTO demo_review VALUES
    ('anna@mail.com', 'Анна', 'marina@ryadom.by', -16, 5, 'Марина помогла разобраться с тревогой перед сменой работы. Спокойно, по делу, с понятными упражнениями между встречами.', false, 'approved', NULL, NULL, -17, '06:00'),
    ('review1@demo.ryadom.by', 'Ксения', 'marina@ryadom.by', -30, 5, 'Нравится, что можно прийти с любым состоянием и не чувствовать себя странно. Стала лучше спать.', false, 'approved', 'Ксения, спасибо! Рада, что сон наладился – это большой шаг.', NULL, -31, '06:00'),
    ('review2@demo.ryadom.by', 'Евгения', 'marina@ryadom.by', -49, 4, 'Хороший специалист, но мне не всегда подходило время вечерних сессий.', true, 'approved', NULL, NULL, -50, '06:00'),
    ('review3@demo.ryadom.by', 'Виктория', 'marina@ryadom.by', -67, 5, 'Работали над выгоранием почти три месяца. Вернулась к работе без ощущения, что меня выжали. Спасибо за терпение и честность.', false, 'approved', 'Виктория, спасибо за доверие и вашу работу – изменения целиком ваша заслуга.', NULL, -68, '06:00'),
    ('review4@demo.ryadom.by', 'Игорь', 'marina@ryadom.by', -82, 3, 'Мне показалось, что подход слишком структурированный – много заданий. Возможно, просто не мой формат.', true, 'approved', NULL, NULL, -83, '06:00'),
    ('review5@demo.ryadom.by', 'Елена', 'marina@ryadom.by', -105, 5, 'Панические атаки стали редкими и уже не пугают. Очень понятные объяснения, что происходит с телом.', false, 'approved', NULL, NULL, -106, '06:00'),
    ('pavel.m@gmail.com', 'Павел', 'a.lukashevich@ryadom.by', -23, 5, 'Андрей помог пережить развод. Без советов «как надо», зато с вопросами, после которых многое встало на свои места.', false, 'approved', NULL, NULL, -24, '06:00'),
    ('review6@demo.ryadom.by', 'Марта', 'a.lukashevich@ryadom.by', -44, 4, 'Глубокая работа. Первые встречи давались тяжело, но это того стоило.', true, 'approved', NULL, NULL, -45, '06:00'),
    ('review7@demo.ryadom.by', 'Ирина и Олег', 'o.ermak@ryadom.by', -13, 5, 'Пришли парой на грани расставания. Ольга помогла нам снова слышать друг друга.', false, 'approved', NULL, NULL, -14, '06:00'),
    ('review8@demo.ryadom.by', 'Татьяна', 'o.ermak@ryadom.by', -36, 5, 'Ходили с сыном-подростком. Стало намного меньше ссор дома.', false, 'approved', NULL, NULL, -37, '06:00'),
    ('review9@demo.ryadom.by', 'Максим', 'i.kovalchuk@ryadom.by', -10, 5, 'Наконец-то перестал откладывать диплом. Илья даёт очень практичные инструменты.', false, 'approved', NULL, NULL, -11, '06:00'),
    ('review10@demo.ryadom.by', 'Роман', 'i.kovalchuk@ryadom.by', -28, 4, 'Понятно и без лишней теории. Иногда хотелось больше времени на разговор.', true, 'approved', NULL, NULL, -29, '06:00'),
    ('review11@demo.ryadom.by', 'Алёна', 'd.mironova@ryadom.by', -19, 5, 'Очень бережно. Впервые получилось говорить о себе без стыда.', false, 'approved', NULL, NULL, -20, '06:00'),
    ('review12@demo.ryadom.by', 'Сергей', 'd.sokolov@ryadom.by', -33, 5, 'Дмитрий помог прожить потерю отца. Благодарен за терпение.', false, 'approved', NULL, NULL, -34, '06:00'),
    ('review13@demo.ryadom.by', 'Виктория', 'a.kovaleva@ryadom.by', -17, 5, 'Вернулся интерес к работе и хобби. Алина очень тёплая и внимательная.', false, 'approved', NULL, NULL, -18, '06:00'),
    ('review14@demo.ryadom.by', 'Денис', 'n.belov@ryadom.by', -21, 5, 'Панические атаки почти ушли. EMDR сначала казался странным, но работает.', false, 'approved', NULL, NULL, -22, '06:00'),
    ('review15@demo.ryadom.by', 'Лилия', 'n.belov@ryadom.by', -46, 4, 'Хорошо объясняет, что происходит с телом при тревоге.', true, 'approved', NULL, NULL, -47, '06:00'),
    ('review16@demo.ryadom.by', 'Наталья', 'v.zhuk@ryadom.by', -15, 5, 'Дочь сама попросила продолжить встречи – это лучший отзыв.', false, 'approved', NULL, NULL, -16, '06:00'),
    ('review17@demo.ryadom.by', 'Егор', 'a.savitsky@ryadom.by', -26, 5, 'Помог пережить сессию в университете без нервных срывов.', false, 'approved', NULL, NULL, -27, '06:00'),
    ('review18@demo.ryadom.by', 'Вадим', 'e.novik@ryadom.by', -38, 5, 'Работаем больше полугода. Екатерина – очень опытный и глубокий специалист.', true, 'approved', NULL, NULL, -39, '06:00'),
    ('review19@demo.ryadom.by', 'Олег', 'p.gordeeva@ryadom.by', -18, 5, 'Помогла понять, что выгорание – не слабость. Стал больше отдыхать без чувства вины.', false, 'approved', NULL, NULL, -19, '06:00'),
    -- Анна: на проверке, опубликован с ответом, отклонён
    ('anna@mail.com', 'Анна', 'marina@ryadom.by', -12, 5,
     'Марина помогает разобраться, откуда берётся тревога. После каждой встречи уношу с собой понятные упражнения.',
     false, 'pending', NULL, NULL, -13, '12:30'),
    ('anna@mail.com', 'Анна', 'd.sokolov@ryadom.by', -16, 4,
     'Спокойная и бережная встреча. Решила пока продолжить с другим специалистом, но впечатления хорошие.',
     false, 'approved', 'Анна, спасибо за отзыв! Буду рад помочь, если решите вернуться.', NULL, -17, '19:00'),
    ('anna@mail.com', 'Анна', 'n.belov@ryadom.by', -30, 2, 'Ужасно, деньги на ветер!!! Не советую никому.', true, 'rejected', NULL,
     'Отзыв должен описывать опыт работы со специалистом. Пожалуйста, расскажите подробнее, что не понравилось, без оскорбительных оценок.',
     -31, '06:00'),
    -- новые отзывы на модерации
    ('kirill.sh@gmail.com', 'Кирилл', 'i.kovalchuk@ryadom.by', -1, 2,
     'Психолог опоздал на 10 минут, связь постоянно прерывалась. Содержательно – нормально, но осадок остался.',
     false, 'pending', NULL, NULL, -2, '06:00'),
    ('olga.s@mail.ru', 'Ольга', 'o.ermak@ryadom.by', 0, 5,
     'Пришли с мужем на грани развода. За одну встречу Ольга помогла нам впервые за месяц спокойно поговорить. Мой телефон +375 29 123-45-67, если кто-то захочет спросить подробнее.',
     false, 'pending', NULL, NULL, -1, '06:00'),
    -- опубликованный отзыв, на который психолог пожаловался
    ('review90@demo.ryadom.by', 'Глеб', 'a.lukashevich@ryadom.by', -5, 1, 'Шарлатан!!! Не ходите к нему, только деньги тянет.',
     true, 'approved', NULL, NULL, -6, '06:00');

-- Клиенты-авторы, которых ещё нет
INSERT INTO users (email, password_hash, created_at, last_login_at)
SELECT DISTINCT ON (client) client, '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', pg_temp.demo_ts(appt_k - 7, '12:00'), pg_temp.demo_ts(k, '12:00')
FROM demo_review ORDER BY client, appt_k
ON CONFLICT (email) DO NOTHING;
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM (SELECT DISTINCT client FROM demo_review) d JOIN users u ON u.email = d.client JOIN roles r ON r.code = 'client'
ON CONFLICT DO NOTHING;
INSERT INTO client_profiles (user_id, first_name)
SELECT DISTINCT ON (u.id) u.id, d.first_name FROM demo_review d JOIN users u ON u.email = d.client
ON CONFLICT DO NOTHING;

ALTER TABLE appointments DISABLE TRIGGER trg_appointments_book;
ALTER TABLE appointments DISABLE TRIGGER trg_appointments_status;

-- Проведённые консультации, по которым написаны отзывы (если такой ещё нет)
INSERT INTO schedule_slots (psychologist_id, starts_at, ends_at, status)
SELECT p.id, pg_temp.demo_ts(d.appt_k, d.appt_hhmm), pg_temp.demo_ts(d.appt_k, d.appt_hhmm) + interval '50 minutes', 'booked'
FROM demo_review d JOIN users p ON p.email = d.psy
ON CONFLICT DO NOTHING;

INSERT INTO appointments (client_id, psychologist_id, slot_id, service_id, status, price_at_booking, created_at)
SELECT c.id, p.id, sl.id, s.id, 'completed', s.price, pg_temp.demo_ts(d.appt_k - 3, '12:00')
FROM demo_review d
JOIN users c ON c.email = d.client
JOIN users p ON p.email = d.psy
JOIN schedule_slots sl ON sl.psychologist_id = p.id AND sl.starts_at = pg_temp.demo_ts(d.appt_k, d.appt_hhmm)
JOIN psychologist_services s ON s.psychologist_id = p.id AND s.format_id = (SELECT id FROM session_formats WHERE code = 'individual')
WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.slot_id = sl.id);

INSERT INTO appointment_status_history (appointment_id, old_status, new_status, changed_by, changed_at)
SELECT a.id, h.old_status, h.new_status, h.by_id, h.at
FROM appointments a
JOIN schedule_slots sl ON sl.id = a.slot_id
CROSS JOIN LATERAL (VALUES (NULL::appointment_status, 'scheduled'::appointment_status, a.client_id, a.created_at),
                           ('scheduled', 'completed', a.psychologist_id, sl.ends_at)) AS h(old_status, new_status, by_id, at)
WHERE NOT EXISTS (SELECT 1 FROM appointment_status_history x WHERE x.appointment_id = a.id);

ALTER TABLE appointments ENABLE TRIGGER trg_appointments_book;
ALTER TABLE appointments ENABLE TRIGGER trg_appointments_status;

INSERT INTO reviews (appointment_id, client_id, psychologist_id, rating, body, is_anonymous, status,
                     moderated_by, moderated_at, moderation_comment, reply, replied_at, created_at, updated_at)
SELECT a.id, c.id, p.id, d.rating, d.body, d.anonymous, d.status,
       CASE WHEN d.status <> 'pending' THEN m.id END,
       CASE WHEN d.status <> 'pending' THEN least(pg_temp.demo_ts(d.k + 1, '10:00'), now()) END,
       d.mod_comment, d.reply,
       CASE WHEN d.reply IS NOT NULL THEN least(pg_temp.demo_ts(d.k + 2, '19:00'), now()) END,
       least(pg_temp.demo_ts(d.k, '12:00'), now()), least(pg_temp.demo_ts(d.k, '12:00'), now())
FROM demo_review d
JOIN users c ON c.email = d.client
JOIN users p ON p.email = d.psy
JOIN users m ON m.email = 'moderator@ryadom.by'
JOIN schedule_slots sl ON sl.psychologist_id = p.id AND sl.starts_at = pg_temp.demo_ts(d.appt_k, d.appt_hhmm)
JOIN appointments a ON a.slot_id = sl.id AND a.client_id = c.id AND a.status = 'completed'
ORDER BY d.k;

-- Жалобы психологов на опубликованные отзывы
INSERT INTO review_reports (review_id, reporter_id, reason, created_at)
SELECT r.id, r.psychologist_id, v.reason, least(pg_temp.demo_ts(v.k, '11:00'), now())
FROM (VALUES ('marina@ryadom.by', 'Мне показалось, что подход%', 0,
              'Клиент был только на двух сессиях и прервал работу – оценка кажется несправедливой'),
             ('a.lukashevich@ryadom.by', 'Шарлатан%', -1, 'Оскорбления')) AS v(psy, body_like, k, reason)
JOIN users p ON p.email = v.psy
JOIN reviews r ON r.psychologist_id = p.id AND r.body LIKE v.body_like;

-- ---------------------------------------------------------------------
-- Заявки психологов на подтверждение статуса (MOD_APPLICATIONS из data.js):
-- три ждут проверки, одна отклонена; у Никиты Белова – одобренная заявка в истории
-- ---------------------------------------------------------------------
CREATE TEMP TABLE demo_applicant (email citext, first_name text, last_name text, gender gender_type, exp int, reg int,
    headline text, bio text, methods text[], topics text[], price numeric) ON COMMIT DROP;
INSERT INTO demo_applicant VALUES
    ('grin.sv@mail.ru', 'Светлана', 'Гринь', 'female', 6, 2, 'Психолог-консультант',
     'Работаю со взрослыми: тревога, отношения, поиск себя. Личная терапия более 300 часов, регулярная супервизия.',
     '{"Гештальт"}', '{"Тревожность","Отношения"}', 60),
    ('t.aliev@gmail.com', 'Тимур', 'Алиев', 'male', 2, 4, 'Психолог',
     'Помогаю студентам и молодым специалистам справиться со стрессом и прокрастинацией.',
     '{"КПТ"}', '{"Стресс","Прокрастинация"}', 45),
    ('yulia.kov@ryadom.by', 'Юлия', 'Ковалёва', 'female', 9, 1, 'Клинический психолог',
     'Клинический психолог, 9 лет практики. Работаю с тревожными и депрессивными состояниями, расстройствами личности.',
     '{"Схема-терапия","КПТ"}', '{"Тревожность","Кризис"}', 85),
    ('viktor.n@mail.ru', 'Виктор', 'Н.', 'male', 1, 16, 'Коуч', 'Помогу достичь целей за 3 сессии.', '{}', '{}', 40);

INSERT INTO users (email, password_hash, created_at, last_login_at)
SELECT email, '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - make_interval(days => reg), now() - make_interval(days => least(reg, 1)) FROM demo_applicant;
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM demo_applicant d JOIN users u ON u.email = d.email JOIN roles r ON r.code = 'psychologist';
INSERT INTO psychologist_profiles (user_id, first_name, last_name, gender, headline, bio, practice_since)
SELECT u.id, d.first_name, d.last_name, d.gender, d.headline, d.bio, CURRENT_DATE - make_interval(years => d.exp, months => 2)
FROM demo_applicant d JOIN users u ON u.email = d.email;
INSERT INTO psychologist_methods (psychologist_id, method_id)
SELECT u.id, m.id FROM demo_applicant d JOIN users u ON u.email = d.email JOIN methods m ON m.name = ANY (d.methods);
INSERT INTO psychologist_topics (psychologist_id, topic_id)
SELECT u.id, t.id FROM demo_applicant d JOIN users u ON u.email = d.email JOIN topics t ON t.name = ANY (d.topics);
INSERT INTO psychologist_services (psychologist_id, format_id, price)
SELECT u.id, (SELECT id FROM session_formats WHERE code = 'individual'), d.price FROM demo_applicant d JOIN users u ON u.email = d.email;

-- Документы: файлов нет, вместо них API отдаёт образец из backend/demo-files по расширению
INSERT INTO documents (psychologist_id, doc_type, institution, specialty, issued_year, file_key, original_name, mime_type,
                       size_bytes, status, review_comment, reviewed_by, reviewed_at, uploaded_at)
SELECT u.id, v.doc_type, v.institution, v.specialty, v.year,
       'demo/documents/' || split_part(u.email::text, '@', 1) || '-' || v.n || v.ext, v.name,
       CASE v.ext WHEN '.pdf' THEN 'application/pdf' WHEN '.jpg' THEN 'image/jpeg' ELSE 'image/png' END,
       v.size, v.status, v.comment,
       CASE WHEN v.status <> 'pending' THEN m.id END,
       CASE WHEN v.status <> 'pending' THEN now() - interval '13 days' END,
       now() - make_interval(days => v.uploaded)
FROM (VALUES
    ('grin.sv@mail.ru', 1, 'diploma'::document_type, 'БГУ', 'психология', 2018, 'Диплом БГУ.pdf', '.pdf', 1258291, 'pending'::request_status, NULL, 2),
    ('grin.sv@mail.ru', 2, 'certificate', 'Московский гештальт-институт', 'Программа «Гештальт-терапия»', 2022, 'Сертификат МГИ.jpg', '.jpg', 860160, 'pending', NULL, 2),
    ('t.aliev@gmail.com', 1, 'diploma', 'ГрГУ им. Купалы', 'психология', 2023, 'diplom_scan.png', '.png', 3565158, 'pending', NULL, 4),
    ('yulia.kov@ryadom.by', 1, 'diploma', 'БГУ', 'клиническая психология', 2015, 'Диплом магистра.pdf', '.pdf', 2202009, 'pending', NULL, 1),
    ('yulia.kov@ryadom.by', 2, 'certificate', 'Институт практической психологии', 'Повышение квалификации по схема-терапии', 2020,
     'Схема-терапия сертификат.pdf', '.pdf', 655360, 'pending', NULL, 1),
    ('yulia.kov@ryadom.by', 3, 'other', 'Супервизор с опытом 15+ лет', 'Справка о прохождении супервизии', 2024,
     'Супервизия справка.pdf', '.pdf', 215040, 'pending', NULL, 1),
    ('viktor.n@mail.ru', 1, 'certificate', 'Онлайн-школа', 'Онлайн-курс «Коучинг за 30 дней»', 2025, 'certificate.jpg', '.jpg', 307200,
     'rejected', 'Нет высшего психологического образования. Онлайн-курс не подтверждает квалификацию психолога.', 16)
) AS v(email, n, doc_type, institution, specialty, year, name, ext, size, status, comment, uploaded)
JOIN users u ON u.email = v.email
JOIN users m ON m.email = 'moderator@ryadom.by';

-- Заявки (статус анкеты выставит триггер apply_verification_request)
INSERT INTO verification_requests (psychologist_id, status, submitted_at, reviewed_by, reviewed_at, comment)
SELECT u.id, v.status, now() - make_interval(days => v.sent, hours => 3),
       CASE WHEN v.status <> 'pending' THEN m.id END,
       CASE WHEN v.status <> 'pending' THEN now() - make_interval(days => v.decided) END,
       v.comment
FROM (VALUES ('grin.sv@mail.ru', 'pending'::request_status, 1, NULL::int, NULL),
             ('t.aliev@gmail.com', 'pending', 3, NULL, NULL),
             ('yulia.kov@ryadom.by', 'pending', 0, NULL, NULL),
             ('viktor.n@mail.ru', 'rejected', 15, 13,
              'Нет высшего психологического образования. Онлайн-курс не подтверждает квалификацию психолога.'),
             ('n.belov@ryadom.by', 'approved', 95, 92, NULL)) AS v(email, status, sent, decided, comment)
JOIN users u ON u.email = v.email
JOIN users m ON m.email = 'moderator@ryadom.by';

-- ---------------------------------------------------------------------
-- Журнал действий модератора (MOD_AUDIT из data.js)
-- ---------------------------------------------------------------------
INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, created_at)
SELECT m.id, v.action, v.entity_type, u.id, v.details::jsonb, pg_temp.demo_ts(v.k, v.hhmm)
FROM (VALUES
    (-92, '18:40', 'verification.approve', 'psychologist', 'n.belov@ryadom.by', '{"psychologist": "Никита Белов", "comment": null}'),
    (-20, '10:00', 'role.grant', 'user', 'yulia.kov@ryadom.by', '{"user": "Юлия Ковалёва", "role": "psychologist"}'),
    (-13, '14:17', 'verification.reject', 'psychologist', 'viktor.n@mail.ru',
     '{"psychologist": "Виктор Н.", "comment": "Нет высшего психологического образования. Онлайн-курс не подтверждает квалификацию психолога."}'),
    (-12, '20:31', 'user.block', 'user', 'dk_1990@yandex.by', '{"user": "Дмитрий К.", "reason": "Оскорбления психолога в чате после сессии"}'),
    (-29, '09:12', 'review.reject', 'review', NULL, '{"psychologist": "Никита Белов", "rating": 2, "comment": "Оскорбительные оценки"}'),
    (-15, '11:05', 'review.approve', 'review', NULL, '{"psychologist": "Дмитрий Соколов", "rating": 4, "comment": null}')
) AS v(k, hhmm, action, entity_type, email, details)
JOIN users m ON m.email = 'moderator@ryadom.by'
LEFT JOIN users u ON u.email = v.email;

-- Заблокированный клиент – для проверки входа с блокировкой
INSERT INTO user_blocks (user_id, blocked_by, reason, blocked_at)
SELECT c.id, m.id, 'Оскорбления психолога в чате после сессии', now() - interval '12 days'
FROM users c, users m
WHERE c.email = 'dk_1990@yandex.by' AND m.email = 'moderator@ryadom.by';

COMMIT;
