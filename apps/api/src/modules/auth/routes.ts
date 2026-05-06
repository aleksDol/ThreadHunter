import { WorkspaceRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { env, getJwtSecretOrThrow } from "../../config/env";
import { prisma } from "../../config/prisma";
import { getAuthContext } from "../../middleware/auth";
import { signSessionToken } from "./jwt";
import { verifyTelegramAuthHash } from "./telegram-auth";

const router = Router();

const telegramPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.union([z.string(), z.number()]).optional(),
  hash: z.string().optional()
});

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;

function parseAuthDate(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

router.post("/telegram", async (req, res) => {
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

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: payload.username,
      firstName: payload.first_name
    },
    create: {
      telegramId,
      username: payload.username,
      firstName: payload.first_name
    }
  });

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

  const token = signSessionToken({
    userId: user.id,
    workspaceId: workspace.id,
    role: "owner"
  });

  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/"
  });

  res.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName
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
    prisma.user.findUnique({ where: { id: auth.userId } }),
    prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
  ]);

  if (!user || !workspace) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName
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
