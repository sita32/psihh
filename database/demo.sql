-- =====================================================================
--  Демо-аккаунты для разработки и показа (те же люди, что в frontend/js/data.js).
--  Выполняется после seed.sql; в docker compose – автоматически при первом старте.
--  Пароль у всех: demo1234 (хеш bcrypt, 12 раундов).
-- =====================================================================

BEGIN;

-- Пользователи
INSERT INTO users (email, password_hash, created_at) VALUES
    ('anna@mail.com',       '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - interval '40 days'),
    ('dk_1990@yandex.by',   '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - interval '60 days'),
    ('marina@ryadom.by',    '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - interval '120 days'),
    ('moderator@ryadom.by', '$2b$12$5FQ8S1KbR9Cr1bmLwuf1J.5kp.4Y/NhUVAO13bcf2g3.U35SX8ZGy', now() - interval '365 days');

-- Роли
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM (VALUES ('anna@mail.com', 'client'),
             ('dk_1990@yandex.by', 'client'),
             ('marina@ryadom.by', 'psychologist'),
             ('moderator@ryadom.by', 'moderator')) AS v(email, role)
JOIN users u ON u.email = v.email
JOIN roles r ON r.code = v.role;

-- Профили клиентов
INSERT INTO client_profiles (user_id, first_name, last_name, gender)
SELECT id, 'Анна', 'Петрова', 'female'::gender_type FROM users WHERE email = 'anna@mail.com'
UNION ALL
SELECT id, 'Дмитрий', 'К.', 'male'::gender_type FROM users WHERE email = 'dk_1990@yandex.by';

-- Профиль психолога: документы проверены, анкета опубликована
INSERT INTO psychologist_profiles (user_id, first_name, last_name, gender, headline, practice_since,
                                   verification_status, verified_at, is_published)
SELECT id, 'Марина', 'Волкова', 'female', 'Клинический психолог', DATE '2017-09-01',
       'verified', now() - interval '110 days', true
FROM users WHERE email = 'marina@ryadom.by';

-- Заблокированный клиент – для проверки входа с блокировкой
INSERT INTO user_blocks (user_id, blocked_by, reason, blocked_at)
SELECT c.id, m.id, 'Оскорбления психолога в чате после сессии', now() - interval '12 days'
FROM users c, users m
WHERE c.email = 'dk_1990@yandex.by' AND m.email = 'moderator@ryadom.by';

COMMIT;
