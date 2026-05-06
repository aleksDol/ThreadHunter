import { Router } from "express";
import { z } from "zod";

import { getInternalBotSecretOrThrow } from "../../config/env";
import { prisma } from "../../config/prisma";
import { createRateLimiter, getClientIp } from "../../middleware/rate-limit";

const router = Router();

const telegramVerifyCompleteRateLimit = createRateLimiter({
  scope: "internal_telegram_verify_complete",
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: "Too many requests. Try again later.",
  key: (req) => getClientIp(req)
});

const completeSchema = z.object({
  token: z.string().min(1),
  telegramId: z.string().min(1),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  secret: z.string().min(1)
});

router.post("/telegram-verification/complete", telegramVerifyCompleteRateLimit, async (req, res) => {
  let expectedSecret = "";
  try {
    expectedSecret = getInternalBotSecretOrThrow();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
    return;
  }

  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  if (parsed.data.secret !== expectedSecret) {
    console.info("[auth_event]", { event: "telegram_verify_failed", reason: "invalid_secret" });
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { telegramVerificationToken: parsed.data.token } });
  if (!user || !user.telegramVerificationExpiresAt || user.telegramVerificationExpiresAt < new Date()) {
    console.info("[auth_event]", { event: "telegram_verify_failed", reason: "invalid_or_expired_token" });
    res.status(400).json({ error: "Verification token is invalid or expired" });
    return;
  }

  const alreadyBound = await prisma.user.findFirst({
    where: {
      telegramId: parsed.data.telegramId,
      id: { not: user.id }
    },
    select: { id: true }
  });

  if (alreadyBound) {
    console.info("[auth_event]", { event: "telegram_verify_failed", reason: "telegram_already_bound" });
    res.status(409).json({ error: "Telegram account is already linked to another user" });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramId: parsed.data.telegramId,
      username: parsed.data.username,
      firstName: parsed.data.firstName,
      telegramVerifiedAt: new Date(),
      telegramVerificationToken: null,
      telegramVerificationExpiresAt: null
    }
  });
  console.info("[auth_event]", { event: "telegram_verify_completed", userId: user.id });

  res.json({ ok: true });
});

export default router;
