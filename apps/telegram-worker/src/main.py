import asyncio
import base64
import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import psycopg2
import redis
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor
from telethon import TelegramClient
from telethon.errors import FloodWaitError
from telethon.sessions import StringSession

load_dotenv()

LOGIN_QUEUE_NAME = "telegram-login:queue"
MONITOR_QUEUE_NAME = "telegram-monitor:queue"
AI_ANALYSIS_QUEUE_NAME = "ai-analysis:queue"
DISPATCH_QUEUE_NAME = "telegram-dispatch:queue"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_key(raw_key: str) -> bytes:
    try:
        key = base64.urlsafe_b64decode(raw_key)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("TELEGRAM_SESSION_ENCRYPTION_KEY must be base64-encoded") from exc

    if len(key) != 32:
        raise RuntimeError("TELEGRAM_SESSION_ENCRYPTION_KEY must decode to 32 bytes")

    return key


def encrypt_session(plaintext: str, key: bytes) -> str:
    aes = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aes.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_session(ciphertext_b64: str, key: bytes) -> str:
    aes = AESGCM(key)
    raw = base64.urlsafe_b64decode(ciphertext_b64)
    nonce = raw[:12]
    ciphertext = raw[12:]
    plaintext = aes.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")


def update_login_session(conn: Any, session_id: str, **fields: Any) -> None:
    with conn.cursor() as cur:
        sets = []
        values = []
        for k, v in fields.items():
            sets.append(f'"{k}" = %s')
            values.append(v)
        sets.append('"updatedAt" = NOW()')
        values.append(session_id)
        cur.execute(f'UPDATE "TelegramLoginSession" SET {", ".join(sets)} WHERE "id" = %s', values)
    conn.commit()


def update_account(conn: Any, account_id: str, **fields: Any) -> None:
    with conn.cursor() as cur:
        sets = []
        values = []
        for k, v in fields.items():
            sets.append(f'"{k}" = %s')
            values.append(v)
        sets.append('"updatedAt" = NOW()')
        values.append(account_id)
        cur.execute(f'UPDATE "TelegramAccount" SET {", ".join(sets)} WHERE "id" = %s', values)
    conn.commit()


def update_channel(conn: Any, channel_id: str, **fields: Any) -> None:
    with conn.cursor() as cur:
        sets = []
        values = []
        for k, v in fields.items():
            sets.append(f'"{k}" = %s')
            values.append(v)
        sets.append('"updatedAt" = NOW()')
        values.append(channel_id)
        cur.execute(f'UPDATE "MonitoredChannel" SET {", ".join(sets)} WHERE "id" = %s', values)
    conn.commit()


