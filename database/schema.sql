-- =====================================================================
--  «Рядом» — веб-приложение для поиска специалистов в сфере
--  ментального здоровья.
--  Логическая схема базы данных (PostgreSQL 16).
--
--  Модули схемы:
--    1. Пользователи и разграничение прав доступа (RBAC)
--    2. Профили клиентов и психологов, справочники
--    3. Образование, документы, верификация специалистов
--    4. Расписание, записи на консультации, оплата
--    5. Отзывы
--    6. Чат
--    7. Уведомления и журнал действий
--    8. Представления (VIEW) для каталога
--
--  Временные данные (сессии, refresh-токены, онлайн-статус, кэш,
--  rate limit) хранятся в Redis — см. redis.md.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Расширения
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;      -- регистронезависимый email
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- EXCLUDE-ограничение для слотов

-- ---------------------------------------------------------------------
-- Перечисляемые типы
-- ---------------------------------------------------------------------
CREATE TYPE user_status         AS ENUM ('active', 'blocked', 'deleted');
CREATE TYPE gender_type         AS ENUM ('male', 'female');
CREATE TYPE verification_status AS ENUM ('draft', 'pending', 'verified', 'rejected');
CREATE TYPE request_status      AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE education_kind      AS ENUM ('higher', 'retraining', 'course', 'supervision');
CREATE TYPE document_type       AS ENUM ('diploma', 'certificate', 'license', 'other');
CREATE TYPE slot_status         AS ENUM ('free', 'booked', 'blocked');
CREATE TYPE appointment_status  AS ENUM ('scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show');
CREATE TYPE payment_status      AS ENUM ('pending', 'paid', 'refunded', 'failed');
CREATE TYPE moderation_status   AS ENUM ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------
-- Общая функция: автоматическое обновление поля updated_at
-- ---------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

-- Идентификатор текущего пользователя приложения.
-- Backend выполняет в транзакции: SELECT set_config('app.user_id', '42', true);
-- Это позволяет триггерам знать, кто совершил изменение.
CREATE FUNCTION app_user_id() RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::bigint
$$;

-- =====================================================================
-- 1. ПОЛЬЗОВАТЕЛИ И RBAC
-- =====================================================================

