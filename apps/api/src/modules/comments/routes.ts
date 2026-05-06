import {
  DispatchStatus,
  GeneratedCommentStatus,
  OpportunityAnalysisStatus,
  OpportunityStatus,
  TelegramAccountStatus
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";
import { pushAiAnalysisJob, pushCommentGenerationJob } from "../../config/queue";
import { assertWorkspaceCanDispatch } from "../billing/service";

const router = Router();

const filtersSchema = z.object({
  status: z.nativeEnum(OpportunityStatus).optional(),
  channelId: z.string().cuid().optional(),
  analysisStatus: z.nativeEnum(OpportunityAnalysisStatus).optional(),
  onlyRecommended: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional()
});

const generatedFiltersSchema = z.object({
  status: z.nativeEnum(GeneratedCommentStatus).optional(),
  opportunityId: z.string().cuid().optional()
});

const generatedPatchSchema = z.object({
  text: z.string().trim().min(1).max(4000).optional(),
  status: z.enum(["APPROVED", "REJECTED"]).optional()
});

const dispatchFiltersSchema = z.object({
  status: z.nativeEnum(DispatchStatus).optional(),
  telegramAccountId: z.string().cuid().optional()
});

const dispatchPatchSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  status: z.literal("CANCELLED").optional()
});

function randomMinutes(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

router.get("/opportunities", async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid filters", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const where = {
    workspaceId,
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.channelId ? { monitoredChannelId: parsed.data.channelId } : {}),
    ...(parsed.data.analysisStatus ? { analysisStatus: parsed.data.analysisStatus } : {}),
    ...(parsed.data.onlyRecommended ? { shouldComment: true } : {})
  };

  const items = await prisma.commentOpportunity.findMany({
    where,
    include: {
      monitoredChannel: {
        select: {
          id: true,
          username: true,
          title: true,
          telegramAccountId: true
        }
      },
      generatedComments: {
        include: {
          dispatchJobs: true
        },
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { postDate: "desc" }
  });

  res.json(items);
});

router.post("/opportunities/:id/analyze", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const opportunity = await prisma.commentOpportunity.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!opportunity) {
    res.status(404).json({ error: "Opportunity not found" });
    return;
  }

  const updated = await prisma.commentOpportunity.update({
    where: { id: opportunity.id },
    data: {
      analysisStatus: OpportunityAnalysisStatus.PENDING,
      analysisReason: null
    }
  });

  try {
    await pushAiAnalysisJob({
      type: "analyze_comment_opportunity",
      workspaceId,
      opportunityId: opportunity.id,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to enqueue AI analysis";
    await prisma.commentOpportunity.update({
      where: { id: opportunity.id },
      data: {
        analysisStatus: OpportunityAnalysisStatus.FAILED,
        analysisReason: reason
      }
    });
    res.status(500).json({ error: reason });
    return;
  }

  res.json(updated);
});

router.post("/opportunities/:id/generate", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const opportunity = await prisma.commentOpportunity.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!opportunity) {
    res.status(404).json({ error: "Opportunity not found" });
    return;
  }

  if (
    opportunity.analysisStatus !== OpportunityAnalysisStatus.ANALYZED ||
    opportunity.shouldComment !== true ||
    opportunity.riskLevel?.toLowerCase() === "high"
  ) {
    res.status(400).json({ error: "Opportunity is not eligible for generation" });
    return;
  }

  try {
    await pushCommentGenerationJob({
      type: "generate_comment",
      workspaceId,
      opportunityId: opportunity.id,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to enqueue generation";
    res.status(500).json({ error: reason });
    return;
  }

  res.json({ ok: true });
});

