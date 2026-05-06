# Expert Comment AI

SaaS-платформа для автоматизированного экспертного присутствия в Telegram:
мониторинг новых постов, AI-анализ релевантности, генерация комментариев, safety/scheduler и отправка через подключённые Telegram-аккаунты.

## Local development

### 1) Env
Скопируйте `.env.example` в `.env` и заполните минимум:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `TELEGRAM_SESSION_ENCRYPTION_KEY`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `NEXT_PUBLIC_API_URL`

Для production-like login дополнительно:

- `TELEGRAM_VERIFY_BOT_TOKEN`
- `TELEGRAM_VERIFY_BOT_USERNAME`
- `INTERNAL_BOT_SECRET`

### 2) Запуск инфраструктуры

```bash
docker compose up --build
```

### 3) Миграции Prisma

```bash
npm run db:generate
npm run db:migrate
```

### 4) URLs

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Production checklist

Перед production запуском убедитесь, что заданы:

- `NODE_ENV=production`
- `TELEGRAM_AUTH_BOT_TOKEN`
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION_ENCRYPTION_KEY`
- `TELEGRAM_VERIFY_BOT_TOKEN`
- `TELEGRAM_VERIFY_BOT_USERNAME`
- `INTERNAL_BOT_SECRET`
- `JWT_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

Опционально для нестабильного доступа сервера к Telegram (только QR-login):

- `DEFAULT_QR_LOGIN_PROXY_ENABLED`
- `DEFAULT_QR_LOGIN_PROXY_TYPE`
- `DEFAULT_QR_LOGIN_PROXY_HOST`
- `DEFAULT_QR_LOGIN_PROXY_PORT`
- `DEFAULT_QR_LOGIN_PROXY_USERNAME`
- `DEFAULT_QR_LOGIN_PROXY_PASSWORD`

Также проверьте:

- HTTPS на web/api доменах
- доступность Redis/Postgres
- работоспособность worker-контейнеров

## Workers

- `telegram-worker`
  - QR-login
  - мониторинг новых постов
  - отправка READY dispatch jobs
- `ai-worker`
  - анализ opportunities (`ai-analysis:queue`)
  - генерация комментариев (`comment-generation:queue`)
- `dispatch-worker`
  - safety scheduler (`SCHEDULED -> READY`)
  - постановка в `telegram-dispatch:queue`

## Queues

- `telegram-login:queue`
- `telegram-monitor:queue`
- `ai-analysis:queue`
- `comment-generation:queue`
- `telegram-dispatch:queue`

## Troubleshooting

### Telegram Login не отображается

- проверьте `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
- проверьте, что страница `/login` открывается без блокировки внешних скриптов

### QR-login не появляется

- проверьте `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`
- проверьте `TELEGRAM_SESSION_ENCRYPTION_KEY`
- проверьте логи `telegram-worker`
- если сервер не достукивается до Telegram DC, включите `DEFAULT_QR_LOGIN_PROXY_*`

### Канал не мониторится

- аккаунт должен быть `CONNECTED`
- канал должен быть привязан к аккаунту
- проверьте `syncError` и `/monitored-channels/:id/check-health`

### Комментарий не отправляется

- job должен перейти в `READY`
- проверьте ограничения safety (cooldown, flood wait, active hours)
- проверьте доступ аккаунта к каналу и комментариям

### FloodWait

- система возвращает job в `SCHEDULED`
- `floodWaitUntil` записывается в `AccountSafetyState`
- дождитесь следующей безопасной попытки

### Trial/limit reached

- проверьте `/billing/status`
- если `canDispatch=false`, отправка блокируется до активации подписки

## Smoke test

См. чеклист: `docs/smoke-e2e-checklist.md`
