import { TelegramAccountStatus, TelegramLoginSessionStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { getTelegramSessionEncryptionKeyOrThrow } from "../../config/env";
import { prisma } from "../../config/prisma";
import { pushTelegramLoginJob } from "../../config/queue";
import { safeTelegramAccountSelect, toSafeTelegramAccount } from "./dto";

const router = Router();

const createSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  proxyHost: z.string().trim().min(1).optional(),
  proxyPort: z.number().int().min(1).max(65535).optional(),
  proxyUsername: z.string().trim().min(1).optional(),
  proxyPassword: z.string().trim().min(1).optional()
});

const patchSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  proxyHost: z.string().trim().min(1).optional(),
  proxyPort: z.number().int().min(1).max(65535).nullable().optional(),
  proxyUsername: z.string().trim().min(1).optional(),
  proxyPassword: z.string().trim().min(1).optional()
});

const startConnectSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  proxyHost: z.string().trim().min(1).optional(),
  proxyPort: z.number().int().min(1).max(65535).optional(),
  proxyUsername: z.string().trim().min(1).optional(),
  proxyPassword: z.string().trim().min(1).optional()
});

const safetyPatchSchema = z.object({
  dailyLimit: z.number().int().min(1).max(50).optional(),
  minDelayMinutes: z.number().int().min(5).max(180).optional(),
  activeFromHour: z.number().int().min(0).max(23).optional(),
  activeToHour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().trim().min(1).optional()
});

function assertValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

router.get("/", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const items = await prisma.telegramAccount.findMany({
    where: { workspaceId },
    select: safeTelegramAccountSelect,
    orderBy: { createdAt: "desc" }
  });

  res.json(items.map(toSafeTelegramAccount));
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const data = parsed.data;

  const created = await prisma.telegramAccount.create({
    data: {
      workspaceId,
      displayName: data.displayName,
      phone: data.phone,
      status: TelegramAccountStatus.PENDING,
      proxyHost: data.proxyHost,
      proxyPort: data.proxyPort,
      proxyUsername: data.proxyUsername,
      // TODO: Encrypt proxy password at rest before production use.
      proxyPassword: data.proxyPassword
    },
    select: safeTelegramAccountSelect
  });

  res.status(201).json(toSafeTelegramAccount(created));
});

router.post("/connect/start", async (req, res) => {
  const parsed = startConnectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  try {
    getTelegramSessionEncryptionKeyOrThrow();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
    return;
  }

  const workspaceId = req.auth!.workspaceId;

  const account = await prisma.telegramAccount.create({
    data: {
      workspaceId,
      displayName: parsed.data.displayName,
      status: TelegramAccountStatus.CONNECTING,
      proxyHost: parsed.data.proxyHost,
      proxyPort: parsed.data.proxyPort,
      proxyUsername: parsed.data.proxyUsername,
      proxyPassword: parsed.data.proxyPassword,
      connectionError: null
    }
  });

  await prisma.accountSafetyState.create({
    data: { telegramAccountId: account.id }
  });

  const loginSession = await prisma.telegramLoginSession.create({
    data: {
      workspaceId,
      telegramAccountId: account.id,
      status: TelegramLoginSessionStatus.PENDING,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000)
    }
  });

  const payload = {
    type: "telegram_login_start" as const,
    loginSessionId: loginSession.id,
    telegramAccountId: account.id,
    workspaceId,
    createdAt: new Date().toISOString()
  };

  try {
    await pushTelegramLoginJob(payload);
    console.info("[telegram-login] queued", {
      loginSessionId: loginSession.id,
      telegramAccountId: account.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Queue push failed";

    await prisma.telegramLoginSession.update({
      where: { id: loginSession.id },
      data: { status: TelegramLoginSessionStatus.FAILED, error: message }
    });

    await prisma.telegramAccount.update({
      where: { id: account.id },
      data: { status: TelegramAccountStatus.FAILED, connectionError: message }
    });

    res.status(500).json({ error: "Failed to enqueue telegram login job" });
    return;
  }

  res.status(201).json({
    accountId: account.id,
    loginSessionId: loginSession.id,
    status: loginSession.status
  });
});

router.get("/:id/safety", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const account = await prisma.telegramAccount.findFirst({ where: { id: req.params.id, workspaceId } });

  if (!account) {
    res.status(404).json({ error: "Telegram account not found" });
    return;
  }

  const state = await prisma.accountSafetyState.upsert({
    where: { telegramAccountId: account.id },
    update: {},
    create: { telegramAccountId: account.id }
  });

  res.json(state);
});