router.get("/generated", async (req, res) => {
  const parsed = generatedFiltersSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid filters", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const items = await prisma.generatedComment.findMany({
    where: {
      workspaceId,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.opportunityId ? { opportunityId: parsed.data.opportunityId } : {})
    },
    include: {
      opportunity: {
        select: {
          postText: true,
          postDate: true,
          monitoredChannel: {
            select: {
              username: true,
              title: true
            }
          }
        }
      },
      dispatchJobs: {
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const normalized = items.map((item) => ({
    id: item.id,
    text: item.text,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    workspaceId: item.workspaceId,
    opportunityId: item.opportunityId,
    variant: item.variant,
    generationReason: item.generationReason,
    qualityScore: item.qualityScore,
    commentIntent: (item as any).commentIntent ?? null,
    safetyStatus: item.safetyStatus,
    safetyReason: item.safetyReason,
    opportunity: item.opportunity,
    dispatchJob: item.dispatchJobs[0] ?? null
  }));

  res.json(normalized);
});

router.patch("/generated/:id", async (req, res) => {
  const parsed = generatedPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const existing = await prisma.generatedComment.findFirst({
    where: { id: req.params.id, workspaceId },
    include: {
      opportunity: {
        include: {
          monitoredChannel: true
        }
      },
      dispatchJobs: true
    }
  });

  if (!existing) {
    res.status(404).json({ error: "Generated comment not found" });
    return;
  }

  const updateData: { text?: string; status?: GeneratedCommentStatus } = {};
  if (parsed.data.text !== undefined) {
    updateData.text = parsed.data.text;
  }

  if (parsed.data.status) {
    updateData.status = parsed.data.status as GeneratedCommentStatus;
  }

  let dispatchJob = existing.dispatchJobs[0] ?? null;

  if (parsed.data.status === "APPROVED") {
    try {
      await assertWorkspaceCanDispatch(workspaceId);
    } catch (error) {
      res.status(402).json({ error: error instanceof Error ? error.message : "Dispatch blocked by billing limits" });
      return;
    }

    const accountId =
      existing.opportunity.telegramAccountId || existing.opportunity.monitoredChannel.telegramAccountId;

    if (!accountId) {
      res.status(400).json({ error: "No telegram account linked to opportunity/channel" });
      return;
    }

    const account = await prisma.telegramAccount.findFirst({
      where: { id: accountId, workspaceId }
    });

    if (!account || account.status !== TelegramAccountStatus.CONNECTED) {
      res.status(400).json({ error: "Linked telegram account must be CONNECTED" });
      return;
    }

    if (!dispatchJob) {
      const scheduledAt = new Date(Date.now() + randomMinutes(10, 45) * 60 * 1000);
      dispatchJob = await prisma.dispatchJob.create({
        data: {
          workspaceId,
          generatedCommentId: existing.id,
          telegramAccountId: account.id,
          scheduledAt,
          status: DispatchStatus.SCHEDULED
        }
      });
    }

    updateData.status = GeneratedCommentStatus.QUEUED;
  }

  const updated = await prisma.generatedComment.update({
    where: { id: existing.id },
    data: updateData,
    include: {
      dispatchJobs: true
    }
  });

  res.json({
    generatedComment: updated,
    dispatchJob: dispatchJob || updated.dispatchJobs[0] || null
  });
});

router.get("/dispatch-jobs", async (req, res) => {
  const parsed = dispatchFiltersSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid filters", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const jobs = await prisma.dispatchJob.findMany({
    where: {
      workspaceId,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.telegramAccountId ? { telegramAccountId: parsed.data.telegramAccountId } : {})
    },
    include: {
      generatedComment: {
        select: {
          id: true,
          text: true,
          opportunityId: true
        }
      },
      telegramAccount: {
        select: {
          id: true,
          displayName: true,
          username: true,
          phone: true
        }
      }
    },
    orderBy: { scheduledAt: "asc" }
  });

  res.json(jobs);
});

router.patch("/dispatch-jobs/:id", async (req, res) => {
  const parsed = dispatchPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const job = await prisma.dispatchJob.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!job) {
    res.status(404).json({ error: "Dispatch job not found" });
    return;
  }

  const updated = await prisma.dispatchJob.update({
    where: { id: job.id },
    data: {
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
      status: parsed.data.status ? DispatchStatus.CANCELLED : undefined
    }
  });

  res.json(updated);
});

export default router;
