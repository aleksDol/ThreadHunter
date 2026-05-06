# Telegram Login Queue Contract

Queue name:

```txt
telegram-login:queue
```

Transport:
- Redis List
- API pushes JSON via `RPUSH`
- Python worker consumes via `BLPOP`

Payload schema:

```json
{
  "type": "telegram_login_start",
  "loginSessionId": "...",
  "telegramAccountId": "...",
  "workspaceId": "...",
  "createdAt": "ISO date"
}
```

Retry policy:
- API creates one `TelegramLoginSession` per start request.
- Worker writes `FAILED` on processing error.
- Retry means creating a new login session via API.
- Expired sessions are never reused.

Idempotency:
- Worker checks `TelegramLoginSession.status` before processing.
- If status is not `PENDING`, worker ignores the message.

Lifecycle summary:
- API: creates `TelegramAccount(CONNECTING)` + `TelegramLoginSession(PENDING, expiresAt=now+2m)`.
- Worker: `PENDING -> QR_READY -> WAITING_SCAN -> CONNECTED`.
- On timeout: `EXPIRED` with `error="QR login expired"`.
- On failures: `FAILED` with readable error.
