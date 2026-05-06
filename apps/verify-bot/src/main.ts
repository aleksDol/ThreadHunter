import { config } from "dotenv";
import { Telegraf } from "telegraf";
import { z } from "zod";

config();

const envSchema = z.object({
  TELEGRAM_VERIFY_BOT_TOKEN: z.string().min(1),
  TELEGRAM_VERIFY_BOT_USERNAME: z.string().min(1),
  INTERNAL_BOT_SECRET: z.string().min(1),
  API_INTERNAL_URL: z.string().default("http://api:4000")
});

const env = envSchema.parse(process.env);
const bot = new Telegraf(env.TELEGRAM_VERIFY_BOT_TOKEN);

function extractVerifyToken(text: string): string | null {
  const match = text.match(/^\/start\s+verify_([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

bot.start(async (ctx) => {
  const token = extractVerifyToken(ctx.message.text || "");
  if (!token) {
    await ctx.reply("Используйте ссылку из личного кабинета, чтобы подтвердить Telegram.");
    return;
  }

  const telegramId = String(ctx.from.id);
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  const lastName = ctx.from.last_name;

  try {
    const response = await fetch(`${env.API_INTERNAL_URL}/internal/auth/telegram-verification/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token,
        telegramId,
        username,
        firstName,
        lastName,
        secret: env.INTERNAL_BOT_SECRET
      })
    });

    if (!response.ok) {
      await ctx.reply("Ссылка устарела или недействительна. Вернитесь в кабинет и получите новую ссылку.");
      return;
    }

    await ctx.reply("Готово, Telegram подтверждён. Вернитесь в кабинет.");
  } catch {
    await ctx.reply("Не удалось подтвердить Telegram. Попробуйте снова через минуту.");
  }
});

bot.catch((error) => {
  console.error("[verify-bot] error", error);
});

bot
  .launch()
  .then(() => {
    console.info(`[verify-bot] started as @${env.TELEGRAM_VERIFY_BOT_USERNAME}`);
  })
  .catch((error) => {
    console.error("[verify-bot] fatal", error);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
