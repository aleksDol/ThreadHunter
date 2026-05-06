-- CreateEnum
CREATE TYPE "OwnedChannelStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');

-- CreateTable
CREATE TABLE "OwnedChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAccountId" TEXT,
    "username" TEXT NOT NULL,
    "title" TEXT,
    "status" "OwnedChannelStatus" NOT NULL DEFAULT 'PENDING',
    "subscriberCount" INTEGER,
    "averageViews" INTEGER,
    "lastPostId" TEXT,
    "lastStatsSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnedChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnedChannelStatsSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownedChannelId" TEXT NOT NULL,
    "subscriberCount" INTEGER,
    "averageViews" INTEGER,
    "postsSampled" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnedChannelStatsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnedChannel_workspaceId_username_key" ON "OwnedChannel"("workspaceId", "username");

-- CreateIndex
CREATE INDEX "OwnedChannel_workspaceId_idx" ON "OwnedChannel"("workspaceId");

-- CreateIndex
CREATE INDEX "OwnedChannelStatsSnapshot_workspaceId_ownedChannelId_capturedAt_idx" ON "OwnedChannelStatsSnapshot"("workspaceId", "ownedChannelId", "capturedAt");

-- AddForeignKey
ALTER TABLE "OwnedChannel" ADD CONSTRAINT "OwnedChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedChannel" ADD CONSTRAINT "OwnedChannel_telegramAccountId_fkey" FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedChannelStatsSnapshot" ADD CONSTRAINT "OwnedChannelStatsSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedChannelStatsSnapshot" ADD CONSTRAINT "OwnedChannelStatsSnapshot_ownedChannelId_fkey" FOREIGN KEY ("ownedChannelId") REFERENCES "OwnedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
