import { Router } from "express";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { getWorkspaceDispatchCapability } from "./service";

const router = Router();

router.get("/status", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  try {
    const result = await getWorkspaceDispatchCapability(workspaceId);
    const { workspace, canDispatch, blockReason } = result;
    res.json({
      plan: workspace.plan,
      subscriptionStatus: workspace.subscriptionStatus,
      trialStartedAt: workspace.trialStartedAt,
      trialEndsAt: workspace.trialEndsAt,
      commentLimit: workspace.commentLimit,
      commentsSentCount: workspace.commentsSentCount,
      commentsRemaining: Math.max(0, workspace.commentLimit - workspace.commentsSentCount),
      canDispatch,
      blockReason
    });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Workspace not found" });
  }
});

router.post("/dev-activate", async (req, res) => {
  if (env.NODE_ENV === "production") {
    res.status(403).json({ error: "Not allowed in production" });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      subscriptionStatus: "active",
      plan: "pro"
    }
  });

  res.json({
    ok: true,
    workspace: {
      id: updated.id,
      plan: updated.plan,
      subscriptionStatus: updated.subscriptionStatus
    }
  });
});

export default router;
