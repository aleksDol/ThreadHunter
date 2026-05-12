# Deploy to VPS: Expert Comment AI

Этот runbook описывает безопасный деплой рядом с существующими проектами (Copilot и другие сервисы), без конфликтов по портам, volumes и compose project name.

## 1. DNS

Создайте A-запись:

- `comm.copilot-send-mes.ru -> <VPS_IP>`

## 2. Залить проект

```bash
mkdir -p /opt/expert-comment
cd /opt/expert-comment
# git clone ...
```

## 3. Создать production env

```bash
cp .env.production.example .env.production
nano .env.production
```

Заполните все `CHANGE_ME` и секреты.

## 4. Запуск production compose

```bash
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Важно:

- этот запуск использует отдельный project name `expert-comment`
- не затрагивает контейнеры старого Copilot

Если frontend/API контейнеры обновились и внешний nginx-контейнер кеширует старые upstream-сокеты, перезапустите его:

```bash
docker restart ai-sales-nginx
```

## 5. Prisma migrations

Выполните миграции из API контейнера:

```bash
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production run --rm expert-comment-api npm run db:migrate
```

(Опционально генерация client)

```bash
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production run --rm expert-comment-api npm run db:generate
```

## 6. Nginx reverse proxy

```bash
sudo cp infra/nginx/expert-comment.conf.example /etc/nginx/sites-available/expert-comment.conf
sudo ln -s /etc/nginx/sites-available/expert-comment.conf /etc/nginx/sites-enabled/expert-comment.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 7. SSL

```bash
sudo certbot --nginx -d comm.copilot-send-mes.ru
```

## 8. Verify bot

Заполните в `.env.production`:

- `TELEGRAM_VERIFY_BOT_USERNAME`
- `TELEGRAM_VERIFY_BOT_TOKEN`
- `INTERNAL_BOT_SECRET`
- `ADMIN_EMAILS` (через запятую, например `admin@example.com,owner@example.com`)

Опционально для нестабильного доступа к Telegram только на этапе QR-login:

- `DEFAULT_QR_LOGIN_PROXY_ENABLED`
- `DEFAULT_QR_LOGIN_PROXY_TYPE`
- `DEFAULT_QR_LOGIN_PROXY_HOST`
- `DEFAULT_QR_LOGIN_PROXY_PORT`
- `DEFAULT_QR_LOGIN_PROXY_USERNAME`
- `DEFAULT_QR_LOGIN_PROXY_PASSWORD`

## 9. Проверка

1. Открыть `https://comm.copilot-send-mes.ru`
2. Проверить `/login`
3. Проверить email/password login и Telegram verify-bot
4. Проверить API health: `https://comm.copilot-send-mes.ru/api/health`
5. Проверить логи контейнеров

## 10. Логи

```bash
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production logs -f expert-comment-api
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production logs -f expert-comment-web
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production logs -f expert-comment-telegram-worker
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production logs -f expert-comment-ai-worker
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production logs -f expert-comment-dispatch-worker
```

## 11. Rollback

```bash
docker compose -p expert-comment -f docker-compose.prod.yml --env-file .env.production down
```

Это остановит только проект `expert-comment` и не затронет старый Copilot при другом project name.

## 12. Troubleshooting

### Telegram login не отображается
- Проверьте `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
- Проверьте BotFather `/setdomain`
- Проверьте, что домен открывается по HTTPS

### QR-login не появляется
- Проверьте `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`
- Проверьте `TELEGRAM_SESSION_ENCRYPTION_KEY`
- Проверьте логи `expert-comment-telegram-worker`

### Канал не мониторится
- Аккаунт должен быть `CONNECTED`
- Канал должен быть привязан к аккаунту
- Проверьте `syncError` и health endpoint

### Комментарий не отправляется
- Проверьте `DispatchJob` статус и safety ограничения
- Проверьте доступ к комментариям в канале
- Проверьте FloodWait в safety state

### Trial/limit reached
- Проверьте `/billing/status`
- Если `canDispatch=false`, отправка блокируется до активации

### Назначить админа вручную
- Через SQL в postgres:
```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'admin@example.com';
```
