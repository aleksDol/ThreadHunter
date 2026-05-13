import type { ChannelHealth } from "./api-client";

export function mapChannelHealthCodeToRu(code: ChannelHealth["health"]): string {
  if (code === "ACCESS_PREPARING") return "Готовим доступ к каналу и комментариям";
  if (code === "NO_ACCESS") return "Аккаунт не подписан на канал или нет доступа";
  if (code === "COMMENTS_DISABLED") return "В этом канале отключены комментарии";
  if (code === "COMMENT_RESTRICTED") return "Аккаунт не может писать комментарии в обсуждении";
  if (code === "BANNED_IN_DISCUSSION") return "Аккаунт забанен или ограничен в обсуждении канала";
  if (code === "FLOOD_WAIT") return "Telegram временно ограничил действия. Система попробует позже";
  if (code === "UNKNOWN_ERROR") return "Не удалось выполнить действие. Попробуйте позже";
  return "OK";
}

export function mapRawErrorToRu(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("no access") || lower.includes("not participant") || lower.includes("private") || lower.includes("forbidden")) {
    return "Аккаунт не подписан на канал или нет доступа";
  }
  if (lower.includes("comments disabled") || lower.includes("comments unavailable") || lower.includes("discussion")) {
    return "В этом канале отключены комментарии";
  }
  if (lower.includes("restricted")) {
    return "Аккаунт не может писать комментарии в обсуждении";
  }
  if (lower.includes("banned")) {
    return "Аккаунт забанен или ограничен в обсуждении канала";
  }
  if (lower.includes("flood")) {
    return "Telegram временно ограничил действия. Система попробует позже";
  }
  if (lower.includes("post not found") || lower.includes("original post not found")) {
    return "Пост больше недоступен";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Не удалось выполнить действие. Проверьте соединение и попробуйте позже";
  }
  return "Не удалось выполнить действие. Попробуйте позже";
}