def get_login_payload(conn: Any, session_id: str) -> Optional[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            'SELECT ls.*, ta."proxyHost", ta."proxyPort", ta."proxyUsername", ta."proxyPassword" '
            'FROM "TelegramLoginSession" ls '
            'JOIN "TelegramAccount" ta ON ta."id" = ls."telegramAccountId" '
            'WHERE ls."id" = %s',
            (session_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_session_status(conn: Any, session_id: str) -> Optional[str]:
    with conn.cursor() as cur:
        cur.execute('SELECT "status" FROM "TelegramLoginSession" WHERE "id" = %s', (session_id,))
        row = cur.fetchone()
        return row[0] if row else None


def is_canceled_or_expired(conn: Any, session_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute('SELECT "status", "expiresAt" FROM "TelegramLoginSession" WHERE "id" = %s', (session_id,))
        row = cur.fetchone()
        if not row:
            return True
        status, expires_at = row
        if status in ("EXPIRED", "FAILED", "CONNECTED"):
            return True
        expires_at_utc = as_utc(expires_at)
        if not expires_at_utc:
            return True
        return utc_now() > expires_at_utc


def parse_database_url(database_url: str) -> dict[str, Any]:
    from urllib.parse import urlparse

    parsed = urlparse(database_url)
    return {
        "host": parsed.hostname,
        "port": parsed.port,
        "dbname": parsed.path.lstrip("/"),
        "user": parsed.username,
        "password": parsed.password,
        "sslmode": "prefer",
    }


def parse_login_payload(raw: str) -> Optional[dict[str, Any]]:
    try:
        payload = json.loads(raw)
    except Exception:
        print("[telegram-worker] invalid login payload JSON; skipping")
        return None

    required = {"type", "loginSessionId", "telegramAccountId", "workspaceId", "createdAt"}
    if not isinstance(payload, dict) or not required.issubset(payload.keys()):
        print("[telegram-worker] login payload schema mismatch; skipping")
        return None

    if payload.get("type") != "telegram_login_start":
        print("[telegram-worker] unsupported login payload type; skipping")
        return None

    return payload


def parse_monitor_payload(raw: str) -> Optional[dict[str, Any]]:
    try:
        payload = json.loads(raw)
    except Exception:
        print("[telegram-worker] invalid monitor payload JSON; skipping")
        return None

    required = {"type", "channelId", "workspaceId", "telegramAccountId", "createdAt"}
    if not isinstance(payload, dict) or not required.issubset(payload.keys()):
        print("[telegram-worker] monitor payload schema mismatch; skipping")
        return None

    if payload.get("type") != "monitor_channel":
        print("[telegram-worker] unsupported monitor payload type; skipping")
        return None

    return payload


def parse_dispatch_payload(raw: str) -> Optional[dict[str, Any]]:
    try:
        payload = json.loads(raw)
    except Exception:
        print("[telegram-worker] invalid dispatch payload JSON; skipping")
        return None

    required = {"type", "dispatchJobId", "workspaceId", "telegramAccountId", "createdAt"}
    if not isinstance(payload, dict) or not required.issubset(payload.keys()):
        print("[telegram-worker] dispatch payload schema mismatch; skipping")
        return None

    if payload.get("type") != "send_comment":
        print("[telegram-worker] unsupported dispatch payload type; skipping")
        return None

    return payload


def get_channel_with_account(conn: Any, channel_id: str, workspace_id: str) -> Optional[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            'SELECT mc.*, ta."status" as "accountStatus", ta."sessionEncrypted", ta."proxyHost", '
            'ta."proxyPort", ta."proxyUsername", ta."proxyPassword" '
            'FROM "MonitoredChannel" mc '
            'LEFT JOIN "TelegramAccount" ta ON ta."id" = mc."telegramAccountId" '
            'WHERE mc."id" = %s AND mc."workspaceId" = %s',
            (channel_id, workspace_id),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_dispatch_context(conn: Any, dispatch_job_id: str) -> Optional[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            'SELECT dj.*, gc."text" as "commentText", gc."status" as "generatedCommentStatus", '
            'co."externalPostId", mc."username" as "channelUsername", '
            'w."plan", w."subscriptionStatus", w."trialStartedAt", w."trialEndsAt", w."commentLimit", w."commentsSentCount", '
            'ta."workspaceId" as "accountWorkspaceId", ta."status" as "accountStatus", '
            'ta."sessionEncrypted", ta."proxyHost", ta."proxyPort", ta."proxyUsername", ta."proxyPassword", '
            'ass."id" as "safetyId", ass."dailyCommentCount", ass."dailyLimit", ass."minDelayMinutes", '
            'ass."activeFromHour", ass."activeToHour", ass."timezone", ass."lastDailyResetAt", '
            'ass."lastCommentAt", ass."cooldownUntil", ass."floodWaitUntil" '
            'FROM "DispatchJob" dj '
            'JOIN "GeneratedComment" gc ON gc."id" = dj."generatedCommentId" '
            'JOIN "CommentOpportunity" co ON co."id" = gc."opportunityId" '
            'JOIN "MonitoredChannel" mc ON mc."id" = co."monitoredChannelId" '
            'JOIN "Workspace" w ON w."id" = dj."workspaceId" '
            'JOIN "TelegramAccount" ta ON ta."id" = dj."telegramAccountId" '
            'LEFT JOIN "AccountSafetyState" ass ON ass."telegramAccountId" = ta."id" '
            'WHERE dj."id" = %s',
            (dispatch_job_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_workspace_dispatch_block_reason(ctx: dict[str, Any]) -> Optional[str]:
    subscription_status = str(ctx.get("subscriptionStatus") or "")
    if subscription_status == "active":
        return None

    if subscription_status == "trialing":
        trial_ends_at = ctx.get("trialEndsAt")
        if trial_ends_at and utc_now() > trial_ends_at:
            return "Trial ended. Upgrade to continue sending comments."

        limit = int(ctx.get("commentLimit") or 20)
        sent = int(ctx.get("commentsSentCount") or 0)
        if sent >= limit:
            return "Trial comment limit reached. Upgrade to continue."

        return None

    return "Subscription inactive. Upgrade to continue sending comments."


def ensure_safety_state(conn: Any, telegram_account_id: str) -> dict[str, Any]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            'INSERT INTO "AccountSafetyState" '
            '("id", "telegramAccountId", "dailyCommentCount", "dailyLimit", "minDelayMinutes", '
            '"activeFromHour", "activeToHour", "timezone", "createdAt", "updatedAt") '
            'VALUES (%s, %s, 0, 10, 20, 9, 21, %s, NOW(), NOW()) '
            'ON CONFLICT ("telegramAccountId") DO NOTHING',
            (str(uuid.uuid4()), telegram_account_id, "Europe/Amsterdam"),
        )
    conn.commit()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT * FROM "AccountSafetyState" WHERE "telegramAccountId" = %s', (telegram_account_id,))
        row = cur.fetchone()
        return dict(row)


def mark_dispatch_failed(conn: Any, dispatch_job_id: str, message: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE "DispatchJob" SET "status" = %s, "error" = %s, "updatedAt" = NOW() WHERE "id" = %s',
            ("FAILED", message[:1000], dispatch_job_id),
        )
    conn.commit()


def schedule_dispatch_again(conn: Any, dispatch_job_id: str, when_dt: datetime, reason: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE "DispatchJob" SET "status" = %s, "scheduledAt" = %s, "queuedAt" = NULL, "error" = %s, "updatedAt" = NOW() '
            'WHERE "id" = %s',
            ("SCHEDULED", when_dt, reason[:1000], dispatch_job_id),
        )
    conn.commit()


def apply_day_reset_if_needed(conn: Any, safety: dict[str, Any]) -> dict[str, Any]:
    tz_name = safety.get("timezone") or "Europe/Amsterdam"
    now_tz = datetime.now(ZoneInfo(tz_name))
    last_reset = safety.get("lastDailyResetAt")

    if not last_reset or last_reset.astimezone(ZoneInfo(tz_name)).date() != now_tz.date():
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "AccountSafetyState" SET "dailyCommentCount" = 0, "lastDailyResetAt" = NOW(), "updatedAt" = NOW() '
                'WHERE "telegramAccountId" = %s',
                (safety["telegramAccountId"],),
            )
        conn.commit()
        safety["dailyCommentCount"] = 0
        safety["lastDailyResetAt"] = utc_now()

    return safety


def inside_active_hours(hour: int, active_from: int, active_to: int) -> bool:
    if active_from < active_to:
        return active_from <= hour < active_to
    return hour >= active_from or hour < active_to


def next_active_start(now_tz: datetime, active_from: int, active_to: int) -> datetime:
    if inside_active_hours(now_tz.hour, active_from, active_to):
        return now_tz
    if active_from < active_to:
        if now_tz.hour < active_from:
            return now_tz.replace(hour=active_from, minute=0, second=0, microsecond=0)
        return (now_tz + timedelta(days=1)).replace(hour=active_from, minute=0, second=0, microsecond=0)
    if now_tz.hour < active_to or now_tz.hour >= active_from:
        return now_tz
    return now_tz.replace(hour=active_from, minute=0, second=0, microsecond=0)


def evaluate_send_safety(safety: dict[str, Any]) -> tuple[bool, datetime, str]:
    tz_name = safety.get("timezone") or "Europe/Amsterdam"
    tz = ZoneInfo(tz_name)
    now_tz = datetime.now(tz)
    reason = ""
    candidate = now_tz

    flood = safety.get("floodWaitUntil")
    if flood and flood.astimezone(tz) > candidate:
        candidate = flood.astimezone(tz)
        reason = "Rescheduled: flood wait is active"

    cooldown = safety.get("cooldownUntil")
    if cooldown and cooldown.astimezone(tz) > candidate:
        candidate = cooldown.astimezone(tz)
        reason = "Rescheduled: cooldown is active"

    daily_count = int(safety.get("dailyCommentCount") or 0)
    daily_limit = int(safety.get("dailyLimit") or 10)
    active_from = int(safety.get("activeFromHour") or 9)
    active_to = int(safety.get("activeToHour") or 21)
    min_delay = int(safety.get("minDelayMinutes") or 20)

    if daily_count >= daily_limit:
        candidate = (now_tz + timedelta(days=1)).replace(hour=active_from, minute=0, second=0, microsecond=0)
        reason = "Rescheduled: daily limit reached"

    last_comment_at = safety.get("lastCommentAt")
    if last_comment_at:
        min_time = last_comment_at.astimezone(tz) + timedelta(minutes=min_delay)
        if min_time > candidate:
            candidate = min_time
            reason = "Rescheduled: min delay between comments not reached"

    candidate = next_active_start(candidate, active_from, active_to)

    ready_now = (
        inside_active_hours(now_tz.hour, active_from, active_to)
        and daily_count < daily_limit
        and (not cooldown or cooldown.astimezone(tz) <= now_tz)
        and (not flood or flood.astimezone(tz) <= now_tz)
        and (not last_comment_at or (last_comment_at.astimezone(tz) + timedelta(minutes=min_delay)) <= now_tz)
    )

    return ready_now, candidate.astimezone(timezone.utc), reason or "Rescheduled by safety rules"


def insert_opportunity(
    conn: Any,
    workspace_id: str,
    channel_id: str,
    account_id: Optional[str],
    external_post_id: str,
    post_text: str,
    post_date: datetime,
)-> Optional[str]:
    opportunity_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO "CommentOpportunity" '
            '("id", "workspaceId", "monitoredChannelId", "telegramAccountId", "externalPostId", '
            '"postText", "postDate", "status", "createdAt", "updatedAt") '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()) '
            'ON CONFLICT ("workspaceId", "monitoredChannelId", "externalPostId") DO NOTHING',
            (opportunity_id, workspace_id, channel_id, account_id, external_post_id, post_text, post_date, "NEW"),
        )
        inserted = cur.rowcount > 0
    conn.commit()
    return opportunity_id if inserted else None


async def process_login_job(conn: Any, job: dict[str, Any], api_id: int, api_hash: str, enc_key: bytes) -> None:
    session_id = str(job["loginSessionId"])
    account_id = str(job["telegramAccountId"])

    status = get_session_status(conn, session_id)
    if status != "PENDING":
        print(f"[telegram-worker] skip non-pending session {session_id} with status {status}")
        return

    payload = get_login_payload(conn, session_id)
    if not payload:
        print(f"[telegram-worker] login session not found: {session_id}")
        return

    expires_at = as_utc(payload.get("expiresAt"))
    if not expires_at:
        update_login_session(conn, session_id, status="FAILED", error="Login session has invalid expiresAt")
        update_account(conn, account_id, status="FAILED", connectionError="Login session has invalid expiresAt")
        return

    if utc_now() > expires_at:
        update_login_session(conn, session_id, status="EXPIRED", error="QR login expired")
        update_account(conn, account_id, status="FAILED", connectionError="QR login expired")
        return

    proxy = None
    if payload.get("proxyHost") and payload.get("proxyPort"):
        proxy = (
            "socks5",
            payload["proxyHost"],
            int(payload["proxyPort"]),
            True,
            payload.get("proxyUsername"),
            payload.get("proxyPassword"),
        )

    client = TelegramClient(StringSession(), api_id, api_hash, proxy=proxy)

    try:
        await client.connect()
        qr = await client.qr_login()

        update_login_session(conn, session_id, status="QR_READY", qrUrl=qr.url, error=None)
        update_login_session(conn, session_id, status="WAITING_SCAN")

        timeout_seconds = int((expires_at - utc_now()).total_seconds())
        if timeout_seconds <= 0:
            raise TimeoutError("QR login expired")

        start = utc_now()
        while True:
            if is_canceled_or_expired(conn, session_id):
                raise TimeoutError("QR login expired")

            try:
                await asyncio.wait_for(qr.wait(), timeout=3)
                break
            except TimeoutError:
                raise
            except asyncio.TimeoutError:
                if (utc_now() - start).total_seconds() > timeout_seconds:
                    raise TimeoutError("QR login expired")
                continue

        me = await client.get_me()
        session_string = client.session.save()
        encrypted_session = encrypt_session(session_string, enc_key)

        update_account(
            conn,
            account_id,
            status="CONNECTED",
            sessionEncrypted=encrypted_session,
            telegramUserId=str(me.id),
            username=me.username,
            firstName=me.first_name,
            lastName=me.last_name,
            connectedAt=utc_now(),
            connectionError=None,
        )
        update_login_session(conn, session_id, status="CONNECTED", error=None)

        print(f"[telegram-worker] account connected: {account_id}")
    except Exception as exc:
        message = str(exc)
        if "expired" in message.lower() or "timeout" in message.lower():
            update_login_session(conn, session_id, status="EXPIRED", error="QR login expired")
            update_account(conn, account_id, status="FAILED", connectionError="QR login expired")
        else:
            update_login_session(conn, session_id, status="FAILED", error=message[:1000])
            update_account(conn, account_id, status="FAILED", connectionError=message[:1000])
        print(f"[telegram-worker] login failed for {account_id}: {message}")
    finally:
        await client.disconnect()


async def process_monitor_job(
    conn: Any, r: redis.Redis, job: dict[str, Any], api_id: int, api_hash: str, enc_key: bytes
) -> None:
    channel_id = str(job["channelId"])
    workspace_id = str(job["workspaceId"])

    data = get_channel_with_account(conn, channel_id, workspace_id)
    if not data:
        return

    if data.get("status") != "ACTIVE":
        return

    if data.get("accountStatus") != "CONNECTED":
        update_channel(conn, channel_id, syncError="Linked account is not CONNECTED")
        return

    encrypted = data.get("sessionEncrypted")
    if not encrypted:
        update_channel(conn, channel_id, syncError="Missing encrypted session")
        return

    if not data.get("monitoringStartedAt"):
        update_channel(conn, channel_id, syncError="Monitoring is not initialized")
        return

    monitoring_started_at_raw = data.get("monitoringStartedAt")
    monitoring_started_at = as_utc(monitoring_started_at_raw)
    if not monitoring_started_at:
        update_channel(conn, channel_id, syncError="Monitoring is not initialized")
        return
    freshness_minutes = int(data.get("freshnessWindowMinutes") or 90)
    freshness_threshold = utc_now() - timedelta(minutes=freshness_minutes)

    try:
        session_string = decrypt_session(encrypted, enc_key)
    except Exception as exc:
        update_channel(conn, channel_id, syncError=f"Session decrypt failed: {str(exc)[:300]}")
        return

    proxy = None
    if data.get("proxyHost") and data.get("proxyPort"):
        proxy = (
            "socks5",
            data["proxyHost"],
            int(data["proxyPort"]),
            True,
            data.get("proxyUsername"),
            data.get("proxyPassword"),
        )

    client = TelegramClient(StringSession(session_string), api_id, api_hash, proxy=proxy)

    max_seen_id: Optional[int] = None
    try:
        await client.connect()
        entity = await client.get_entity(data["username"])

        messages = await client.get_messages(entity, limit=10)
        for msg in messages:
            if not getattr(msg, "id", None):
                continue

            text = (getattr(msg, "message", None) or "").strip()
            if not text:
                continue

            msg_date = getattr(msg, "date", None)
            if not msg_date:
                continue
            if msg_date.tzinfo is None:
                msg_date = msg_date.replace(tzinfo=timezone.utc)

            if msg_date < monitoring_started_at:
                continue

            if msg_date < freshness_threshold:
                continue

            external_post_id = str(msg.id)
            inserted_opportunity_id = insert_opportunity(
                conn,
                workspace_id,
                channel_id,
                data.get("telegramAccountId"),
                external_post_id,
                text,
                msg_date,
            )

            if inserted_opportunity_id:
                r.rpush(
                    AI_ANALYSIS_QUEUE_NAME,
                    json.dumps(
                        {
                            "type": "analyze_comment_opportunity",
                            "workspaceId": workspace_id,
                            "opportunityId": inserted_opportunity_id,
                            "createdAt": utc_now().isoformat(),
                        }
                    ),
                )
            if inserted_opportunity_id and (max_seen_id is None or msg.id > max_seen_id):
                max_seen_id = msg.id

        update_channel(
            conn,
            channel_id,
            lastSeenPostId=str(max_seen_id) if max_seen_id is not None else data.get("lastSeenPostId"),
            lastSyncAt=utc_now(),
            syncError=None,
        )
    except Exception as exc:
        update_channel(conn, channel_id, lastSyncAt=utc_now(), syncError=str(exc)[:1000])
    finally:
        await client.disconnect()


async def process_dispatch_job(conn: Any, job: dict[str, Any], api_id: int, api_hash: str, enc_key: bytes) -> None:
    dispatch_job_id = str(job["dispatchJobId"])
    workspace_id = str(job["workspaceId"])

    ctx = get_dispatch_context(conn, dispatch_job_id)
    if not ctx:
        print(f"[telegram-worker] dispatch job not found: {dispatch_job_id}")
        return

    if str(ctx["workspaceId"]) != workspace_id:
        mark_dispatch_failed(conn, dispatch_job_id, "Workspace mismatch in dispatch payload")
        return

    billing_block_reason = get_workspace_dispatch_block_reason(ctx)
    if billing_block_reason:
        mark_dispatch_failed(conn, dispatch_job_id, billing_block_reason)
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "GeneratedComment" SET "status" = %s, "updatedAt" = NOW() WHERE "id" = %s',
                ("FAILED", ctx["generatedCommentId"]),
            )
        conn.commit()
        return

    if ctx["status"] != "READY":
        print(f"[telegram-worker] skip dispatch {dispatch_job_id}: status {ctx['status']}")
        return

    if ctx.get("accountStatus") != "CONNECTED":
        mark_dispatch_failed(conn, dispatch_job_id, "Telegram account is not CONNECTED")
        return

    generated_status = str(ctx.get("generatedCommentStatus") or "")
    if generated_status not in ("QUEUED", "APPROVED"):
        mark_dispatch_failed(conn, dispatch_job_id, "Generated comment status is not QUEUED/APPROVED")
        return

    if not ctx.get("sessionEncrypted"):
        mark_dispatch_failed(conn, dispatch_job_id, "Missing encrypted session")
        return

    safety = ensure_safety_state(conn, str(ctx["telegramAccountId"]))
    safety = apply_day_reset_if_needed(conn, safety)
    ready_now, next_time, reason = evaluate_send_safety(safety)
    if not ready_now:
        schedule_dispatch_again(conn, dispatch_job_id, next_time, reason)
        return

    try:
        session_string = decrypt_session(str(ctx["sessionEncrypted"]), enc_key)
    except Exception as exc:
        update_account(conn, str(ctx["telegramAccountId"]), status="FAILED", connectionError="Session decrypt failed")
        mark_dispatch_failed(conn, dispatch_job_id, f"Session invalid: {str(exc)[:200]}")
        return

    proxy = None
    if ctx.get("proxyHost") and ctx.get("proxyPort"):
        proxy = (
            "socks5",
            ctx["proxyHost"],
            int(ctx["proxyPort"]),
            True,
            ctx.get("proxyUsername"),
            ctx.get("proxyPassword"),
        )

    client = TelegramClient(StringSession(session_string), api_id, api_hash, proxy=proxy)

    try:
        await client.connect()
        entity = await client.get_entity(ctx["channelUsername"])
        post_id = int(str(ctx["externalPostId"]))
        original_message = await client.get_messages(entity, ids=post_id)
        if not original_message:
            mark_dispatch_failed(conn, dispatch_job_id, "Original post not found")
            return

        try:
            await client.send_message(entity, ctx["commentText"], comment_to=post_id)
        except TypeError:
            await client.send_message(entity, ctx["commentText"], reply_to=post_id)
        except Exception as exc:
            lower = str(exc).lower()
            if "discussion" in lower or "comment" in lower or "reply" in lower:
                mark_dispatch_failed(conn, dispatch_job_id, "Comments unavailable for this post")
                return
            raise

        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "DispatchJob" SET "status" = %s, "sentAt" = NOW(), "error" = NULL, "updatedAt" = NOW() WHERE "id" = %s',
                ("SENT", dispatch_job_id),
            )
            cur.execute(
                'UPDATE "GeneratedComment" SET "status" = %s, "updatedAt" = NOW() WHERE "id" = %s',
                ("SENT", ctx["generatedCommentId"]),
            )
            cur.execute(
                'UPDATE "AccountSafetyState" SET "dailyCommentCount" = "dailyCommentCount" + 1, "lastCommentAt" = NOW(), '
                '"updatedAt" = NOW() WHERE "telegramAccountId" = %s',
                (ctx["telegramAccountId"],),
            )
            cur.execute(
                'UPDATE "Workspace" SET "commentsSentCount" = "commentsSentCount" + 1, "updatedAt" = NOW() WHERE "id" = %s',
                (ctx["workspaceId"],),
            )
        conn.commit()
        print(f"[telegram-worker] dispatch sent: {dispatch_job_id}")
    except FloodWaitError as exc:
        flood_until = utc_now() + timedelta(seconds=int(exc.seconds))
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "AccountSafetyState" SET "floodWaitUntil" = %s, "updatedAt" = NOW() WHERE "telegramAccountId" = %s',
                (flood_until, ctx["telegramAccountId"]),
            )
        conn.commit()
        schedule_dispatch_again(conn, dispatch_job_id, flood_until, f"Flood wait: retry after {exc.seconds} seconds")
    except Exception as exc:
        message = str(exc)
        lower = message.lower()
        if "auth" in lower or "deactivated" in lower or "session" in lower:
            update_account(conn, str(ctx["telegramAccountId"]), status="FAILED", connectionError="Session invalid")
            mark_dispatch_failed(conn, dispatch_job_id, "Session invalid")
        elif "not participant" in lower or "private" in lower or "forbidden" in lower:
            mark_dispatch_failed(conn, dispatch_job_id, "No access to channel")
        else:
            mark_dispatch_failed(conn, dispatch_job_id, message[:1000])
    finally:
        await client.disconnect()


