import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma";

const router = Router();

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(12000)
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(12000).optional()
});

router.get("/", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const items = await prisma.knowledgeBase.findMany({
    where: { workspaceId },
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
  const created = await prisma.knowledgeBase.create({
    data: {
      workspaceId,
      title: parsed.data.title,
      content: parsed.data.content
    }
  });

  res.status(201).json(created);
});

router.patch("/:id", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const existing = await prisma.knowledgeBase.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!existing) {
    res.status(404).json({ error: "Knowledge base item not found" });
    return;
  }

  const updated = await prisma.knowledgeBase.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      content: parsed.data.content
    }
  });

  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const existing = await prisma.knowledgeBase.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!existing) {
    res.status(404).json({ error: "Knowledge base item not found" });
    return;
  }

  await prisma.knowledgeBase.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