-- Учётные записи (общие для всех ролей)
CREATE TABLE users (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email             citext       NOT NULL UNIQUE,
    password_hash     text         NOT NULL,                 -- bcrypt/argon2
    status            user_status  NOT NULL DEFAULT 'active',
    email_verified_at timestamptz,
    last_login_at     timestamptz,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT users_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Системные роли: client, psychologist, moderator
CREATE TABLE roles (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(32)  NOT NULL UNIQUE,
    name        varchar(64)  NOT NULL,
    description text
);

-- Права доступа к модулям приложения (например, 'reviews.moderate')
CREATE TABLE permissions (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(64)  NOT NULL UNIQUE,
    module      varchar(32)  NOT NULL,          -- profile, schedule, chat, moderation ...
    description text
);

-- Права, входящие в роль (M:N)
CREATE TABLE role_permissions (
    role_id       smallint NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id smallint NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Роли пользователя (M:N); модератор может назначать роли
CREATE TABLE user_roles (
    user_id    bigint   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    smallint NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    granted_by bigint            REFERENCES users(id) ON DELETE SET NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

-- Индивидуальные права пользователя: поверх прав роли модератор может
-- выдать (is_granted = true) или отозвать (false) доступ к модулю
CREATE TABLE user_permissions (
    user_id       bigint   NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
    permission_id smallint NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    is_granted    boolean  NOT NULL,
    granted_by    bigint            REFERENCES users(id) ON DELETE SET NULL,
    granted_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, permission_id)
);

-- История блокировок: кто, когда, за что заблокировал и разблокировал
CREATE TABLE user_blocks (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_by   bigint          REFERENCES users(id) ON DELETE SET NULL,
    reason       text   NOT NULL CHECK (length(trim(reason)) > 0),
    blocked_at   timestamptz NOT NULL DEFAULT now(),
    blocked_until timestamptz,                         -- NULL = бессрочно
    unblocked_by bigint          REFERENCES users(id) ON DELETE SET NULL,
    unblocked_at timestamptz,
    CHECK (blocked_until IS NULL OR blocked_until > blocked_at),
    CHECK (unblocked_at  IS NULL OR unblocked_at >= blocked_at)
);
-- У пользователя может быть только одна активная блокировка
CREATE UNIQUE INDEX ux_user_blocks_active ON user_blocks(user_id) WHERE unblocked_at IS NULL;

-- Синхронизация users.status с активной блокировкой
CREATE FUNCTION sync_user_block_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.unblocked_at IS NULL THEN
        UPDATE users SET status = 'blocked' WHERE id = NEW.user_id AND status <> 'deleted';
    ELSE
        UPDATE users SET status = 'active'  WHERE id = NEW.user_id AND status = 'blocked';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_user_blocks_sync AFTER INSERT OR UPDATE OF unblocked_at ON user_blocks
    FOR EACH ROW EXECUTE FUNCTION sync_user_block_status();

-- Итоговые права пользователя = права ролей + выданные − отозванные
CREATE VIEW v_user_effective_permissions AS
SELECT u.id AS user_id, p.code AS permission, p.module
FROM users u
JOIN user_roles ur       ON ur.user_id = u.id
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p       ON p.id = rp.permission_id
WHERE NOT EXISTS (SELECT 1 FROM user_permissions up
                  WHERE up.user_id = u.id AND up.permission_id = p.id AND NOT up.is_granted)
UNION
SELECT up.user_id, p.code, p.module
FROM user_permissions up
JOIN permissions p ON p.id = up.permission_id
WHERE up.is_granted;

-- =====================================================================
-- 2. ПРОФИЛИ И СПРАВОЧНИКИ
-- =====================================================================

-- Профиль клиента (1:1 с users)
CREATE TABLE client_profiles (
    user_id    bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name varchar(64) NOT NULL,
    last_name  varchar(64),
    birth_date date CHECK (birth_date > '1900-01-01' AND birth_date < CURRENT_DATE),
    gender     gender_type,
    phone      varchar(20) CHECK (phone ~ '^\+?[0-9]{7,15}$'),
    avatar_key text,                                   -- ключ файла в хранилище
    about      text,                                   -- запрос клиента «о себе»
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_client_profiles_updated BEFORE UPDATE ON client_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Профессиональный профиль психолога (1:1 с users)
CREATE TABLE psychologist_profiles (
    user_id             bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name          varchar(64)  NOT NULL,
    last_name           varchar(64)  NOT NULL,
    middle_name         varchar(64),
    gender              gender_type  NOT NULL,
    birth_date          date,
    phone               varchar(20) CHECK (phone ~ '^\+?[0-9]{7,15}$'),
    avatar_key          text,
    headline            varchar(160),                -- короткая подпись в карточке
    bio                 text,                        -- описание опыта
    approach            text,                        -- как строится работа
    practice_since      date NOT NULL CHECK (practice_since <= CURRENT_DATE),
    verification_status verification_status NOT NULL DEFAULT 'draft',
    verified_at         timestamptz,
    is_published        boolean NOT NULL DEFAULT false, -- психолог сам скрывает/показывает анкету
    rating_avg          numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
    reviews_count       integer      NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),
    -- опубликовать можно только подтверждённую анкету
    CHECK (NOT is_published OR verification_status = 'verified')
);
CREATE TRIGGER trg_psychologist_profiles_updated BEFORE UPDATE ON psychologist_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX ix_psych_catalog ON psychologist_profiles(verification_status, is_published);

-- Справочник методов работы (КПТ, Гештальт ...)
CREATE TABLE methods (
    id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(32)  NOT NULL UNIQUE,
    name        varchar(64)  NOT NULL UNIQUE,
    description text
);

-- Справочник тем запросов (тревожность, выгорание ...)
CREATE TABLE topics (
    id   smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code varchar(32) NOT NULL UNIQUE,
    name varchar(64) NOT NULL UNIQUE
);

-- Справочник форматов сессий (индивидуальная, парная, с ребёнком)
CREATE TABLE session_formats (
    id               smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code             varchar(32) NOT NULL UNIQUE,
    name             varchar(64) NOT NULL UNIQUE,
    max_participants smallint    NOT NULL DEFAULT 1 CHECK (max_participants > 0)
);

-- Методы психолога (M:N)
CREATE TABLE psychologist_methods (
    psychologist_id bigint   NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    method_id       smallint NOT NULL REFERENCES methods(id) ON DELETE RESTRICT,
    PRIMARY KEY (psychologist_id, method_id)
);

-- Темы, с которыми работает психолог (M:N)
CREATE TABLE psychologist_topics (
    psychologist_id bigint   NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    topic_id        smallint NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
    PRIMARY KEY (psychologist_id, topic_id)
);
CREATE INDEX ix_psych_topics_topic ON psychologist_topics(topic_id);
CREATE INDEX ix_psych_methods_method ON psychologist_methods(method_id);

-- Услуги психолога: цена и длительность для каждого формата
CREATE TABLE psychologist_services (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    psychologist_id bigint   NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    format_id       smallint NOT NULL REFERENCES session_formats(id) ON DELETE RESTRICT,
    price           numeric(8,2) NOT NULL CHECK (price > 0),   -- BYN
    duration_min    smallint     NOT NULL DEFAULT 50 CHECK (duration_min BETWEEN 15 AND 240),
    is_active       boolean      NOT NULL DEFAULT true,
    UNIQUE (psychologist_id, format_id),
    UNIQUE (id, psychologist_id)          -- цель составного FK из appointments
);

-- =====================================================================
-- 3. ОБРАЗОВАНИЕ, ДОКУМЕНТЫ, ВЕРИФИКАЦИЯ
-- =====================================================================

-- Записи об образовании психолога
CREATE TABLE educations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    psychologist_id bigint NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    kind            education_kind NOT NULL,
    institution     varchar(255)   NOT NULL,
    specialty       varchar(255)   NOT NULL,
    year_start      smallint CHECK (year_start BETWEEN 1950 AND 2100),
    year_end        smallint CHECK (year_end   BETWEEN 1950 AND 2100),
    CHECK (year_end IS NULL OR year_start IS NULL OR year_end >= year_start)
);
CREATE INDEX ix_educations_psych ON educations(psychologist_id);

-- Загруженные документы (дипломы, сертификаты); сами файлы — в объектном хранилище
CREATE TABLE documents (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    psychologist_id bigint NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    education_id    bigint          REFERENCES educations(id) ON DELETE SET NULL,
    doc_type        document_type   NOT NULL,
    file_key        text            NOT NULL UNIQUE,
    original_name   varchar(255)    NOT NULL,
    mime_type       varchar(100)    NOT NULL
                    CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
    size_bytes      integer         NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520), -- до 20 МБ
    status          request_status  NOT NULL DEFAULT 'pending',
    reviewed_by     bigint          REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at     timestamptz,
    review_comment  text,
    uploaded_at     timestamptz     NOT NULL DEFAULT now(),
    -- отклонённый документ должен содержать комментарий модератора
    CHECK (status <> 'rejected' OR review_comment IS NOT NULL)
);
CREATE INDEX ix_documents_psych ON documents(psychologist_id);
CREATE INDEX ix_documents_pending ON documents(uploaded_at) WHERE status = 'pending';

