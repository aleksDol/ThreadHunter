ALTER TABLE "Workspace"
ADD COLUMN "commentMixPreset" TEXT NOT NULL DEFAULT 'balanced';

ALTER TABLE "CommentOpportunity"
ADD COLUMN "allowedIntents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
