import { Prisma } from "@prisma/client";

export const safeTelegramAccountSelect = {
  id: true,
  workspaceId: true,
  displayName: true,
  phone: true,
  status: true,
  proxyHost: true,
  proxyPort: true,
  proxyUsername: true,
  telegramUserId: true,
  username: true,
  firstName: true,
  lastName: true,
  connectedAt: true,
  connectionError: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.TelegramAccountSelect;

export type SafeTelegramAccount = Prisma.TelegramAccountGetPayload<{
  select: typeof safeTelegramAccountSelect;
}>;

export function toSafeTelegramAccount(account: SafeTelegramAccount): SafeTelegramAccount {
  return account;
}
