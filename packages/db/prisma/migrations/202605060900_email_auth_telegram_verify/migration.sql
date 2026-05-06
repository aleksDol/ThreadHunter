ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
ADD COLUMN IF NOT EXISTS "telegramVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "telegramVerificationToken" TEXT,
ADD COLUMN IF NOT EXISTS "telegramVerificationExpiresAt" TIMESTAMP(3);

DO $$ BEGIN
  CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX "User_telegramVerificationToken_key" ON "User"("telegramVerificationToken");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
