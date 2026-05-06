import { OwnedChannelStatus, TelegramAccountStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { pushOwnedChannelAiProfileJob, pushOwnedChannelSyncJob } from "../../config/queue";

const router = Router();
const prismaAny = prisma as any;

const createSchema = z.object({
  username: z.string().trim().min(1),
  telegramAccountId: z.string().trim().min(1).optional()
});

function normalizeChannelUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@+/, "")
    .replace(/\?.*$/, "")
    .replace(/\/$/, "")
    .trim()
    .toLowerCase();
}

router.get("/", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const items = await prisma.ownedChannel.findMany({
    where: { workspaceId },
    include: {
      telegramAccount: {
        select: {
          id: true,
          displayName: true,
          username: true,
          firstName: true,
          lastName: true,
          status: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  res.json(items);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const username = normalizeChannelUsername(parsed.data.username);

  if (!username) {
    res.status(400).json({ error: "Username is required" });
    return;
  }

  let telegramAccountId: string | undefined;

  if (parsed.data.telegramAccountId) {
    const account = await prisma.telegramAccount.findFirst({
      where: {
        id: parsed.data.telegramAccountId,
        workspaceId,
        status: TelegramAccountStatus.CONNECTED
      },
      select: { id: true }
    });

    if (!account) {
      res.status(400).json({ error: "Telegram account must be connected and belong to this workspace" });
      return;
    }

    telegramAccountId = account.id;
  }

  try {
    const created = await prisma.ownedChannel.create({
      data: {
        workspaceId,
        telegramAccountId,
        username,
        status: OwnedChannelStatus.PENDING
      },
      include: {
        telegramAccount: {
          select: {
            id: true,
            displayName: true,
            username: true,
            firstName: true,
            lastName: true,
            status: true
          }
        }
      }
    });

    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create owned channel";
    if (message.includes("OwnedChannel_workspaceId_username_key")) {
      res.status(409).json({ error: "Этот канал уже добавлен" });
      return;
    }

    res.status(500).json({ error: "Failed to create owned channel" });
  }
});

router.delete("/:id", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const existing = await prisma.ownedChannel.findFirst({
    where: { id: req.params.id, workspaceId },
    select: { id: true }
  });

  if (!existing) {
    res.status(404).json({ error: "Owned channel not found" });
    return;
  }

  await prisma.ownedChannel.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

router.post("/:id/sync-stats", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const channel = await prisma.ownedChannel.findFirst({
    where: { id: req.params.id, workspaceId },
    select: { id: true }
  });

  if (!channel) {
    res.status(404).json({ error: "Owned channel not found" });
    return;
  }

  await pushOwnedChannelSyncJob({
    type: "sync_owned_channel_stats",
    workspaceId,
    ownedChannelId: channel.id,
    createdAt: new Date().toISOString()
  });

  res.json({ status: "queued" });
});

router.get("/:id/ai-profile", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const ownedChannel = await prisma.ownedChannel.findFirst({
    where: { id: req.params.id, workspaceId },
    select: { id: true }
  });

  if (!ownedChannel) {
    res.status(404).json({ error: "Owned channel not found" });
    return;
  }

  const profile = await prismaAny.ownedChannelAiProfile.findUnique({
    where: { ownedChannelId: ownedChannel.id }
  });

  res.json(profile);
});

router.post("/:id/generate-ai-profile", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const ownedChannel = await prisma.ownedChannel.findFirst({
    where: { id: req.params.id, workspaceId },
    select: { id: true }
  });

  if (!ownedChannel) {
    res.status(404).json({ error: "Owned channel not found" });
    return;
  }

  await prismaAny.ownedChannelAiProfile.upsert({
    where: { ownedChannelId: ownedChannel.id },
    update: {
      status: "PENDING",
      generatedAt: null
    },
    create: {
      workspaceId,
      ownedChannelId: ownedChannel.id,
      status: "PENDING"
    }
  });

  await pushOwnedChannelAiProfileJob({
    type: "generate_owned_channel_ai_profile",
    workspaceId,
    ownedChannelId: ownedChannel.id,
    createdAt: new Date().toISOString()
  });

  res.json({ status: "queued" });
});

router.get("/:id/context-summary", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const ownedChannelId = req.params.id;

  const channel = await prisma.ownedChannel.findFirst({
    where: { id: ownedChannelId, workspaceId },
    include: {
      telegramAccount: {
        select: {
          id: true,
          displayName: true,
          username: true,
          firstName: true,
          status: true
        }
      }
    }
  });

  if (!channel) {
    res.status(404).json({ error: "Owned channel not found" });
    return;
  }

  const [aiProfile, latestSnapshot, firstSnapshot, postSampleCount] = await Promise.all([
    prismaAny.ownedChannelAiProfile.findUnique({ where: { ownedChannelId } }),
    prisma.ownedChannelStatsSnapshot.findFirst({
      where: { workspaceId, ownedChannelId },
      orderBy: { capturedAt: "desc" }
    }),
    prisma.ownedChannelStatsSnapshot.findFirst({
      where: { workspaceId, ownedChannelId },
      orderBy: { capturedAt: "asc" }
    }),
    prismaAny.ownedChannelPostSample.count({
      where: { workspaceId, ownedChannelId }
    })
  ]);

  const deltaSubscriberCount =
    latestSnapshot?.subscriberCount != null && firstSnapshot?.subscriberCount != null
      ? latestSnapshot.subscriberCount - firstSnapshot.subscriberCount
      : null;

  const deltaAverageViews =
    latestSnapshot?.averageViews != null && firstSnapshot?.averageViews != null
      ? latestSnapshot.averageViews - firstSnapshot.averageViews
      : null;

  res.json({
    channel,
    aiProfile,
    latestSnapshot,
    firstSnapshot,
    delta: {
      subscriberCount: deltaSubscriberCount,
      averageViews: deltaAverageViews
    },
    postSampleCount
  });
});

export default router;
