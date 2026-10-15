# Redis — структура ключей

Redis хранит **временные и быстро меняющиеся данные**. Всё, что должно
сохраняться надолго, лежит в PostgreSQL. Если очистить Redis, ни одна бизнес-сущность
не потеряется: пользователям придётся только заново войти в систему.

Все ключи начинаются с префикса `ryadom:` (в таблице он опущен).

| Ключ | Тип | TTL | Назначение |
|---|---|---|---|
| `session:{refreshTokenHash}` | Hash `{userId, userAgent, ip, createdAt}` | 30 дней | Refresh-токен (сессия пользователя) |
| `user:{userId}:sessions` | Set из `refreshTokenHash` | 30 дней | Все сессии пользователя: при блокировке аккаунта модератор удаляет их разом |
| `jwt:denylist:{jti}` | String `1` | до истечения access-токена (15 мин) | Отозванные access-токены после выхода или блокировки |
| `perms:{userId}` | Set кодов прав | 10 мин | Кэш `v_user_effective_permissions`; сбрасывается при смене ролей или прав |
| `online:users` | Sorted Set (score = время последней активности) | — | Онлайн-статус в чате |
| `chat:typing:{conversationId}:{userId}` | String `1` | 5 сек | Индикатор «печатает…» |
| `chat:unread:{userId}` | Hash `{conversationId: count}` | — | Счётчики непрочитанных сообщений; источник истины — `messages.read_at` |
| `slot:hold:{slotId}` | String `{clientId}` | 10 мин | Временная бронь слота на время оплаты (`SET NX EX`) |
| `catalog:filters:{hash}` | String (JSON) | 5 мин | Кэш выдачи каталога по набору фильтров |
| `ratelimit:{scope}:{ip\|userId}` | String (счётчик, `INCR`) | 1–15 мин | Ограничение попыток входа, регистрации, отправки сообщений |
| `email:verify:{token}` | String `{userId}` | 24 ч | Подтверждение email |
| `password:reset:{token}` | String `{userId}` | 1 ч | Сброс пароля |

## Pub/Sub каналы

| Канал | Сообщение | Назначение |
|---|---|---|
| `chat:conversation:{id}` | `{messageId, senderId, body, createdAt}` | Доставка сообщений между экземплярами Node.js (адаптер `@socket.io/redis-adapter`) |
| `notify:user:{id}` | `{type, title, payload}` | Push-уведомления в браузер в реальном времени |

## Связь с PostgreSQL

- Сообщение чата **сначала** записывается в `messages`, **потом** публикуется в канал.
- Бронь `slot:hold` только защищает слот от двойной записи, пока идёт оплата.
  Окончательную гарантию дают ограничения БД: `ux_appointments_active_slot` и триггер `appointment_book_slot`.
- При блокировке пользователя: `INSERT INTO user_blocks` → удалить все `session:*` из `user:{id}:sessions` → удалить `perms:{id}`.