-- Заявки психолога на подтверждение статуса специалиста (история проверок)
CREATE TABLE verification_requests (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    psychologist_id bigint NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    status          request_status NOT NULL DEFAULT 'pending',
    submitted_at    timestamptz    NOT NULL DEFAULT now(),
    reviewed_by     bigint         REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at     timestamptz,
    comment         text,
    CHECK (status <> 'rejected' OR comment IS NOT NULL),
    CHECK ((status = 'pending') = (reviewed_at IS NULL))
);
-- Одновременно может рассматриваться только одна заявка
CREATE UNIQUE INDEX ux_verification_pending ON verification_requests(psychologist_id)
    WHERE status = 'pending';

-- Заявка меняет статус профиля: подана → pending, одобрена → verified, отклонена → rejected
CREATE FUNCTION apply_verification_request() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE psychologist_profiles
       SET verification_status = CASE NEW.status
                                     WHEN 'pending'  THEN 'pending'::verification_status
                                     WHEN 'approved' THEN 'verified'::verification_status
                                     ELSE 'rejected'::verification_status END,
           verified_at  = CASE WHEN NEW.status = 'approved' THEN NEW.reviewed_at ELSE NULL END,
           is_published = CASE WHEN NEW.status = 'approved' THEN is_published ELSE false END
     WHERE user_id = NEW.psychologist_id;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_verification_apply AFTER INSERT OR UPDATE OF status ON verification_requests
    FOR EACH ROW EXECUTE FUNCTION apply_verification_request();

-- =====================================================================
-- 4. РАСПИСАНИЕ, ЗАПИСИ, ОПЛАТА
-- =====================================================================

