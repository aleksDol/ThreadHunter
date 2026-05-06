-- CreateEnum
CREATE TYPE "OpportunityAnalysisStatus" AS ENUM ('PENDING', 'ANALYZED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "CommentOpportunity" ADD COLUMN     "analysisReason" TEXT,
ADD COLUMN     "analysisStatus" "OpportunityAnalysisStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "commentType" TEXT,
ADD COLUMN     "keyTopic" TEXT,
ADD COLUMN     "spamRiskReason" TEXT;

