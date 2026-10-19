# «Рядом» – веб-приложение для поиска психолога

Курсовой проект по дисциплине «Современные технологии разработки web-приложений» (БГТУ, ФИТ, кафедра программной инженерии).
Тема: веб-приложение для поиска специалистов в сфере ментального здоровья.

Сервис соединяет клиентов с психологами, которые прошли проверку документов: каталог с фильтрами, анкета подбора,
запись на онлайн-сессии, перенос и отмена с указанием причины, чат, отзывы. У модератора есть панель для пользователей,
заявок психологов, отзывов, ролей и журнала действий.

## Состояние

| Часть | Готовность |
|---|---|
| Интерфейс (`frontend/`) | готов: 25 страниц, все работают на API; без сервера – на демо-данных |
| База данных (`database/`) | спроектирована: PostgreSQL 16, 24 таблицы, триггеры бизнес-правил; Redis – сессии и временные данные (redis.md) |
| Сервер на Node.js (`backend/`), Docker | готов: вход и роли, каталог, профили, подбор, расписание, записи, чат, отзывы, модерация – см. [API](#api) |
| Тесты (`backend/tests/`) | идут по частям: Jest + supertest в Docker – см. [Тесты](#тесты) |

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
`"status": "ok"`, у `postgres` – `"tables": 24`, у `redis` – `"status": "ok"`. Если БД или Redis недоступны,
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
| `GET /api/references` | справочники: методы, темы, форматы (коды и названия) | все |
| `GET /api/psychologists` | каталог: `q`, `topic`, `method`, `format` (коды через запятую), `gender`, `expMin`, `expMax`, `priceMax`, `date`, `time`, `part` (`morning`/`day`/`evening`), `sort` (`rating`/`soon`/`cheap`/`expensive`/`exp`), `page`, `limit`; в ответе `facets` – сколько психологов по методам, форматам, дням и времени | все |
| `GET /api/psychologists/:id` | страница психолога: анкета, услуги с ценами, образование, ближайшее окно | все |
| `POST /api/matching` | подбор по анкете: `format`, `topics`, `gender`, `age` (`young`/`older`), `method`, `parts`, `soon` → три лучших с причинами | все |
| `GET /api/profile` | свой профиль: клиента – личные данные, психолога – анкета, методы, темы, услуги, документы | вошедшие |
| `PATCH /api/profile` | изменить свой профиль (только переданные поля); клиент выбирает готовый аватар: `avatar: "a01"`…`"a12"` или `null` | право `profile.edit_own` |
| `DELETE /api/profile` | психолог – удалить анкету вместе с фото и сканами документов (если нет истории консультаций); клиент – удалить аккаунт (если нет предстоящих сессий) | право `profile.edit_own` |
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
| `GET /api/conversations` | мои диалоги: собеседник, «в сети», последнее сообщение, непрочитанные, ближайшая встреча | право `chat.use` |
| `GET /api/conversations/unread` | непрочитанные: всего и по диалогам | право `chat.use` |
| `POST /api/conversations` | начать или открыть диалог: клиент – `psychologistId`, психолог – `clientId` своего клиента | право `chat.use` |
| `GET /api/conversations/:id/messages` | сообщения страницами (`before`, `limit`) и события записей пары | участники диалога |
| `POST /api/conversations/:id/messages` | отправить сообщение: `body` | участники диалога |
| `POST /api/conversations/:id/read` | отметить входящие прочитанными | участники диалога |
| `POST /api/conversations/:id/attachments` | сообщение с файлом (multipart: `file`, `body`), до 10 МБ | участники диалога |
| `GET /api/conversations/:id/messages/:messageId/attachment` | скачать файл из сообщения | участники диалога |
| `POST /api/profile/avatar` | фото профиля (multipart: `file`, JPG/PNG/WEBP до 5 МБ); `DELETE` – убрать | право `profile.edit_own` |
| `POST /api/profile/documents` | диплом или сертификат (multipart: `file`, `type`, `institution`, `specialty`, `year`), до 20 МБ | право `documents.upload` (психолог) |
| `DELETE /api/profile/documents/:id`, `GET …/:id/file` | удалить непроверенный документ, открыть свой скан | право `documents.upload` |
| `GET /api/profile/verification` | статус проверки, документы, история заявок | право `documents.upload` |
| `POST /api/profile/verification` | отправить анкету на проверку (нужны подпись, описание, методы, темы, цена и документ) | право `documents.upload` |
| `GET /api/reviews` | мои отзывы со статусом проверки и комментарием модератора | право `reviews.create` (клиент) |
| `POST /api/reviews` | отзыв по своей проведённой консультации: `appointmentId`, `rating`, `body`, `anonymous` | право `reviews.create` |
| `PATCH /api/reviews/:id`, `DELETE` | изменить (снова на проверку) или удалить свой отзыв | право `reviews.create` |
| `GET /api/psychologists/:id/reviews` | опубликованные отзывы и сводка по оценкам | все |
| `GET /api/psychologists/me/reviews` | отзывы о себе с ответами и жалобами | право `reviews.reply` (психолог) |
| `PUT /api/reviews/:id/reply`, `DELETE` | ответ психолога на отзыв о себе (`text`) | право `reviews.reply` |
| `POST /api/reviews/:id/report` | жалоба модератору на отзыв о себе: `reason` | право `reviews.reply` |
| `GET /api/admin/users` | пользователи: `q`, `role`, `status`, `page` | право `users.view` (модератор) |
| `GET /api/admin/users/:id` | карточка: профиль, записи, история блокировок | право `users.view` |
| `PATCH /api/admin/users/:id` | правка профиля пользователя (почта не меняется) | право `users.edit` |
| `POST /api/admin/users/:id/block`, `…/unblock` | блокировка с причиной и сроком `until` (сессии и чат обрываются сразу), разблокировка | право `users.block` |
| `PUT /api/admin/users/:id/roles` | роли пользователя: `client`, `psychologist` | право `roles.assign` |
| `GET /api/admin/roles` | роли с правами и список всех прав | право `roles.assign` |
| `PUT /api/admin/roles/:code/permissions` | права роли: `permissions` (у модератора нельзя убрать `roles.assign`) | право `roles.assign` |
| `GET /api/admin/verification-requests` | заявки психологов (`status`) с анкетой и документами | право `psychologists.verify` |
| `PATCH /api/admin/verification-requests/:id` | решение: `approved` или `rejected` с комментарием | право `psychologists.verify` |
| `GET /api/admin/documents/:id/file` | скан документа | право `psychologists.verify` |
| `GET /api/admin/reviews`, `PATCH …/:id` | отзывы на проверке; публикация или отклонение с комментарием | право `reviews.moderate` |
| `GET /api/admin/review-reports`, `PATCH …/:id` | жалобы психологов; решение `hide` (снять отзыв) или `keep` с комментарием | право `reviews.moderate` |
| `GET /api/admin/audit` | журнал действий модераторов: `action` (`user.` – все по началу), `actorId`, `q`, `page` | право `audit.view` |

Каталог показывает только психологов с проверенными документами и опубликованной анкетой; выдача кэшируется в Redis
на 5 минут и сбрасывается, когда психолог меняет анкету. Опубликовать анкету можно только после проверки модератором.

Записи: время – по Минску; отменить и перенести можно до начала встречи, с причиной, которую видит другая сторона.
При переносе старая запись получает статус «перенесена», новая ссылается на неё – в истории видно «с 12:30 на 15:00».
Занятость окна, допустимость смены статуса и запись истории дополнительно проверяют триггеры БД; одно окно не займут
двое, даже если нажмут одновременно.

Чат в реальном времени – Socket.IO на том же адресе (`/socket.io/`, клиентская библиотека – `/socket.io/socket.io.js`),
вход по той же cookie. Сервер шлёт `message:new`, `messages:read`, `typing`, `presence`; клиент отправляет
`message:send { conversationId, body }`, `messages:read { conversationId }` (ответ – в подтверждении) и `typing`.
Сообщения хранятся в PostgreSQL, «в сети», «печатает…» и счётчики непрочитанных – в Redis. Несколько экземпляров
сервера связаны Redis-адаптером: проверено с `docker compose up -d --scale api=2` (клиенту нужен транспорт `websocket`).

Файлы лежат в томе Docker `uploads`: фото профилей nginx отдаёт по адресу `/uploads/avatars/…`, а документы психологов
и файлы из чата – только API после проверки прав. Тип файла определяется по содержимому, а не по расширению.
Отзыв публикуется после проверки модератором; рейтинг психолога по опубликованным отзывам пересчитывает триггер БД.
Каждое действие модератора записывается в журнал (`audit_log`).

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
| `grin.sv@mail.ru`, `t.aliev@gmail.com`, `yulia.kov@ryadom.by` | психологи, чьи заявки ждут проверки |
| `dk_1990@yandex.by` | заблокированный клиент – вход отклоняется с причиной блокировки |

В `demo.sql` – 12 психологов из `js/data.js` с методами, темами, ценами и дипломами, свободные окна на 4 недели вперёд
от дня создания базы, записи Анны и клиентов Марины Волковой (предстоящие, прошедшие, отменённые, перенесённая)
переписка из демо-чата, отзывы (опубликованные, на проверке, отклонённый, с ответом, с жалобами), заявки трёх
новых психологов с документами и журнал действий модератора. Сканы демо-документов – образцы из `backend/demo-files`. Чтобы окна снова начинались с сегодняшнего дня – `docker compose down -v && docker compose up -d`.

Пример проверки из терминала (cookie сохраняются в файл):

```bash
curl -c /tmp/ryadom.jar -H 'Content-Type: application/json' -d '{"email":"anna@mail.com","password":"demo1234"}' http://localhost/api/auth/login
```

```bash
curl -b /tmp/ryadom.jar http://localhost/api/auth/me
```

## Тесты

Jest + supertest, в отдельном контейнере `tests` (запускается только по требованию):

```bash
docker compose --profile test run --rm tests
```

Тесты работают со своей базой `ryadom_test` (пересоздаётся из `schema.sql`, `seed.sql`, `demo.sql` при каждом запуске)
и своей базой Redis (номер 1) – данные сайта не трогаются; на другой базе тесты не запустятся.
Покрытие кода: `docker compose --profile test run --rm tests npm run test:coverage`.

| Файл | Что проверяет |
|---|---|
| `tests/unit/validation.test.js` | проверка полей: даты, текст, числа, телефон, одна ошибка 422 со всеми полями |
| `tests/api/health.test.js` | состояние сервера, формат ошибок (404, неверный JSON) |
| `tests/api/auth.test.js` | регистрация, вход, cookie сессии, истёкший токен и /refresh, выход, блокировка, ограничение попыток |
| `tests/api/access.test.js` | права ролей: кто из гостя, клиента, психолога и модератора куда может зайти |

## Только интерфейс, без Docker

Для работы над страницами хватит Python 3, он есть в macOS и большинстве Linux.

```bash
python3 tools/dev-server.py
```

Затем откройте <http://localhost:5173>. Сервер отдаёт папку `frontend/`, запрещает кэширование (правки видны сразу)
и показывает свою страницу 404 на несуществующие адреса. API в этом режиме нет – страницы работают на демо-данных.

## Вход на сайте

Страницы получают данные через `frontend/js/api.js`: в Docker – с сервера, без сервера (`tools/dev-server.py`
или файл с диска) – из демо-слоя `js/api-demo.js` в том же виде, что у API. Шапка показывает, кто вошёл
(`js/session.js`), «Выйти» завершает сессию, кабинеты открываются только своей роли: без входа – переход на вход
и возврат обратно после него.

Без сервера вход демонстрационный: роль определяется по почте, пароль – любой.

| Почта | Кто откроется в демо |
|---|---|
| `marina@ryadom.by` | психолог Марина Волкова – кабинет психолога |
| `moderator@ryadom.by` | модератор – панель модерации |
| любая другая | клиент Анна – кабинет клиента |

Перевод страниц на API идёт частями: общий слой, вход, каталог, страница психолога с записью, анкета подбора,
кабинет клиента (профиль, сессии с отменой и переносом, отзывы), чат с сообщениями в реальном времени и анкета
психолога (фото, методы, темы, цены по форматам, документы, заявка на проверку, показ в каталоге) и записи
психолога (отметка «состоялась / не пришёл», отмена, перенос на своё окно) и расписание (окна по неделям, добавление
пачкой, закрыть / открыть / удалить, закрыть день) и отзывы психолога (ответ, жалоба модератору) готовы – кабинет
психолога работает на API целиком. В панели модератора на API – пользователи (поиск, имя, роли, блокировка
с историей), заявки психологов (анкета, сканы документов, подтверждение или отказ с комментарием) и отзывы
(публикация или отказ, жалобы психологов: оставить или скрыть), роли с правами (матрица «право × роль»)
и журнал действий. Все страницы сайта работают на API; без сервера – на демо-данных `js/data.js` через `js/api-demo.js`.

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
  js/api.js      запросы к API; js/api-demo.js – те же ответы без сервера; js/session.js – кто вошёл
  js/data.js     демо-данные (источник для js/api-demo.js)
backend/         сервер на Node.js + Express, Dockerfile
  src/routes/        HTTP: разбор запроса и ответ
  src/services/      бизнес-логика
  src/repositories/  весь SQL и запросы к Redis – только здесь
  src/db/            пул PostgreSQL и клиент Redis
  src/middleware/    журнал запросов, обработка ошибок и 404 для /api, проверка входа и прав
  src/socket/        Socket.IO: чат в реальном времени (события из src/realtime.js)
  src/config.js      настройки из переменных окружения
  tests/             Jest + supertest: unit/ – отдельные функции, api/ – запросы к API, helpers.js
database/        schema.sql (таблицы, ограничения, триггеры), seed.sql (роли, справочники),
                 demo.sql (демо-аккаунты), redis.md
nginx/           default.conf – раздача frontend/, прокси /api и /socket.io, страница 404
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