-- Свободные слоты, которые психолог открывает для записи
CREATE TABLE schedule_slots (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    psychologist_id bigint NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    starts_at       timestamptz NOT NULL,
    ends_at         timestamptz NOT NULL,
    status          slot_status NOT NULL DEFAULT 'free',
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CHECK (ends_at - starts_at <= interval '4 hours'),
    UNIQUE (id, psychologist_id),               -- цель составного FK из appointments
    -- слоты одного психолога не могут пересекаться по времени
    CONSTRAINT ex_slots_no_overlap EXCLUDE USING gist (
        psychologist_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    )
);
CREATE INDEX ix_slots_free ON schedule_slots(psychologist_id, starts_at) WHERE status = 'free';

-- Запись клиента на консультацию
CREATE TABLE appointments (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id            bigint NOT NULL REFERENCES client_profiles(user_id) ON DELETE RESTRICT,
    psychologist_id      bigint NOT NULL,
    slot_id              bigint NOT NULL,
    service_id           bigint NOT NULL,
    status               appointment_status NOT NULL DEFAULT 'scheduled',
    price_at_booking     numeric(8,2) NOT NULL CHECK (price_at_booking > 0), -- цена фиксируется при записи
    client_note          text,                                               -- запрос клиента к сессии
    meeting_url          text,
    rescheduled_from_id  bigint REFERENCES appointments(id) ON DELETE SET NULL, -- цепочка переносов
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    -- составные FK гарантируют, что слот и услуга принадлежат тому же психологу
    FOREIGN KEY (slot_id, psychologist_id)
        REFERENCES schedule_slots(id, psychologist_id) ON DELETE RESTRICT,
    FOREIGN KEY (service_id, psychologist_id)
        REFERENCES psychologist_services(id, psychologist_id) ON DELETE RESTRICT,
    CHECK (client_id <> psychologist_id)
);
-- На один слот — не более одной действующей записи
CREATE UNIQUE INDEX ux_appointments_active_slot ON appointments(slot_id) WHERE status = 'scheduled';
CREATE INDEX ix_appointments_client ON appointments(client_id, created_at DESC);
CREATE INDEX ix_appointments_psych  ON appointments(psychologist_id, status);
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- История смены статусов записи с указанием причины (отмена/перенос)
CREATE TABLE appointment_status_history (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id bigint NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    old_status     appointment_status,                 -- NULL при создании записи
    new_status     appointment_status NOT NULL,
    changed_by     bigint REFERENCES users(id) ON DELETE SET NULL,
    reason         text,
    changed_at     timestamptz NOT NULL DEFAULT now(),
    -- отмена и перенос требуют причину
    CHECK (new_status NOT IN ('cancelled', 'rescheduled') OR length(trim(coalesce(reason, ''))) > 0)
);
CREATE INDEX ix_appt_history_appt ON appointment_status_history(appointment_id, changed_at);

-- Проверка слота при записи и перевод его в состояние «занят»
CREATE FUNCTION appointment_book_slot() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status slot_status;
    v_start  timestamptz;
BEGIN
    SELECT status, starts_at INTO v_status, v_start
      FROM schedule_slots WHERE id = NEW.slot_id FOR UPDATE;   -- блокировка от гонки

    IF v_status <> 'free' THEN
        RAISE EXCEPTION 'Слот % недоступен для записи (статус %)', NEW.slot_id, v_status
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_start <= now() THEN
        RAISE EXCEPTION 'Нельзя записаться на прошедшее время' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE schedule_slots SET status = 'booked' WHERE id = NEW.slot_id;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_appointments_book BEFORE INSERT ON appointments
    FOR EACH ROW EXECUTE FUNCTION appointment_book_slot();

-- При смене статуса: проверка допустимого перехода, освобождение слота, запись в историю.
-- Причина передаётся из backend: SELECT set_config('app.reason', 'Заболел', true);
CREATE FUNCTION appointment_status_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO appointment_status_history(appointment_id, old_status, new_status, changed_by)
        VALUES (NEW.id, NULL, NEW.status, app_user_id());
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    -- Менять можно только запланированную встречу
    IF OLD.status <> 'scheduled' THEN
        RAISE EXCEPTION 'Недопустимый переход статуса: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    -- Отметить встречу проведённой или неявкой можно только после её начала
    IF NEW.status IN ('completed', 'no_show') AND
       (SELECT starts_at FROM schedule_slots WHERE id = NEW.slot_id) > now() THEN
        RAISE EXCEPTION 'Консультация ещё не началась' USING ERRCODE = 'check_violation';
    END IF;

    -- Отмена/перенос освобождают слот, если он ещё в будущем
    IF NEW.status IN ('cancelled', 'rescheduled') THEN
        UPDATE schedule_slots SET status = 'free'
         WHERE id = NEW.slot_id AND starts_at > now();
    END IF;

    INSERT INTO appointment_status_history(appointment_id, old_status, new_status, changed_by, reason)
    VALUES (NEW.id, OLD.status, NEW.status, app_user_id(),
            NULLIF(current_setting('app.reason', true), ''));
    RETURN NEW;
