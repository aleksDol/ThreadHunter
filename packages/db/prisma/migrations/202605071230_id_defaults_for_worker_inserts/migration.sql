CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "CommentOpportunity"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE "OwnedChannelStatsSnapshot"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE "OwnedChannelPostSample"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE "AccountSafetyState"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
