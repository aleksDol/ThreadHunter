# Smoke E2E Checklist (AUTO Pipeline)

Используйте чеклист в dev/prod без фейковой отправки.

1. Проверить, что контейнеры `expert-comment-api`, `expert-comment-ai-worker`, `expert-comment-dispatch-worker`, `expert-comment-telegram-worker`, `expert-comment-redis`, `expert-comment-postgres` в статусе `Up`.
2. Проверить API health: `curl -i http://127.0.0.1:4100/health` или через домен `/api/health`.
3. Проверить, что есть хотя бы один `TelegramAccount` со статусом `CONNECTED`.
4. Проверить, что есть хотя бы один `MonitoredChannel` со статусом `ACTIVE` и привязкой к аккаунту.
5. Проверить, что в `KnowledgeBase` есть записи по workspace.
6. Проверить, что в `CommentOpportunity` появляются новые посты.
7. Проверить, что `analysisStatus` не застревает в `PENDING` и переходит в `ANALYZED/SKIPPED/FAILED` с причиной.
8. Для релевантного поста убедиться, что создается только один активный `GeneratedComment` на `opportunityId` (без дублей `DRAFT/QUEUED/SENT`).
9. Проверить `DispatchJob` путь: `SCHEDULED -> READY -> SENT/FAILED`.
10. Проверить, что `READY` не висит бесконечно: stuck jobs автоматически возвращаются в `SCHEDULED` с reason.
11. Проверить, что `telegram-dispatch:queue` обрабатывается (нет постоянного роста очереди).
12. Проверить логи `telegram-worker`: присутствуют шаги `dispatch_job_received ... dispatch_db_updated`.
13. Проверить в UI `/dashboard/comments`: показывается актуальный комментарий на пост и понятный статус `SENT/FAILED/QUEUED`.