END $$;
CREATE TRIGGER trg_appointments_status AFTER INSERT OR UPDATE OF status ON appointments
    FOR EACH ROW EXECUTE FUNCTION appointment_status_change();

-- Оплата консультации
CREATE TABLE payments (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id      bigint NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
    amount              numeric(8,2) NOT NULL CHECK (amount > 0),
    currency            char(3)      NOT NULL DEFAULT 'BYN',
    status              payment_status NOT NULL DEFAULT 'pending',
    provider            varchar(32)  NOT NULL,          -- платёжный шлюз
    provider_payment_id varchar(128) UNIQUE,            -- id транзакции у провайдера
    paid_at             timestamptz,
    refunded_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'paid'     OR paid_at     IS NOT NULL),
    CHECK (status <> 'refunded' OR refunded_at IS NOT NULL)
);
CREATE INDEX ix_payments_appt ON payments(appointment_id);
-- Одна успешная оплата на запись
CREATE UNIQUE INDEX ux_payments_paid ON payments(appointment_id) WHERE status = 'paid';

-- =====================================================================
-- 5. ОТЗЫВЫ
-- =====================================================================

-- Отзыв привязан к конкретной проведённой консультации (не более одного)
CREATE TABLE reviews (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id     bigint   NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
    client_id          bigint   NOT NULL REFERENCES client_profiles(user_id) ON DELETE CASCADE,
    psychologist_id    bigint   NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    rating             smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body               text CHECK (body IS NULL OR length(body) <= 3000),
    is_anonymous       boolean  NOT NULL DEFAULT false,
    status             moderation_status NOT NULL DEFAULT 'pending',
    moderated_by       bigint   REFERENCES users(id) ON DELETE SET NULL,
    moderated_at       timestamptz,
    moderation_comment text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'rejected' OR moderation_comment IS NOT NULL)
);
CREATE INDEX ix_reviews_psych ON reviews(psychologist_id, created_at DESC) WHERE status = 'approved';
CREATE INDEX ix_reviews_pending ON reviews(created_at) WHERE status = 'pending';
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Отзыв можно оставить только по своей завершённой консультации
CREATE FUNCTION review_check_appointment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    a appointments%ROWTYPE;
BEGIN
    SELECT * INTO a FROM appointments WHERE id = NEW.appointment_id;
    IF a.status <> 'completed' THEN
        RAISE EXCEPTION 'Отзыв доступен только после проведённой консультации'
            USING ERRCODE = 'check_violation';
    END IF;
    IF a.client_id <> NEW.client_id OR a.psychologist_id <> NEW.psychologist_id THEN
        RAISE EXCEPTION 'Отзыв не соответствует участникам консультации'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_reviews_check BEFORE INSERT ON reviews
    FOR EACH ROW EXECUTE FUNCTION review_check_appointment();

-- Пересчёт рейтинга психолога по одобренным отзывам
CREATE FUNCTION review_recalc_rating() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_psych bigint := COALESCE(NEW.psychologist_id, OLD.psychologist_id);
BEGIN
    UPDATE psychologist_profiles p
       SET rating_avg    = COALESCE(s.avg_rating, 0),
           reviews_count = s.cnt
      FROM (SELECT round(avg(rating), 2) AS avg_rating, count(*) AS cnt
              FROM reviews WHERE psychologist_id = v_psych AND status = 'approved') s
     WHERE p.user_id = v_psych;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_reviews_rating AFTER INSERT OR DELETE OR UPDATE OF status, rating ON reviews
    FOR EACH ROW EXECUTE FUNCTION review_recalc_rating();

-- =====================================================================
-- 6. ЧАТ
-- =====================================================================

-- Диалог между клиентом и психологом (один на пару)
CREATE TABLE conversations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id       bigint NOT NULL REFERENCES client_profiles(user_id) ON DELETE CASCADE,
    psychologist_id bigint NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz,
    UNIQUE (client_id, psychologist_id)
);
CREATE INDEX ix_conv_psych ON conversations(psychologist_id, last_message_at DESC);
CREATE INDEX ix_conv_client ON conversations(client_id, last_message_at DESC);

