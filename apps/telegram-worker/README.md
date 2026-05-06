# Telegram Worker

Current role:
- consume Telegram login jobs from Redis List `telegram-login:queue`;
- consume monitor jobs from `telegram-monitor:queue`;
- consume dispatch send jobs from `telegram-dispatch:queue`;
- parse and validate payload contract (`telegram_login_start`);
- run Telethon QR login flow;
- update `TelegramLoginSession` and `TelegramAccount` statuses in Postgres;
- encrypt session string into `TelegramAccount.sessionEncrypted`.

Status flow:
- `PENDING -> QR_READY -> WAITING_SCAN -> CONNECTED`
- timeout: `EXPIRED` with `QR login expired`
- failure: `FAILED` with readable error

Idempotency:
- worker skips jobs where `TelegramLoginSession.status` is not `PENDING`.
- worker skips dispatch jobs where `DispatchJob.status` is not `READY`.
