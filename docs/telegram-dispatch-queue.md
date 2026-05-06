# Telegram Dispatch Queue Contract

Queue name:
`telegram-dispatch:queue`

Payload:
```json
{
  "type": "send_comment",
  "dispatchJobId": "...",
  "workspaceId": "...",
  "telegramAccountId": "...",
  "createdAt": "ISO date"
}
```

Rules:
- API/worker enqueue only when `DispatchJob.status = READY` and `queuedAt IS NULL`.
- Producer sets `queuedAt` after successful enqueue.
- Consumer verifies `DispatchJob.status = READY` and ownership before send.
- One `DispatchJob` can be sent only once (`status -> SENT`, `sentAt` set).
- If safety gate fails at send-time, job goes back to `SCHEDULED`, `queuedAt = NULL`, and `scheduledAt` is moved.
- On Telegram flood wait, job goes back to `SCHEDULED`, `floodWaitUntil` is saved.
