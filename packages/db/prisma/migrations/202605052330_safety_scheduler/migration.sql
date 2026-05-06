-- AlterTable
ALTER TABLE "AccountSafetyState" ADD COLUMN     "activeFromHour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "activeToHour" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "dailyLimit" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "lastDailyResetAt" TIMESTAMP(3),
ADD COLUMN     "minDelayMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam';

