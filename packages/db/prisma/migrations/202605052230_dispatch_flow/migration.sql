-- AlterEnum
BEGIN;
CREATE TYPE "DispatchStatus_new" AS ENUM ('SCHEDULED', 'READY', 'SENT', 'FAILED', 'CANCELLED');
ALTER TABLE "DispatchJob" ALTER COLUMN "status" TYPE "DispatchStatus_new" USING ("status"::text::"DispatchStatus_new");
ALTER TYPE "DispatchStatus" RENAME TO "DispatchStatus_old";
ALTER TYPE "DispatchStatus_new" RENAME TO "DispatchStatus";
DROP TYPE "DispatchStatus_old";
COMMIT;

-- CreateIndex
CREATE UNIQUE INDEX "DispatchJob_generatedCommentId_key" ON "DispatchJob"("generatedCommentId");