-- Сообщения чата (доставка в реальном времени — через Socket.IO + Redis pub/sub)
CREATE TABLE messages (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            text CHECK (body IS NULL OR length(body) <= 5000),
    attachment_key  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    edited_at       timestamptz,
    read_at         timestamptz,
    deleted_at      timestamptz,                     -- мягкое удаление
    CHECK (body IS NOT NULL OR attachment_key IS NOT NULL)
);
CREATE INDEX ix_messages_conv ON messages(conversation_id, created_at DESC);
CREATE INDEX ix_messages_unread ON messages(conversation_id) WHERE read_at IS NULL;

-- Отправитель должен быть участником диалога; обновляем время последнего сообщения
CREATE FUNCTION message_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM conversations
     WHERE id = NEW.conversation_id AND NEW.sender_id IN (client_id, psychologist_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Пользователь % не участник диалога %', NEW.sender_id, NEW.conversation_id
            USING ERRCODE = 'check_violation';
    END IF;
    UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_messages_insert BEFORE INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION message_before_insert();

-- =====================================================================
-- 7. УВЕДОМЛЕНИЯ И ЖУРНАЛ ДЕЙСТВИЙ
-- =====================================================================

-- Уведомления пользователю (запись, отмена, решение модератора ...)
CREATE TABLE notifications (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       varchar(48) NOT NULL,        -- appointment.cancelled, review.approved ...
    title      varchar(160) NOT NULL,
    body       text,
    payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- ссылки на сущности
    read_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- Журнал действий модераторов и важных событий безопасности
CREATE TABLE audit_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id    bigint      REFERENCES users(id) ON DELETE SET NULL,
    action      varchar(64) NOT NULL,       -- user.block, role.grant, document.approve ...
    entity_type varchar(32) NOT NULL,
    entity_id   bigint,
    details     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    ip          inet,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX ix_audit_actor  ON audit_log(actor_id, created_at DESC);

-- =====================================================================
-- 8. ПРЕДСТАВЛЕНИЯ
-- =====================================================================

-- Каталог: только подтверждённые, опубликованные и не заблокированные психологи
CREATE VIEW v_psychologist_catalog AS
SELECT p.user_id                                         AS psychologist_id,
       p.first_name, p.last_name, p.gender, p.avatar_key, p.headline,
       EXTRACT(YEAR FROM age(CURRENT_DATE, p.practice_since))::int AS experience_years,
       p.rating_avg, p.reviews_count,
       (SELECT min(s.price) FROM psychologist_services s
         WHERE s.psychologist_id = p.user_id AND s.is_active)        AS price_from,
       ARRAY(SELECT m.name FROM psychologist_methods pm JOIN methods m ON m.id = pm.method_id
              WHERE pm.psychologist_id = p.user_id ORDER BY m.name)  AS methods,
       ARRAY(SELECT t.name FROM psychologist_topics pt JOIN topics t ON t.id = pt.topic_id
              WHERE pt.psychologist_id = p.user_id ORDER BY t.name)  AS topics,
       ARRAY(SELECT f.name FROM psychologist_services s JOIN session_formats f ON f.id = s.format_id
              WHERE s.psychologist_id = p.user_id AND s.is_active ORDER BY f.id) AS formats,
       (SELECT min(sl.starts_at) FROM schedule_slots sl
         WHERE sl.psychologist_id = p.user_id AND sl.status = 'free'
           AND sl.starts_at > now())                                 AS nearest_slot
FROM psychologist_profiles p
JOIN users u ON u.id = p.user_id
WHERE p.verification_status = 'verified'
  AND p.is_published
  AND u.status = 'active';

-- Консультации клиента: предстоящие и прошедшие (для личного кабинета)
CREATE VIEW v_client_appointments AS
SELECT a.id, a.client_id, a.psychologist_id,
       p.first_name || ' ' || p.last_name AS psychologist_name,
       f.name                             AS format,
       sl.starts_at, sl.ends_at, a.status, a.price_at_booking,
       (sl.starts_at > now() AND a.status = 'scheduled') AS is_upcoming,
       EXISTS (SELECT 1 FROM reviews r WHERE r.appointment_id = a.id) AS has_review
FROM appointments a
JOIN schedule_slots        sl ON sl.id = a.slot_id
JOIN psychologist_services s  ON s.id  = a.service_id
JOIN session_formats       f  ON f.id  = s.format_id
JOIN psychologist_profiles p  ON p.user_id = a.psychologist_id;

COMMIT;
