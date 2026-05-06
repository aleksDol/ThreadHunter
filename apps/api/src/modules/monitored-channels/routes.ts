import { MonitoredChannelStatus, TelegramAccountStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { pushTelegramMonitorJob } from "../../config/queue";

const router = Router();

function normalizeUsername(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@/, "")
    .trim();
}

const createSchema = z.object({
  username: z.string(),
  title: z.string().trim().min(1).optional(),
  niche: z.string().trim().min(1).optional(),
  telegramAccountId: z.string().cuid().optional()
});

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  niche: z.string().trim().min(1).optional(),
  telegramAccountId: z.union([z.string().cuid(), z.null()]).optional(),
  status: z.nativeEnum(MonitoredChannelStatus).optional()
});

const settingsSchema = z.object({
  freshnessWindowMinutes: z.number().int().min(10).max(360).optional()
});

type ChannelHealthCode =
  | "OK"
  | "NO_ACCESS"
  | "COMMENTS_DISABLED"
  | "COMMENT_RESTRICTED"
  | "FLOOD_WAIT"
  | "BANNED_IN_DISCUSSION"
  | "UNKNOWN_ERROR";

function mapSyncErrorToHealth(syncError: string | null): ChannelHealthCode {
  if (!syncError) return "OK";
  const lower = syncError.toLowerCase();
  if (lower.includes("not connected") || lower.includes("no access") || lower.includes("missing encrypted session")) return "NO_ACCESS";
  if (lower.includes("comments unavailable") || lower.includes("discussion")) return "COMMENTS_DISABLED";
  if (lower.includes("restricted")) return "COMMENT_RESTRICTED";
  if (lower.includes("flood")) return "FLOOD_WAIT";
  if (lower.includes("banned")) return "BANNED_IN_DISCUSSION";
  return "UNKNOWN_ERROR";
}

function healthAdvice(code: ChannelHealthCode): string {
  if (code === "OK") return "Канал доступен для мониторинга и комментирования.";
  if (code === "NO_ACCESS") return "Проверьте подписку аккаунта на канал и статус CONNECTED.";
  if (code === "COMMENTS_DISABLED") return "В канале отключены комментарии или нет discussion-группы.";
  if (code === "COMMENT_RESTRICTED") return "У аккаунта есть ограничения на отправку комментариев.";
  if (code === "FLOOD_WAIT") return "Сработал flood wait. Подождите и попробуйте позже.";
  if (code === "BANNED_IN_DISCUSSION") return "Аккаунт заблокирован в discussion-группе канала.";
  return "Проверьте подписку аккаунта, доступ к комментариям и статус аккаунта.";
}

router.get("/", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const channels = await prisma.monitoredChannel.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });

  res.json(channels);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const username = normalizeUsername(parsed.data.username);

  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  if (parsed.data.telegramAccountId) {
    const account = await prisma.telegramAccount.findFirst({
      where: { id: parsed.data.telegramAccountId, workspaceId }
    });
    if (!account) {
      res.status(400).json({ error: "telegramAccountId does not belong to current workspace" });
      return;
    }
  }

  try {
    const created = await prisma.monitoredChannel.create({
      data: {
        workspaceId,
        username,
        title: parsed.data.title,
        niche: parsed.data.niche,
        telegramAccountId: parsed.data.telegramAccountId,
        status: MonitoredChannelStatus.PENDING
      }
    });

    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "Channel username already exists in this workspace" });
  }
});

router.post("/:id/start-monitoring", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const channel = await prisma.monitoredChannel.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!channel) {
    res.status(404).json({ error: "Monitored channel not found" });
    return;
  }

  if (!channel.telegramAccountId) {
    res.status(400).json({ error: "telegramAccountId is required to start monitoring" });
    return;
  }

  const account = await prisma.telegramAccount.findFirst({
    where: { id: channel.telegramAccountId, workspaceId }
  });

  if (!account || account.status !== TelegramAccountStatus.CONNECTED) {
    res.status(400).json({ error: "Linked telegram account must be CONNECTED" });
    return;
  }

  const updated = await prisma.monitoredChannel.update({
    where: { id: channel.id },
    data: {
      status: MonitoredChannelStatus.ACTIVE,
      monitoringStartedAt: new Date(),
      lastSeenPostId: null,
      syncError: null
    }
  });

  try {
    await pushTelegramMonitorJob({
      type: "monitor_channel",
      channelId: updated.id,
      workspaceId,
      telegramAccountId: updated.telegramAccountId!,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue monitoring job";
    await prisma.monitoredChannel.update({
      where: { id: updated.id },
      data: { syncError: message }
    });
    res.status(500).json({ error: message });
    return;
  }

  res.json(updated);
});

router.post("/:id/stop-monitoring", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const channel = await prisma.monitoredChannel.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!channel) {
    res.status(404).json({ error: "Monitored channel not found" });
    return;
  }

  const updated = await prisma.monitoredChannel.update({
    where: { id: channel.id },
    data: {
      status: MonitoredChannelStatus.PAUSED,
      syncError: null
    }
  });

  res.json(updated);
});

router.patch("/:id/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;

  const channel = await prisma.monitoredChannel.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!channel) {
    res.status(404).json({ error: "Monitored channel not found" });
    return;
  }

  const updated = await prisma.monitoredChannel.update({
    where: { id: channel.id },
    data: {
      freshnessWindowMinutes: parsed.data.freshnessWindowMinutes
    }
  });

  res.json(updated);
});

router.patch("/:id", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const existing = await prisma.monitoredChannel.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!existing) {
    res.status(404).json({ error: "Monitored channel not found" });
    return;
  }

  if (parsed.data.telegramAccountId) {
    const account = await prisma.telegramAccount.findFirst({
      where: { id: parsed.data.telegramAccountId, workspaceId }
    });
    if (!account) {
      res.status(400).json({ error: "telegramAccountId does not belong to current workspace" });
      return;
    }
  }

  const updated = await prisma.monitoredChannel.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      niche: parsed.data.niche,
      telegramAccountId: parsed.data.telegramAccountId,
      status: parsed.data.status
    }
  });

  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const existing = await prisma.monitoredChannel.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!existing) {
    res.status(404).json({ error: "Monitored channel not found" });
    return;
  }

  await prisma.monitoredChannel.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

router.post("/:id/check-health", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const channel = await prisma.monitoredChannel.findFirst({
    where: { id: req.params.id, workspaceId },
    include: { telegramAccount: true }
  });

  if (!channel) {
    res.status(404).json({ error: "Monitored channel not found" });
    return;
  }

  let code: ChannelHealthCode = "OK";
  let message = "Channel is healthy";

  if (!channel.telegramAccountId || !channel.telegramAccount) {
    code = "NO_ACCESS";
    message = "Channel has no linked telegram account";
  } else if (channel.telegramAccount.status !== TelegramAccountStatus.CONNECTED) {
    code = "NO_ACCESS";
    message = "Linked telegram account is not CONNECTED";
  } else {
    code = mapSyncErrorToHealth(channel.syncError);
    if (code !== "OK") {
      message = channel.syncError || "Unknown channel issue";
    }
  }

  res.json({
    channelId: channel.id,
    username: channel.username,
    health: code,
    message,
    advice: healthAdvice(code)
  });
});

export default router;
