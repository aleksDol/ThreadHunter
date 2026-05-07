import { DispatchStatus, PrismaClient, TelegramAccountStatus } from "@prisma/client";
import { config } from "dotenv";
import Redis from "ioredis";
import { DateTime } from "luxon";
import { z } from "zod";

config();

const envSchema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DISPATCH_SCHEDULER_INTERVAL_SEC: z.coerce.number().default(45),
  DISPATCH_READY_STUCK_MINUTES: z.coerce.number().default(2)
});

const env = envSchema.parse(process.env);
const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const TELEGRAM_DISPATCH_QUEUE_NAME = "telegram-dispatch:queue";

function insideActiveHours(hour: number, from: number, to: number): boolean {
  if (from < to) return hour >= from && hour < to;
  return hour >= from || hour < to;
}

function nextActiveStart(now: DateTime, from: number, to: number): DateTime {
  if (insideActiveHours(now.hour, from, to)) return now;

  if (from < to) {
    if (now.hour < from) return now.set({ hour: from, minute: 0, second: 0, millisecond: 0 });
    return now.plus({ day: 1 }).set({ hour: from, minute: 0, second: 0, millisecond: 0 });
  }

  if (now.hour < to) return now;
  if (now.hour >= from) return now;
  return now.set({ hour: from, minute: 0, second: 0, millisecond: 0 });
}

async function processJob(jobId: string): Promise<void> {
  const job = await prisma.dispatchJob.findUnique({
    where: { id: jobId },
    include: {
      telegramAccount: true
    }
  });

  if (!job || job.status !== DispatchStatus.SCHEDULED) return;

  const account = job.telegramAccount;
  if (account.status !== TelegramAccountStatus.CONNECTED) {
    await prisma.dispatchJob.update({
      where: { id: job.id },
      data: {
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
        error: "Telegram account is not CONNECTED"
      }
    });
    return;
  }

  const state = await prisma.accountSafetyState.upsert({
    where: { telegramAccountId: account.id },
    update: {},
    create: { telegramAccountId: account.id }
  });

  const nowTz = DateTime.now().setZone(state.timezone);

  let dailyCommentCount = state.dailyCommentCount;
  const lastReset = state.lastDailyResetAt ? DateTime.fromJSDate(state.lastDailyResetAt).setZone(state.timezone) : null;
  if (!lastReset || lastReset.toISODate() !== nowTz.toISODate()) {
    dailyCommentCount = 0;
    await prisma.accountSafetyState.update({
      where: { telegramAccountId: account.id },
      data: {
        dailyCommentCount: 0,
        lastDailyResetAt: nowTz.toJSDate()
      }
    });
  }

  let candidate = DateTime.now().setZone(state.timezone);
  let reason = "";

  if (state.floodWaitUntil) {
    const flood = DateTime.fromJSDate(state.floodWaitUntil).setZone(state.timezone);
    if (flood > candidate) {
      candidate = flood;
      reason = "Rescheduled: flood wait is active";
    }
  }

  if (state.cooldownUntil) {
    const cooldown = DateTime.fromJSDate(state.cooldownUntil).setZone(state.timezone);
    if (cooldown > candidate) {
      candidate = cooldown;
      reason = "Rescheduled: cooldown is active";
    }
  }

  if (dailyCommentCount >= state.dailyLimit) {
    const nextDay = nowTz.plus({ day: 1 }).set({
      hour: state.activeFromHour,
      minute: 0,
      second: 0,
      millisecond: 0
    });
    candidate = nextDay;
    reason = "Rescheduled: daily limit reached";
  }

  if (state.lastCommentAt) {
    const minTime = DateTime.fromJSDate(state.lastCommentAt)
      .setZone(state.timezone)
      .plus({ minutes: state.minDelayMinutes });
    if (minTime > candidate) {
      candidate = minTime;
      reason = "Rescheduled: min delay between comments not reached";
    }
  }

  candidate = nextActiveStart(candidate, state.activeFromHour, state.activeToHour);
  if (!insideActiveHours(candidate.hour, state.activeFromHour, state.activeToHour)) {
    candidate = candidate.plus({ day: 1 }).set({
      hour: state.activeFromHour,
      minute: 0,
      second: 0,
      millisecond: 0
    });
  }

  const readyNow =
    insideActiveHours(nowTz.hour, state.activeFromHour, state.activeToHour) &&
    dailyCommentCount < state.dailyLimit &&
    (!state.cooldownUntil || DateTime.fromJSDate(state.cooldownUntil).setZone(state.timezone) <= nowTz) &&
    (!state.floodWaitUntil || DateTime.fromJSDate(state.floodWaitUntil).setZone(state.timezone) <= nowTz) &&
    (!state.lastCommentAt ||
      DateTime.fromJSDate(state.lastCommentAt)
        .setZone(state.timezone)
        .plus({ minutes: state.minDelayMinutes }) <= nowTz);

  if (readyNow) {
    if (!job.queuedAt) {
      const payload = {
        type: "send_comment" as const,
        dispatchJobId: job.id,
        workspaceId: job.workspaceId,
        telegramAccountId: job.telegramAccountId,
        createdAt: new Date().toISOString()
      };

      try {
        await redis.rpush(TELEGRAM_DISPATCH_QUEUE_NAME, JSON.stringify(payload));
        await prisma.dispatchJob.update({
          where: { id: job.id },
          data: { status: DispatchStatus.READY, queuedAt: new Date(), error: null }
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Failed to queue telegram dispatch";
        await prisma.dispatchJob.update({
          where: { id: job.id },
          data: {
            status: DispatchStatus.SCHEDULED,
            queuedAt: null,
            scheduledAt: new Date(Date.now() + 60 * 1000),
            error: `Queue push failed: ${reason}`.slice(0, 1000)
          }
        });
      }
    } else {
      await prisma.dispatchJob.update({
        where: { id: job.id },
        data: {
          status: DispatchStatus.READY,
          error: null
        }
      });
    }
    return;
  }

  await prisma.dispatchJob.update({
    where: { id: job.id },
    data: {
      scheduledAt: candidate.toUTC().toJSDate(),
      error: reason || "Rescheduled by safety rules"
    }
  });
}

async function tick(): Promise<void> {
  // Watchdog: if READY jobs stay unsent for too long, re-schedule them.
  const readyStuckBefore = new Date(Date.now() - env.DISPATCH_READY_STUCK_MINUTES * 60 * 1000);
  await prisma.dispatchJob.updateMany({
    where: {
      status: DispatchStatus.READY,
      sentAt: null,
      OR: [{ queuedAt: { not: null, lte: readyStuckBefore } }, { queuedAt: null }]
    },
    data: {
      status: DispatchStatus.SCHEDULED,
      scheduledAt: new Date(Date.now() + 60 * 1000),
      queuedAt: null,
      error: "Auto-retry: READY job stuck without send confirmation"
    }
  });

  const now = new Date();
  const jobs = await prisma.dispatchJob.findMany({
    where: {
      status: DispatchStatus.SCHEDULED,
      scheduledAt: { lte: now }
    },
    select: { id: true }
  });

  for (const job of jobs) {
    await processJob(job.id);
  }
}

async function main(): Promise<void> {
  console.info("[dispatch-worker] started");
  const intervalMs = env.DISPATCH_SCHEDULER_INTERVAL_SEC * 1000;

  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error("[dispatch-worker] tick error", error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((error) => {
  console.error("[dispatch-worker] fatal", error);
  process.exit(1);
});
