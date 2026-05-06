import crypto from "crypto";

export type TelegramAuthPayload = {
  id: string | number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  auth_date?: string | number;
  hash?: string;
};

function toRecord(payload: TelegramAuthPayload): Record<string, string> {
  const entries = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return Object.fromEntries(entries);
}

export function verifyTelegramAuthHash(payload: TelegramAuthPayload, botToken: string): boolean {
  if (!payload.hash) return false;

  const data = toRecord(payload);
  const dataCheckString = Object.entries(data)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const received = Buffer.from(payload.hash, "hex");
  const expected = Buffer.from(calculatedHash, "hex");

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(received, expected);
}
