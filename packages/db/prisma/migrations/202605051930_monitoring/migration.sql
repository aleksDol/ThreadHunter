-- AlterTable
ALTER TABLE "MonitoredChannel" ADD COLUMN     "freshnessWindowMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "lastSeenPostId" TEXT,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "monitoringStartedAt" TIMESTAMP(3),
ADD COLUMN     "syncError" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommentOpportunity_workspaceId_monitoredChannelId_externalP_key" ON "CommentOpportunity"("workspaceId", "monitoredChannelId", "externalPostId");

