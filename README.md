# «Рядом» – веб-приложение для поиска психолога

Курсовой проект по дисциплине «Современные технологии разработки web-приложений» (БГТУ, ФИТ, кафедра программной инженерии).
Тема: веб-приложение для поиска специалистов в сфере ментального здоровья.

Сервис соединяет клиентов с психологами, которые прошли проверку документов: каталог с фильтрами, анкета подбора,
запись на онлайн-сессии, перенос и отмена с указанием причины, чат, отзывы. У модератора есть панель для пользователей,
заявок психологов, отзывов, ролей и журнала действий.

## Состояние

| Часть | Готовность |
|---|---|
| Интерфейс (`frontend/`) | готов: 25 страниц, статичный HTML/CSS/JS с демо-данными |
| База данных (`database/`) | спроектирована: PostgreSQL 16, 23 таблицы, триггеры бизнес-правил; Redis – сессии и временные данные (redis.md) |
| Сервер на Node.js (`backend/`), Docker | в работе: каркас по слоям, PostgreSQL и Redis, вход и роли, каталог, профили, подбор, расписание и записи – см. [API](#api) |

## Запуск в Docker

Нужен Docker с Compose. Приложение состоит из четырёх контейнеров:

| Сервис | Что делает |
|---|---|
| `nginx` | отдаёт страницы из `frontend/`, проксирует `/api` на сервер, показывает свою страницу 404 |
| `api` | сервер на Node.js + Express (`backend/`), наружу открыт только через nginx |
| `postgres` | PostgreSQL 16; при первом старте сам выполняет `database/schema.sql`, `seed.sql` и `demo.sql` |
| `redis` | сессии и временные данные (`database/redis.md`) |

Первый запуск – скопировать настройки и задать свои пароли в `.env` (в git он не попадает):

```bash
cp .env.example .env
```

```bash
docker compose up --build
```

Затем откройте <http://localhost> – сайт, <http://localhost/api/health> – состояние сервера:
`"status": "ok"`, у `postgres` – `"tables": 23`, у `redis` – `"status": "ok"`. Если БД или Redis недоступны,
ответ – `503` и `"status": "degraded"` с текстом ошибки.

Полезные команды:

| Команда | Зачем |
|---|---|
| `docker compose up -d --build` | запустить в фоне (после правок в `backend/` – обязательно с `--build`) |
| `docker compose logs -f api` | журнал запросов сервера |
| `docker compose exec postgres psql -U ryadom -d ryadom` | консоль БД (пользователь и база – из `.env`) |
| `docker compose down` | остановить; данные БД и Redis сохраняются в томах `pgdata`, `redisdata` |
| `docker compose down -v` | остановить и удалить данные – при следующем запуске схема и справочники загрузятся заново |

Правки в `frontend/` видны после обновления страницы, без перезапуска: nginx читает папку напрямую и запрещает браузеру
брать файлы из кэша без проверки. После правки `nginx/default.conf` – `docker compose exec nginx nginx -s reload`.
PostgreSQL доступен клиентам БД (DBeaver, DataGrip) на `localhost:5432` (порт меняется в `.env`, только с этого компьютера).
SQL-файлы из `database/` применяются только к пустому тому: после правки схемы нужен `docker compose down -v`.

## API

Все адреса – через nginx: `http://localhost/api/...`. Ошибки приходят в одном виде:
`{ "error": { "code", "message", "fields" } }`, где `fields` – ошибки по полям формы.

| Запрос | Что делает | Доступ |
|---|---|---|
| `GET /api/health` | состояние сервера, PostgreSQL и Redis | все |
| `POST /api/auth/register` | регистрация: `role` (`client`/`psychologist`), `name`, `email`, `password`; психологу ещё `lastName`, `gender` (`male`/`female`), `practiceSince` (`ГГГГ-ММ-ДД`) | все |
| `POST /api/auth/login` | вход: `email`, `password`, `remember` | все |
| `POST /api/auth/refresh` | новая пара токенов, когда access-токен истёк (`401 TOKEN_EXPIRED`) | по cookie сессии |
| `POST /api/auth/logout` | выход на этом устройстве | по cookie сессии |
| `GET /api/auth/me` | кто вошёл: роли, права, имя | вошедшие |
| `GET /api/roles` | роли и права | право `roles.assign` (модератор) |
| `GET /api/references` | справочники: методы, темы, форматы (коды и названия) | все |
| `GET /api/psychologists` | каталог: `q`, `topic`, `method`, `format` (коды через запятую), `gender`, `expMin`, `expMax`, `priceMax`, `date`, `time`, `part` (`morning`/`day`/`evening`), `sort` (`rating`/`soon`/`cheap`/`expensive`/`exp`), `page`, `limit` | все |
| `GET /api/psychologists/:id` | страница психолога: анкета, услуги с ценами, образование, ближайшее окно | все |
| `POST /api/matching` | подбор по анкете: `format`, `topics`, `gender`, `age` (`young`/`older`), `method`, `parts`, `soon` → три лучших с причинами | все |
| `GET /api/profile` | свой профиль: клиента – личные данные, психолога – анкета, методы, темы, услуги, документы | вошедшие |
| `PATCH /api/profile` | изменить свой профиль (только переданные поля) | право `profile.edit_own` |
| `DELETE /api/profile` | удалить анкету психолога (если нет истории консультаций) | право `profile.edit_own` |
| `GET /api/psychologists/:id/slots` | свободные окна психолога для записи: `from`, `to` (по умолчанию – 2 недели) | все |
| `GET /api/schedule/slots` | своё расписание за `from`…`to`: окна и записанные клиенты | право `schedule.manage` (психолог) |
| `POST /api/schedule/slots` | новые окна пачкой: `slots: [{ date, time }]`, `durationMin`; пересечения и прошедшее время пропускаются | право `schedule.manage` |
| `PATCH /api/schedule/slots/:id` | закрыть (`blocked`) или открыть (`free`) окно | право `schedule.manage` |
| `DELETE /api/schedule/slots/:id` | удалить окно без записей | право `schedule.manage` |
| `POST /api/schedule/block-day` | закрыть все свободные окна дня: `date` | право `schedule.manage` |
| `GET /api/appointments` | свои записи: `scope` (`upcoming`/`past`/`cancelled`/`all`), история и доступные действия | вошедшие |
| `GET /api/appointments/:id` | запись с историей статусов и переносов | участники записи |
| `POST /api/appointments` | записаться: `slotId`, `format`, `note`; цена фиксируется | право `appointments.book` (клиент) |
| `PATCH /api/appointments/:id` | отмена: `status: cancelled` + `reason`; после встречи психолог отмечает `completed` или `no_show` | право `appointments.manage_own` |
| `POST /api/appointments/:id/reschedule` | перенос на другое окно того же психолога: `slotId`, `reason` | право `appointments.manage_own` |

Каталог показывает только психологов с проверенными документами и опубликованной анкетой; выдача кэшируется в Redis
на 5 минут и сбрасывается, когда психолог меняет анкету. Опубликовать анкету можно только после проверки модератором.

Записи: время – по Минску; отменить и перенести можно до начала встречи, с причиной, которую видит другая сторона.
При переносе старая запись получает статус «перенесена», новая ссылается на неё – в истории видно «с 12:30 на 15:00».
Занятость окна, допустимость смены статуса и запись истории дополнительно проверяют триггеры БД; одно окно не займут
двое, даже если нажмут одновременно.

Вход: access-токен (JWT, 15 минут) и refresh-токен (30 дней, без «Запомнить меня» – сутки) лежат в httpOnly-cookie,
сессии – в Redis (`database/redis.md`). Права проверяются по таблице `role_permissions`. Вход – не больше 10 неудачных
попыток за 15 минут с одного адреса.

Демо-аккаунты из `database/demo.sql` (пароль у всех `demo1234`):

| Почта | Кто |
|---|---|
| `anna@mail.com` | клиент Анна Петрова |
| `marina@ryadom.by` | психолог Марина Волкова, документы проверены |
| `a.lukashevich@ryadom.by`, `o.ermak@ryadom.by` … | остальные 11 психологов каталога (почты – в `database/demo.sql`) |
| `moderator@ryadom.by` | модератор |
| `dk_1990@yandex.by` | заблокированный клиент – вход отклоняется с причиной блокировки |

В `demo.sql` – 12 психологов из `js/data.js` с методами, темами, ценами и дипломами, свободные окна на 4 недели вперёд
от дня создания базы и записи Анны и клиентов Марины Волковой (предстоящие, прошедшие, отменённые, перенесённая). Чтобы окна снова начинались с сегодняшнего дня – `docker compose down -v && docker compose up -d`.

Пример проверки из терминала (cookie сохраняются в файл):

```bash
curl -c /tmp/ryadom.jar -H 'Content-Type: application/json' -d '{"email":"anna@mail.com","password":"demo1234"}' http://localhost/api/auth/login
```

```bash
curl -b /tmp/ryadom.jar http://localhost/api/auth/me
```

## Только интерфейс, без Docker

Для работы над страницами хватит Python 3, он есть в macOS и большинстве Linux.

```bash
python3 tools/dev-server.py
```

Затем откройте <http://localhost:5173>. Сервер отдаёт папку `frontend/`, запрещает кэширование (правки видны сразу)
и показывает свою страницу 404 на несуществующие адреса. API в этом режиме нет – страницы работают на демо-данных.

## Вход на сайте

Форма `login.html` работает через API: в Docker вход и регистрация настоящие – с проверкой пароля, блокировок и
ошибками под полями. После входа открывается кабинет по роли. Психолог при регистрации указывает ещё фамилию, пол и год
начала практики – без них анкету не показать в каталоге. Кабинеты пока показывают демо-данные из `js/data.js`.

Без Docker (`tools/dev-server.py` или страница открыта файлом) API нет, и форма работает как демо: роль определяется
по почте, пароль – любой.

| Почта | Кто откроется в демо |
|---|---|
| `marina@ryadom.by` | психолог Марина Волкова – кабинет психолога |
| `moderator@ryadom.by` | модератор – панель модерации |
| любая другая | клиент Анна – кабинет клиента |

## Страницы

- **Для всех:** главная (`index`), каталог психологов (`catalog`), профиль психолога (`psychologist`), анкета подбора (`quiz`),
  тарифы (`tariffs`), психологам (`for-psychologists`), о нас (`about`), политика конфиденциальности (`privacy`),
  вход и регистрация (`login`), восстановление пароля (`forgot`), страница 404.
- **Клиент:** профиль (`cabinet-client`), сессии (`client-sessions`), чат (`client-chat`), отзывы (`client-reviews`).
- **Психолог:** профиль и документы (`cabinet-psychologist`), записи (`psy-sessions`), расписание (`psy-schedule`),
  чат (`psy-chat`), отзывы (`psy-reviews`).
- **Модератор:** пользователи (`mod-users`), заявки психологов (`mod-verification`), отзывы (`mod-reviews`),
  роли и права (`mod-roles`), журнал действий (`mod-audit`).

## Структура

```
frontend/        интерфейс: *.html, css/, js/, assets/ (картинки, иконки)
  js/data.js     демо-данные, которые позже придут из API
backend/         сервер на Node.js + Express, Dockerfile
  src/routes/        HTTP: разбор запроса и ответ
  src/services/      бизнес-логика
  src/repositories/  весь SQL и запросы к Redis – только здесь
  src/db/            пул PostgreSQL и клиент Redis
  src/middleware/    журнал запросов, обработка ошибок и 404 для /api
  src/config.js      настройки из переменных окружения
database/        schema.sql (таблицы, ограничения, триггеры), seed.sql (роли, справочники),
                 demo.sql (демо-аккаунты), redis.md
nginx/           default.conf – раздача frontend/, прокси /api, страница 404
docker-compose.yml, .env.example   четыре контейнера и пример настроек
docs/            материалы для записки
tools/           dev-server.py – локальный сервер; er-drawio.py, use-case.py – генераторы диаграмм
```

## Диаграммы для пояснительной записки

| Диаграмма | Файлы |
|---|---|
| Вариантов использования (UML) | [docs/use-case.png](docs/use-case.png) · [.svg](docs/use-case.svg) · [.drawio](docs/use-case.drawio) |
| Логическая схема базы данных | [database/er-diagram.png](database/er-diagram.png) · [.svg](database/er-diagram.svg) · [.drawio](database/er-diagram.drawio) |

Файлы `.drawio` открываются в [draw.io](https://app.diagrams.net). Чтобы пересобрать диаграммы после правки схемы:

```bash
python3 tools/er-drawio.py database/schema.sql > database/er-diagram.drawio
```

```bash
python3 tools/use-case.py > docs/use-case.drawio
```

Те же команды с флагом `--svg` выдают картинку SVG.

## Автор

Гончар Александр Сергеевич, группа 2. Руководитель – В. С. Кантарович. Срок сдачи – 7 декабря 2026 г.
