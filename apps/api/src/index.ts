import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { env } from "./config/env";
import authRoutes from "./modules/auth/routes";
import adminRoutes from "./modules/admin/routes";
import billingRoutes from "./modules/billing/routes";
import commentsRoutes from "./modules/comments/routes";
import internalAuthRoutes from "./modules/internal-auth/routes";
import knowledgeBaseRoutes from "./modules/knowledge-base/routes";
import monitoredChannelsRoutes from "./modules/monitored-channels/routes";
import ownedChannelsRoutes from "./modules/owned-channels/routes";
import telegramAccountsRoutes from "./modules/telegram-accounts/routes";
import workspacesRoutes from "./modules/workspaces/routes";
import { requireAdmin, requireAuth } from "./middleware/auth";

const app = express();

app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" });
});

app.use("/auth", authRoutes);
app.use("/internal/auth", internalAuthRoutes);
app.use("/workspaces", requireAuth, workspacesRoutes);
app.use("/telegram-accounts", requireAuth, telegramAccountsRoutes);
app.use("/monitored-channels", requireAuth, monitoredChannelsRoutes);
app.use("/owned-channels", requireAuth, ownedChannelsRoutes);
app.use("/knowledge-base", requireAuth, knowledgeBaseRoutes);
app.use("/comments", requireAuth, commentsRoutes);
app.use("/billing", requireAuth, billingRoutes);
app.use("/admin", requireAdmin, adminRoutes);

app.listen(env.API_PORT, () => {
  console.log(`API is running on port ${env.API_PORT}`);
});
