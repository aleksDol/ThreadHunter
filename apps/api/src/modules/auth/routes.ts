import crypto from "crypto";

import { WorkspaceRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Response, Router } from "express";
import { z } from "zod";

import { env, getAdminEmails, getJwtSecretOrThrow } from "../../config/env";
import { prisma } from "../../config/prisma";
import { getAuthContext } from "../../middleware/auth";
import { createRateLimiter, getClientIp } from "../../middleware/rate-limit";
import { signSessionToken } from "./jwt";
import { verifyTelegramAuthHash } from "./telegram-auth";

const router = Router();
const prismaAny = prisma as any;

const telegramPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.union([z.string(), z.number()]).optional(),
  hash: z.string().optional()
});

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1)
});

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;
const TELEGRAM_VERIFY_TOKEN_TTL_MS = 15 * 60 * 1000;
const ADMIN_EMAILS = getAdminEmails();

const loginRateLimit = createRateLimiter({
  scope: "auth_login",
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Слишком много попыток входа. Попробуйте позже.",
  key: (req) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "unknown_email";
    return `${getClientIp(req)}:${email}`;
  }
});

const registerRateLimit = createRateLimiter({
  scope: "auth_register",
  windowMs: 30 * 60 * 1000,
  max: 5,
  message: "Слишком много попыток регистрации. Попробуйте позже.",
  key: (req) => getClientIp(req)
});

const telegramVerifyStartRateLimit = createRateLimiter({
  scope: "auth_telegram_verify_start",
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Слишком много запросов на подтверждение Telegram. Попробуйте позже.",
  key: (req) => req.auth?.userId || "unknown_user"
});

function parseAuthDate(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/"
  });
}

async function ensureWorkspaceForUser(user: { id: string; username: string | null }) {
  let workspace = await prisma.workspace.findFirst({
    where: { ownerUserId: user.id },
    orderBy: { createdAt: "asc" }
  });

  if (!workspace) {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    workspace = await prisma.workspace.create({
      data: {
        ownerUserId: user.id,
        name: user.username ? `${user.username}'s workspace` : "Workspace",
        plan: "trial",
        subscriptionStatus: "trialing",
        trialStartedAt: now,
        trialEndsAt,
        commentLimit: 20,
        commentsSentCount: 0
      }
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: WorkspaceRole.OWNER
      }
    });
  }

  return workspace;
}

function shouldBeAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.trim().toLowerCase());
}

router.post("/register", registerRateLimit, async (req, res) => {
  try {
    getJwtSecretOrThrow();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
    return;
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const existing = await prismaAny.user.findUnique({ where: { email } });
  if (existing) {
    console.info("[auth_event]", { event: "register_failed_email_exists", email });
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prismaAny.user.create({
    data: {
      email,
      passwordHash,
      isAdmin: shouldBeAdmin(email)
    }
  });

  const workspace = await ensureWorkspaceForUser({ id: user.id, username: user.username ?? null });
  const token = signSessionToken({ userId: user.id, workspaceId: workspace.id, role: "owner" });
  setSessionCookie(res, token);
  console.info("[auth_event]", { event: "register_success", userId: user.id, email: user.email });

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      telegramVerifiedAt: user.telegramVerifiedAt
    },
    workspace: {
      id: workspace.id,
      name: workspace.name
    }
  });
});

router.post("/login", loginRateLimit, async (req, res) => {
  try {
    getJwtSecretOrThrow();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
    return;
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  let user = await prismaAny.user.findUnique({ where: { email } });

  if (!user?.passwordHash) {
    console.info("[auth_event]", { event: "login_failed", email });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    console.info("[auth_event]", { event: "login_failed", email });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const expectedAdmin = shouldBeAdmin(user.email);
  if (user.isAdmin !== expectedAdmin) {
    user = await prismaAny.user.update({
      where: { id: user.id },
      data: { isAdmin: expectedAdmin }
    });
  }

  const workspace = await ensureWorkspaceForUser({ id: user.id, username: user.username ?? null });
  const token = signSessionToken({ userId: user.id, workspaceId: workspace.id, role: "owner" });
  setSessionCookie(res, token);
  console.info("[auth_event]", { event: "login_success", userId: user.id, email: user.email });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      telegramVerifiedAt: user.telegramVerifiedAt
    },
    workspace: {
      id: workspace.id,
      name: workspace.name
    }
  });
});

