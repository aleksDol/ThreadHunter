import { Router } from "express";
import { MonitoredChannelStatus, TelegramAccountStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";

const router = Router();
const prismaAny = prisma as any;

const settingsPatchSchema = z.object({
  neutralCommentsEnabled: z.boolean().optional(),
  commentMixPreset: z.enum(["cautious", "balanced", "active"]).optional()
});

router.get("/", (req, res) => {
  res.json({ module: "workspaces", status: "ok", auth: req.auth });
});

router.get("/onboarding-status", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const [connectedAccounts, channels, kbItems, activeMonitoring, generated] = await Promise.all([
    prisma.telegramAccount.count({
      where: { workspaceId, status: TelegramAccountStatus.CONNECTED }
    }),
    prisma.monitoredChannel.count({
      where: { workspaceId }
    }),
    prisma.knowledgeBase.count({
      where: { workspaceId }
    }),
    prisma.monitoredChannel.count({
      where: { workspaceId, status: MonitoredChannelStatus.ACTIVE }
    }),
    prisma.generatedComment.count({
      where: { workspaceId }
    })
  ]);

  res.json({
    hasConnectedAccount: connectedAccounts > 0,
    hasMonitoredChannel: channels > 0,
    hasKnowledgeBase: kbItems > 0,
    hasActiveMonitoring: activeMonitoring > 0,
    hasGeneratedComments: generated > 0
  });
});

router.get("/settings", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const workspace = await prismaAny.workspace.findUnique({
    where: { id: workspaceId },
    select: { neutralCommentsEnabled: true, commentMixPreset: true }
  });

  res.json({
    neutralCommentsEnabled: workspace?.neutralCommentsEnabled ?? false,
    commentMixPreset: workspace?.commentMixPreset ?? "balanced"
  });
});

router.patch("/settings", async (req, res) => {
  const parsed = settingsPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const updated = await prismaAny.workspace.update({
    where: { id: workspaceId },
    data: {
      neutralCommentsEnabled: parsed.data.neutralCommentsEnabled,
      commentMixPreset: parsed.data.commentMixPreset
    },
    select: { neutralCommentsEnabled: true, commentMixPreset: true }
  });

  res.json(updated);
});

export default router;
