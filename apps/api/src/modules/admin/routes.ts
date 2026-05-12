import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";

const router = Router();
const prismaAny = prisma as any;

const billingPatchSchema = z
  .object({
    plan: z.enum(["trial", "pro", "blocked"]).optional(),
    subscriptionStatus: z.enum(["trialing", "active", "blocked", "expired"]).optional(),
    trialEndsAt: z.union([z.string().datetime(), z.null()]).optional(),
    commentLimit: z.number().int().min(0).max(100000).optional(),
    commentsSentCount: z.number().int().min(0).max(100000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

router.get("/users", async (_req, res) => {
  const users = await prismaAny.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      telegramId: true,
      username: true,
      telegramVerifiedAt: true,
      createdAt: true,
      isAdmin: true,
      ownedWorkspaces: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          name: true,
          plan: true,
          subscriptionStatus: true,
          trialStartedAt: true,
          trialEndsAt: true,
          commentLimit: true,
          commentsSentCount: true,
          neutralCommentsEnabled: true
        }
      }
    }
  });

  res.json(
    users.map((user: any) => ({
      userId: user.id,
      email: user.email,
      telegramId: user.telegramId,
      username: user.username,
      telegramVerifiedAt: user.telegramVerifiedAt,
      createdAt: user.createdAt,
      isAdmin: user.isAdmin,
      workspace: user.ownedWorkspaces[0] ?? null
    }))
  );
});

router.get("/users/:userId", async (req, res) => {
  const { userId } = req.params;

  const user = await prismaAny.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      telegramId: true,
      username: true,
      firstName: true,
      telegramVerifiedAt: true,
      createdAt: true,
      isAdmin: true,
      ownedWorkspaces: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          name: true,
          plan: true,
          trialStartedAt: true,
          trialEndsAt: true,
          subscriptionStatus: true,
          commentLimit: true,
          commentsSentCount: true,
          neutralCommentsEnabled: true,
          createdAt: true
        }
      }
    }
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const workspace = user.ownedWorkspaces[0];
  if (!workspace) {
    res.json({
      user,
      workspace: null
    });
    return;
  }

  const [telegramAccounts, monitoredChannels, ownedChannels, generatedComments, dispatchJobs, lastGenerated] =
    await Promise.all([
      prismaAny.telegramAccount.groupBy({
        by: ["status"],
        where: { workspaceId: workspace.id },
        _count: { _all: true }
      }),
      prismaAny.monitoredChannel.groupBy({
        by: ["status"],
        where: { workspaceId: workspace.id },
        _count: { _all: true }
      }),
      prismaAny.ownedChannel.count({ where: { workspaceId: workspace.id } }),
      prismaAny.generatedComment.count({ where: { workspaceId: workspace.id } }),
      prismaAny.dispatchJob.count({ where: { workspaceId: workspace.id, status: "SENT" } }),
      prismaAny.generatedComment.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
      })
    ]);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      telegramVerifiedAt: user.telegramVerifiedAt,
      createdAt: user.createdAt,
      isAdmin: user.isAdmin
    },
    workspace,
    stats: {
      telegramAccounts: {
        total: telegramAccounts.reduce((sum: number, item: any) => sum + item._count._all, 0),
        byStatus: telegramAccounts
      },
      monitoredChannels: {
        total: monitoredChannels.reduce((sum: number, item: any) => sum + item._count._all, 0),
        byStatus: monitoredChannels
      },
      ownedChannelsCount: ownedChannels,
      generatedCommentsCount: generatedComments,
      commentsSentCount: dispatchJobs,
      lastActivityAt: lastGenerated?.createdAt ?? null
    }
  });
});

router.patch("/workspaces/:workspaceId/billing", async (req, res) => {
  const parsed = billingPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { workspaceId } = req.params;
  const payload = parsed.data;
  const existing = await prismaAny.workspace.findUnique({ where: { id: workspaceId } });

  if (!existing) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const data: Record<string, unknown> = {};
  if (payload.plan !== undefined) data.plan = payload.plan;
  if (payload.subscriptionStatus !== undefined) data.subscriptionStatus = payload.subscriptionStatus;
  if (payload.trialEndsAt !== undefined) {
    data.trialEndsAt = payload.trialEndsAt ? new Date(payload.trialEndsAt) : null;
  }
  if (payload.commentLimit !== undefined) data.commentLimit = payload.commentLimit;
  if (payload.commentsSentCount !== undefined) data.commentsSentCount = payload.commentsSentCount;

  const updated = await prismaAny.workspace.update({
    where: { id: workspaceId },
    data,
    select: {
      id: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      trialStartedAt: true,
      trialEndsAt: true,
      commentLimit: true,
      commentsSentCount: true,
      neutralCommentsEnabled: true
    }
  });

  const adminUser = await prismaAny.user.findUnique({
    where: { id: req.auth!.userId },
    select: { email: true }
  });

  console.info("[admin_billing_update]", {
    adminEmail: adminUser?.email ?? "unknown",
    workspaceId,
    changedFields: Object.keys(data)
  });

  res.json({ workspace: updated });
});

export default router;