router.post("/telegram-verification/start", telegramVerifyStartRateLimit, async (req, res) => {
  const auth = getAuthContext(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const botUsername = env.TELEGRAM_VERIFY_BOT_USERNAME?.trim();
  if (!botUsername) {
    res.status(500).json({ error: "TELEGRAM_VERIFY_BOT_USERNAME is not configured" });
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TELEGRAM_VERIFY_TOKEN_TTL_MS);

  await prisma.user.update({
    where: { id: auth.userId },
    data: {
      telegramVerificationToken: token,
      telegramVerificationExpiresAt: expiresAt
    }
  });
  console.info("[auth_event]", { event: "telegram_verify_started", userId: auth.userId });

  res.json({
    botUrl: `https://t.me/${botUsername}?start=verify_${token}`,
    expiresAt
  });
});

router.post("/telegram", async (req, res) => {
  if (!env.ENABLE_LEGACY_TELEGRAM_AUTH) {
    res.status(410).json({
      error: "Telegram Login Widget auth is deprecated. Use email/password login."
    });
    return;
  }

  try {
    getJwtSecretOrThrow();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
    return;
  }

  const parsed = telegramPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid telegram payload", details: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const telegramId = String(payload.id);
  const isProduction = env.NODE_ENV === "production";
  const authDateUnix = parseAuthDate(payload.auth_date);

  let hashIsValid = false;

  if (isProduction && !env.TELEGRAM_AUTH_BOT_TOKEN) {
    res.status(500).json({ error: "TELEGRAM_AUTH_BOT_TOKEN is required in production" });
    return;
  }

  if (env.TELEGRAM_AUTH_BOT_TOKEN) {
    if (!payload.hash) {
      res.status(401).json({ error: "Telegram auth verification failed" });
      return;
    }

    hashIsValid = verifyTelegramAuthHash(payload, env.TELEGRAM_AUTH_BOT_TOKEN);
  } else if (!isProduction) {
    hashIsValid = true;
  }

  if (!hashIsValid) {
    res.status(401).json({ error: "Telegram auth verification failed" });
    return;
  }

  if (isProduction || env.TELEGRAM_AUTH_BOT_TOKEN) {
    if (!authDateUnix) {
      res.status(401).json({ error: "Telegram auth verification failed" });
      return;
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    if (authDateUnix > nowUnix + MAX_FUTURE_SKEW_SECONDS) {
      res.status(401).json({ error: "Telegram auth payload is invalid" });
      return;
    }

    if (nowUnix - authDateUnix > MAX_AUTH_AGE_SECONDS) {
      res.status(401).json({ error: "Telegram auth payload is expired" });
      return;
    }
  }

  let user = await prismaAny.user.upsert({
    where: { telegramId },
    update: {
      username: payload.username,
      firstName: payload.first_name,
      telegramVerifiedAt: new Date()
    },
    create: {
      telegramId,
      username: payload.username,
      firstName: payload.first_name,
      telegramVerifiedAt: new Date()
    }
  });

  const expectedAdmin = shouldBeAdmin(user.email);
  if (user.isAdmin !== expectedAdmin) {
    user = await prismaAny.user.update({
      where: { id: user.id },
      data: { isAdmin: expectedAdmin }
    });
  }

  const workspace = await ensureWorkspaceForUser({ id: user.id, username: user.username ?? null });

  const token = signSessionToken({
    userId: user.id,
    workspaceId: workspace.id,
    role: "owner"
  });

  setSessionCookie(res, token);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      telegramVerifiedAt: user.telegramVerifiedAt
    },
    workspace: {
      id: workspace.id,
      name: workspace.name
    }
  });
});

router.get("/me", async (req, res) => {
  const auth = getAuthContext(req);

  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user, workspace] = await Promise.all([
    prismaAny.user.findUnique({ where: { id: auth.userId } }),
    prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
  ]);

  if (!user || !workspace) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      telegramVerifiedAt: user.telegramVerifiedAt
    },
    workspace: {
      id: workspace.id,
      name: workspace.name
    },
    role: auth.role
  });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("session", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/"
  });

  res.json({ ok: true });
});

export default router;