router.patch("/:id/safety", async (req, res) => {
  const parsed = safetyPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { activeFromHour, activeToHour, timezone } = parsed.data;
  if (activeFromHour !== undefined && activeToHour !== undefined && activeFromHour === activeToHour) {
    res.status(400).json({ error: "activeFromHour must be different from activeToHour" });
    return;
  }

  if (timezone && !assertValidTimezone(timezone)) {
    res.status(400).json({ error: "Invalid timezone" });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const account = await prisma.telegramAccount.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!account) {
    res.status(404).json({ error: "Telegram account not found" });
    return;
  }

  const existing = await prisma.accountSafetyState.upsert({
    where: { telegramAccountId: account.id },
    update: {},
    create: { telegramAccountId: account.id }
  });

  const nextFrom = activeFromHour ?? existing.activeFromHour;
  const nextTo = activeToHour ?? existing.activeToHour;
  if (nextFrom === nextTo) {
    res.status(400).json({ error: "activeFromHour must be different from activeToHour" });
    return;
  }

  const updated = await prisma.accountSafetyState.update({
    where: { telegramAccountId: account.id },
    data: {
      dailyLimit: parsed.data.dailyLimit,
      minDelayMinutes: parsed.data.minDelayMinutes,
      activeFromHour: parsed.data.activeFromHour,
      activeToHour: parsed.data.activeToHour,
      timezone: parsed.data.timezone
    }
  });

  res.json(updated);
});

router.get("/connect/:loginSessionId", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const loginSession = await prisma.telegramLoginSession.findFirst({
    where: { id: req.params.loginSessionId, workspaceId },
    select: {
      status: true,
      qrUrl: true,
      expiresAt: true,
      error: true,
      telegramAccount: { select: safeTelegramAccountSelect }
    }
  });

  if (!loginSession) {
    res.status(404).json({ error: "Login session not found" });
    return;
  }

  res.json({
    status: loginSession.status,
    qrUrl: loginSession.qrUrl,
    expiresAt: loginSession.expiresAt,
    error: loginSession.error,
    account: toSafeTelegramAccount(loginSession.telegramAccount)
  });
});

router.post("/connect/:loginSessionId/cancel", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;

  const loginSession = await prisma.telegramLoginSession.findFirst({
    where: { id: req.params.loginSessionId, workspaceId }
  });

  if (!loginSession) {
    res.status(404).json({ error: "Login session not found" });
    return;
  }

  await prisma.telegramLoginSession.update({
    where: { id: loginSession.id },
    data: {
      status: TelegramLoginSessionStatus.EXPIRED,
      error: "Canceled by user",
      qrUrl: null
    }
  });

  await prisma.telegramAccount.update({
    where: { id: loginSession.telegramAccountId },
    data: {
      status: TelegramAccountStatus.DISCONNECTED,
      connectionError: "Canceled by user"
    }
  });

  res.json({ ok: true });
});

router.patch("/:id", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const workspaceId = req.auth!.workspaceId;
  const existing = await prisma.telegramAccount.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!existing) {
    res.status(404).json({ error: "Telegram account not found" });
    return;
  }

  const updated = await prisma.telegramAccount.update({
    where: { id: existing.id },
    data: {
      displayName: parsed.data.displayName,
      proxyHost: parsed.data.proxyHost,
      proxyPort: parsed.data.proxyPort,
      proxyUsername: parsed.data.proxyUsername,
      proxyPassword: parsed.data.proxyPassword
    },
    select: safeTelegramAccountSelect
  });

  res.json(toSafeTelegramAccount(updated));
});

router.delete("/:id", async (req, res) => {
  const workspaceId = req.auth!.workspaceId;
  const existing = await prisma.telegramAccount.findFirst({
    where: { id: req.params.id, workspaceId }
  });

  if (!existing) {
    res.status(404).json({ error: "Telegram account not found" });
    return;
  }

  await prisma.telegramAccount.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
