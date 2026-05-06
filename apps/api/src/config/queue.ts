import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const commentDispatchQueue = new Queue("comment-dispatch", { connection });
export const redisConnection = connection;

export const TELEGRAM_LOGIN_QUEUE_NAME = "telegram-login:queue";
export const TELEGRAM_MONITOR_QUEUE_NAME = "telegram-monitor:queue";
export const AI_ANALYSIS_QUEUE_NAME = "ai-analysis:queue";
export const COMMENT_GENERATION_QUEUE_NAME = "comment-generation:queue";
export const TELEGRAM_DISPATCH_QUEUE_NAME = "telegram-dispatch:queue";

export type TelegramLoginQueuePayload = {
  type: "telegram_login_start";
  loginSessionId: string;
  telegramAccountId: string;
  workspaceId: string;
  createdAt: string;
};

export type TelegramMonitorQueuePayload = {
  type: "monitor_channel";
  channelId: string;
  workspaceId: string;
  telegramAccountId: string;
  createdAt: string;
};

export type AiAnalysisQueuePayload = {
  type: "analyze_comment_opportunity";
  workspaceId: string;
  opportunityId: string;
  createdAt: string;
};

export type CommentGenerationQueuePayload = {
  type: "generate_comment";
  workspaceId: string;
  opportunityId: string;
  createdAt: string;
};

export type TelegramDispatchQueuePayload = {
  type: "send_comment";
  dispatchJobId: string;
  workspaceId: string;
  telegramAccountId: string;
  createdAt: string;
};

export async function pushTelegramLoginJob(payload: TelegramLoginQueuePayload): Promise<void> {
  await redisConnection.rpush(TELEGRAM_LOGIN_QUEUE_NAME, JSON.stringify(payload));
}

export async function pushTelegramMonitorJob(payload: TelegramMonitorQueuePayload): Promise<void> {
  await redisConnection.rpush(TELEGRAM_MONITOR_QUEUE_NAME, JSON.stringify(payload));
}

export async function pushAiAnalysisJob(payload: AiAnalysisQueuePayload): Promise<void> {
  await redisConnection.rpush(AI_ANALYSIS_QUEUE_NAME, JSON.stringify(payload));
}

export async function pushCommentGenerationJob(payload: CommentGenerationQueuePayload): Promise<void> {
  await redisConnection.rpush(COMMENT_GENERATION_QUEUE_NAME, JSON.stringify(payload));
}

export async function pushTelegramDispatchJob(payload: TelegramDispatchQueuePayload): Promise<void> {
  await redisConnection.rpush(TELEGRAM_DISPATCH_QUEUE_NAME, JSON.stringify(payload));
}
