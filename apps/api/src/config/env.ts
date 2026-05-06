import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  NEXT_PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().optional(),
  TELEGRAM_AUTH_BOT_TOKEN: z.string().optional(),
  ENABLE_LEGACY_TELEGRAM_AUTH: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  TELEGRAM_SESSION_ENCRYPTION_KEY: z.string().optional(),
  TELEGRAM_VERIFY_BOT_USERNAME: z.string().optional(),
  INTERNAL_BOT_SECRET: z.string().optional()
});

export const env = envSchema.parse(process.env);

export function getJwtSecretOrThrow(): string {
  const secret = env.JWT_SECRET;

  if (!secret || !secret.trim()) {
    throw new Error(
      "JWT_SECRET is missing. Please set JWT_SECRET in .env before starting API."
    );
  }

  return secret;
}

export function getTelegramSessionEncryptionKeyOrThrow(): string {
  const key = env.TELEGRAM_SESSION_ENCRYPTION_KEY;

  if (!key || !key.trim()) {
    throw new Error(
      "TELEGRAM_SESSION_ENCRYPTION_KEY is missing. Please set it before Telegram QR login."
    );
  }

  return key;
}

export function getInternalBotSecretOrThrow(): string {
  const secret = env.INTERNAL_BOT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error("INTERNAL_BOT_SECRET is missing. Please set it for internal bot verification endpoint.");
  }
  return secret;
}
