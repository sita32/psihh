-- =====================================================================
--  Начальные данные: роли, права доступа, справочники.
--  Выполняется после schema.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Роли
-- ---------------------------------------------------------------------
INSERT INTO roles (code, name, description) VALUES
    ('client',       'Клиент',    'Поиск психолога, запись на консультации, чат, отзывы'),
    ('psychologist', 'Психолог',  'Профессиональный профиль, расписание, работа с клиентами'),
    ('moderator',    'Модератор', 'Управление пользователями, ролями и модерация контента');

-- ---------------------------------------------------------------------
-- Права доступа, сгруппированные по модулям приложения
-- ---------------------------------------------------------------------
INSERT INTO permissions (code, module, description) VALUES
    -- профиль
    ('profile.edit_own',        'profile',      'Редактирование собственного профиля'),
    -- каталог
    ('catalog.view',            'catalog',      'Поиск и просмотр профилей психологов'),
    -- записи
    ('appointments.book',       'appointments', 'Запись на консультацию'),
    ('appointments.manage_own', 'appointments', 'Отмена и перенос своих записей'),
    -- расписание
    ('schedule.manage',         'schedule',     'Управление слотами расписания'),
    -- документы
    ('documents.upload',        'documents',    'Загрузка документов об образовании'),
    -- чат
    ('chat.use',                'chat',         'Использование встроенного чата'),
    -- отзывы
    ('reviews.create',          'reviews',      'Публикация отзывов о психологе'),
    ('reviews.reply',           'reviews',      'Ответ на отзывы о себе и жалоба модератору'),
    -- модерация
    ('users.view',              'moderation',   'Просмотр пользователей'),
    ('users.edit',              'moderation',   'Редактирование профилей пользователей'),
    ('users.block',             'moderation',   'Блокировка и разблокировка аккаунтов'),
    ('roles.assign',            'moderation',   'Назначение ролей и прав доступа'),
    ('psychologists.verify',    'moderation',   'Проверка документов и подтверждение статуса специалиста'),
    ('reviews.moderate',        'moderation',   'Модерация отзывов'),
    ('audit.view',              'moderation',   'Просмотр журнала действий');

-- ---------------------------------------------------------------------
-- Права ролей
-- ---------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY (CASE r.code
    WHEN 'client' THEN ARRAY[
        'profile.edit_own', 'catalog.view', 'appointments.book',
        'appointments.manage_own', 'chat.use', 'reviews.create']
    WHEN 'psychologist' THEN ARRAY[
        'profile.edit_own', 'catalog.view', 'appointments.manage_own',
        'schedule.manage', 'documents.upload', 'chat.use', 'reviews.reply']
    WHEN 'moderator' THEN ARRAY[
        'catalog.view', 'users.view', 'users.edit', 'users.block', 'roles.assign',
        'psychologists.verify', 'reviews.moderate', 'audit.view']
END);

-- ---------------------------------------------------------------------
-- Справочники (значения совпадают с фильтрами каталога на фронтенде)
-- ---------------------------------------------------------------------
INSERT INTO session_formats (code, name, max_participants) VALUES
    ('individual', 'Индивидуальная', 1),
    ('couple',     'Парная',         2),
    ('child',      'С ребёнком',     2);

INSERT INTO methods (code, name, description) VALUES
    ('cbt',            'КПТ',                'Когнитивно-поведенческая терапия'),
    ('gestalt',        'Гештальт',           'Гештальт-терапия'),
    ('schema',         'Схема-терапия',      'Работа с ранними дезадаптивными схемами'),
    ('act',            'ACT',                'Терапия принятия и ответственности'),
    ('psychoanalysis', 'Психоанализ',        'Психоаналитическая терапия'),
    ('emdr',           'EMDR',               'Десенсибилизация и переработка движением глаз'),
    ('family',         'Системная семейная', 'Системная семейная терапия');

INSERT INTO topics (code, name) VALUES
    ('anxiety',         'Тревожность'),
    ('stress',          'Стресс'),
    ('burnout',         'Выгорание'),
    ('relationships',   'Отношения'),
    ('self_esteem',     'Самооценка'),
    ('apathy',          'Апатия'),
    ('procrastination', 'Прокрастинация'),
    ('grief',           'Утрата'),
    ('crisis',          'Кризис'),
    ('panic',           'Панические атаки');

COMMIT;
