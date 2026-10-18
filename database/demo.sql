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

-- Заблокированный клиент – для проверки входа с блокировкой
INSERT INTO user_blocks (user_id, blocked_by, reason, blocked_at)
SELECT c.id, m.id, 'Оскорбления психолога в чате после сессии', now() - interval '12 days'
FROM users c, users m
WHERE c.email = 'dk_1990@yandex.by' AND m.email = 'moderator@ryadom.by';

COMMIT;
