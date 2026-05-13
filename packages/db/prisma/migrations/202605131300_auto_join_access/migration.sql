ALTER TABLE "MonitoredChannel"
ADD COLUMN "joinStatus" TEXT,
ADD COLUMN "joinError" TEXT,
ADD COLUMN "joinedAt" TIMESTAMP(3),
ADD COLUMN "discussionUsername" TEXT,
ADD COLUMN "discussionJoinStatus" TEXT,
ADD COLUMN "discussionJoinError" TEXT,
ADD COLUMN "discussionJoinedAt" TIMESTAMP(3),
ADD COLUMN "nextJoinAttemptAt" TIMESTAMP(3),
ADD COLUMN "joinAttemptCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AccountSafetyState"
ADD COLUMN "dailyJoinCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastJoinAt" TIMESTAMP(3),
ADD COLUMN "joinCooldownUntil" TIMESTAMP(3),
ADD COLUMN "maxJoinPerDay" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "minJoinDelayMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "lastJoinDailyResetAt" TIMESTAMP(3);
