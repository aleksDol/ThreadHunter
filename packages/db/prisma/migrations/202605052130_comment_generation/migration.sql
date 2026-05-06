-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GeneratedCommentStatus" ADD VALUE 'QUEUED';
ALTER TYPE "GeneratedCommentStatus" ADD VALUE 'SENT';
ALTER TYPE "GeneratedCommentStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "GeneratedComment" ADD COLUMN     "generationReason" TEXT,
ADD COLUMN     "qualityScore" DOUBLE PRECISION,
ADD COLUMN     "safetyReason" TEXT,
ADD COLUMN     "safetyStatus" TEXT,
ADD COLUMN     "variant" TEXT;

