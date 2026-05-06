-- CreateEnum
CREATE TYPE "AiProfileStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "OwnedChannelPostSample" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownedChannelId" TEXT NOT NULL,
    "externalPostId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "postDate" TIMESTAMP(3),
    "views" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnedChannelPostSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnedChannelAiProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownedChannelId" TEXT NOT NULL,
    "status" "AiProfileStatus" NOT NULL DEFAULT 'PENDING',
    "sourcePostCount" INTEGER,
    "lastAnalyzedPostId" TEXT,
    "styleSummary" TEXT,
    "topicSummary" TEXT,
    "positioningSummary" TEXT,
    "recurringIdeas" TEXT,
    "vocabularyNotes" TEXT,
    "offerNotes" TEXT,
    "avoidNotes" TEXT,
    "combinedPromptContext" TEXT,
    "generatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnedChannelAiProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnedChannelPostSample_workspaceId_ownedChannelId_externalPostId_key" ON "OwnedChannelPostSample"("workspaceId", "ownedChannelId", "externalPostId");

-- CreateIndex
CREATE INDEX "OwnedChannelPostSample_workspaceId_ownedChannelId_postDate_idx" ON "OwnedChannelPostSample"("workspaceId", "ownedChannelId", "postDate");

-- CreateIndex
CREATE UNIQUE INDEX "OwnedChannelAiProfile_ownedChannelId_key" ON "OwnedChannelAiProfile"("ownedChannelId");

-- CreateIndex
CREATE INDEX "OwnedChannelAiProfile_workspaceId_idx" ON "OwnedChannelAiProfile"("workspaceId");

-- AddForeignKey
ALTER TABLE "OwnedChannelPostSample" ADD CONSTRAINT "OwnedChannelPostSample_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedChannelPostSample" ADD CONSTRAINT "OwnedChannelPostSample_ownedChannelId_fkey" FOREIGN KEY ("ownedChannelId") REFERENCES "OwnedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedChannelAiProfile" ADD CONSTRAINT "OwnedChannelAiProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedChannelAiProfile" ADD CONSTRAINT "OwnedChannelAiProfile_ownedChannelId_fkey" FOREIGN KEY ("ownedChannelId") REFERENCES "OwnedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
