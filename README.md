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
| Сервер на Node.js (`backend/`), Docker | в работе: каркас по слоям, подключение к PostgreSQL и Redis, `GET /api/health` |

## Запуск в Docker

Нужен Docker с Compose. Приложение состоит из четырёх контейнеров:

| Сервис | Что делает |
|---|---|
| `nginx` | отдаёт страницы из `frontend/`, проксирует `/api` на сервер, показывает свою страницу 404 |
| `api` | сервер на Node.js + Express (`backend/`), наружу открыт только через nginx |
| `postgres` | PostgreSQL 16; при первом старте сам выполняет `database/schema.sql` и `database/seed.sql` |
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

Правки в `frontend/` видны сразу, без перезапуска: nginx читает папку напрямую.
PostgreSQL доступен клиентам БД (DBeaver, DataGrip) на `localhost:5432` (порт меняется в `.env`, только с этого компьютера).
`schema.sql` и `seed.sql` применяются только к пустому тому: после правки схемы нужен `docker compose down -v`.

## Только интерфейс, без Docker

Для работы над страницами хватит Python 3, он есть в macOS и большинстве Linux.

```bash
python3 tools/dev-server.py
```

Затем откройте <http://localhost:5173>. Сервер отдаёт папку `frontend/`, запрещает кэширование (правки видны сразу)
и показывает свою страницу 404 на несуществующие адреса. API в этом режиме нет – страницы работают на демо-данных.

## Вход без сервера (демо)

Регистрация и вход пока работают без сервера: роль определяется по почте, пароль – любой (при регистрации – не короче 8 символов).

| Почта | Кто откроется |
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
database/        schema.sql (таблицы, ограничения, триггеры), seed.sql (роли, справочники), redis.md
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