def fetch_active_channels(conn: Any) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            'SELECT "id", "workspaceId", "telegramAccountId" FROM "MonitoredChannel" '
            'WHERE "status" = %s AND "telegramAccountId" IS NOT NULL',
            ("ACTIVE",),
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def main() -> None:
    redis_url = os.getenv("REDIS_URL", "")
    database_url = os.getenv("DATABASE_URL", "")
    api_id_raw = os.getenv("TELEGRAM_API_ID", "")
    api_hash = os.getenv("TELEGRAM_API_HASH", "")
    enc_raw = os.getenv("TELEGRAM_SESSION_ENCRYPTION_KEY", "")

    if not redis_url or not database_url:
        raise RuntimeError("REDIS_URL and DATABASE_URL are required")
    if not api_id_raw or not api_hash:
        raise RuntimeError("TELEGRAM_API_ID and TELEGRAM_API_HASH are required")
    if not enc_raw:
        raise RuntimeError("TELEGRAM_SESSION_ENCRYPTION_KEY is required")

    api_id = int(api_id_raw)
    enc_key = parse_key(enc_raw)

    r = redis.Redis.from_url(redis_url, decode_responses=True)
    conn = psycopg2.connect(**parse_database_url(database_url))

    print("[telegram-worker] started")
    print(f"[telegram-worker] consuming queues: {LOGIN_QUEUE_NAME}, {MONITOR_QUEUE_NAME}, {DISPATCH_QUEUE_NAME}")

    last_periodic_run = 0.0

    while True:
        try:
            login_item = r.blpop(LOGIN_QUEUE_NAME, timeout=1)
            if login_item:
                _, raw = login_item
                payload = parse_login_payload(raw)
                if payload:
                    asyncio.run(process_login_job(conn, payload, api_id, api_hash, enc_key))

            monitor_item = r.blpop(MONITOR_QUEUE_NAME, timeout=1)
            if monitor_item:
                _, raw = monitor_item
                payload = parse_monitor_payload(raw)
                if payload:
                    asyncio.run(process_monitor_job(conn, r, payload, api_id, api_hash, enc_key))

            dispatch_item = r.blpop(DISPATCH_QUEUE_NAME, timeout=1)
            if dispatch_item:
                _, raw = dispatch_item
                payload = parse_dispatch_payload(raw)
                if payload:
                    asyncio.run(process_dispatch_job(conn, payload, api_id, api_hash, enc_key))

            now_ts = time.time()
            if now_ts - last_periodic_run >= 120:
                for channel in fetch_active_channels(conn):
                    job = {
                        "type": "monitor_channel",
                        "channelId": channel["id"],
                        "workspaceId": channel["workspaceId"],
                        "telegramAccountId": channel["telegramAccountId"],
                        "createdAt": utc_now().isoformat(),
                    }
                    asyncio.run(process_monitor_job(conn, r, job, api_id, api_hash, enc_key))
                last_periodic_run = now_ts

        except Exception as exc:
            print(f"[telegram-worker] loop error: {exc}")


if __name__ == "__main__":
    main()
