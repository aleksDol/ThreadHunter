-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "neutralCommentsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommentOpportunity" ADD COLUMN "commentIntent" TEXT;

-- AlterTable
ALTER TABLE "GeneratedComment" ADD COLUMN "commentIntent" TEXT;
