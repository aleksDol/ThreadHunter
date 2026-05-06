import { config } from "dotenv";
import { Markup, Telegraf } from "telegraf";
import { z } from "zod";

config();

const envSchema = z.object({
  TELEGRAM_VERIFY_BOT_TOKEN: z.string().min(1),
  TELEGRAM_VERIFY_BOT_USERNAME: z.string().min(1),
  INTERNAL_BOT_SECRET: z.string().min(1),
  API_INTERNAL_URL: z.string().default("http://api:4000"),
  WEB_ORIGIN: z.string().default("https://comm.copilot-send-mes.ru")
});

const env = envSchema.parse(process.env);
const bot = new Telegraf(env.TELEGRAM_VERIFY_BOT_TOKEN);

function extractVerifyToken(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned.startsWith("/start")) return null;
  const payload = cleaned.slice("/start".length).trim();
  if (!payload || !payload.startsWith("verify_")) return null;
  const token = payload.slice("verify_".length).trim();
  return token || null;
}

bot.start(async (ctx) => {
  const token = extractVerifyToken(ctx.message.text || "");
  const backToDashboardButton = Markup.inlineKeyboard([
    [Markup.button.url("Вернуться в кабинет", `${env.WEB_ORIGIN}/dashboard`)]
  ]);

  if (!token) {
    await ctx.reply(
      "Откройте подтверждение из личного кабинета и нажмите кнопку “Перейти в бота”.",
      backToDashboardButton
    );
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
      console.warn("[verify-bot] verification failed", { status: response.status, telegramId });
      await ctx.reply(
        "Ссылка устарела или недействительна. Вернитесь в кабинет и получите новую ссылку.",
        backToDashboardButton
      );
      return;
    }

    await ctx.reply(
      "Готово! Telegram подтверждён.\n\nТеперь вернитесь в кабинет и продолжите настройку.",
      backToDashboardButton
    );
  } catch {
    console.error("[verify-bot] complete request failed", { telegramId });
    await ctx.reply("Не удалось подтвердить Telegram. Попробуйте снова через минуту.", backToDashboardButton);
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
