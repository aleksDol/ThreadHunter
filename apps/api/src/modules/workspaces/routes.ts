import { Router } from "express";
import { MonitoredChannelStatus, TelegramAccountStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";

const router = Router();

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

export default router;
