const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type AuthUser = {
  id: string;
  email: string | null;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  telegramVerifiedAt: string | null;
};

export type AuthMeResponse = {
  user: AuthUser;
  workspace: {
    id: string;
    name: string;
  };
  role?: "owner";
};

export type AccountSafetyState = {
  id: string;
  telegramAccountId: string;
  dailyCommentCount: number;
  dailyLimit: number;
  minDelayMinutes: number;
  activeFromHour: number;
  activeToHour: number;
  timezone: string;
  lastDailyResetAt: string | null;
  lastCommentAt: string | null;
  cooldownUntil: string | null;
  floodWaitUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAccount = {
  id: string;
  workspaceId: string;
  displayName: string | null;
  phone: string | null;
  status: "PENDING" | "CONNECTING" | "CONNECTED" | "ACTIVE" | "PAUSED" | "DISCONNECTED" | "FAILED";
  proxyHost: string | null;
  proxyPort: number | null;
  proxyUsername: string | null;
  telegramUserId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  connectedAt: string | null;
  connectionError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramLoginSession = {
  status: "PENDING" | "QR_READY" | "WAITING_SCAN" | "CONNECTED" | "EXPIRED" | "FAILED";
  qrUrl: string | null;
  expiresAt: string;
  error: string | null;
  account: TelegramAccount;
};

export type MonitoredChannel = {
  id: string;
  workspaceId: string;
  telegramAccountId: string | null;
  username: string;
  title: string | null;
  status: "PENDING" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  niche: string | null;
  lastSeenPostId: string | null;
  monitoringStartedAt: string | null;
  freshnessWindowMinutes: number;
  lastSyncAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelHealth = {
  channelId: string;
  username: string;
  health: "OK" | "NO_ACCESS" | "COMMENTS_DISABLED" | "COMMENT_RESTRICTED" | "FLOOD_WAIT" | "BANNED_IN_DISCUSSION" | "UNKNOWN_ERROR";
  message: string;
  advice: string;
};

export type KnowledgeBaseItem = {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type OwnedChannelStatus = "PENDING" | "ACTIVE" | "FAILED";

export type OwnedChannel = {
  id: string;
  workspaceId: string;
  telegramAccountId: string | null;
  username: string;
  title: string | null;
  status: OwnedChannelStatus;
  subscriberCount: number | null;
  averageViews: number | null;
  lastPostId: string | null;
  lastStatsSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
  telegramAccount: {
    id: string;
    displayName: string | null;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    status: TelegramAccount["status"];
  } | null;
};

export type OwnedChannelAiProfile = {
  id: string;
  workspaceId: string;
  ownedChannelId: string;
  status: "PENDING" | "READY" | "FAILED";
  sourcePostCount: number | null;
  lastAnalyzedPostId: string | null;
  styleSummary: string | null;
  topicSummary: string | null;
  positioningSummary: string | null;
  recurringIdeas: string | null;
  vocabularyNotes: string | null;
  offerNotes: string | null;
  avoidNotes: string | null;
  combinedPromptContext: string | null;
  generatedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type OwnedChannelContextSummary = {
  channel: OwnedChannel;
  aiProfile: OwnedChannelAiProfile | null;
  latestSnapshot: {
    id: string;
    subscriberCount: number | null;
    averageViews: number | null;
    postsSampled: number | null;
    capturedAt: string;
  } | null;
  firstSnapshot: {
    id: string;
    subscriberCount: number | null;
    averageViews: number | null;
    postsSampled: number | null;
    capturedAt: string;
  } | null;
  delta: {
    subscriberCount: number | null;
    averageViews: number | null;
  };
  postSampleCount: number;
};

export type DispatchJob = {
  id: string;
  workspaceId: string;
  generatedCommentId: string;
  telegramAccountId: string;
  scheduledAt: string;
  queuedAt: string | null;
  sentAt: string | null;
  status: "SCHEDULED" | "READY" | "SENT" | "FAILED" | "CANCELLED";
  error: string | null;
  createdAt: string;
  updatedAt: string;
  generatedComment?: {
    id: string;
    text: string;
    opportunityId: string;
  };
  telegramAccount?: {
    id: string;
    displayName: string | null;
    username: string | null;
    phone: string | null;
  };
};

export type GeneratedComment = {
  id: string;
  workspaceId: string;
  opportunityId: string;
  text: string;
  status: "DRAFT" | "APPROVED" | "REJECTED" | "QUEUED" | "SENT" | "FAILED";
  variant: string | null;
  generationReason: string | null;
  qualityScore: number | null;
  safetyStatus: string | null;
  safetyReason: string | null;
  createdAt: string;
  updatedAt: string;
  dispatchJobs?: DispatchJob[];
};

export type GeneratedCommentFeedItem = {
  id: string;
  workspaceId: string;
  opportunityId: string;
  text: string;
  status: "DRAFT" | "APPROVED" | "REJECTED" | "QUEUED" | "SENT" | "FAILED";
  variant: string | null;
  generationReason: string | null;
  qualityScore: number | null;
  safetyStatus: string | null;
  safetyReason: string | null;
  createdAt: string;
  updatedAt: string;
  opportunity: {
    postText: string;
    postDate: string;
    monitoredChannel: {
      username: string;
      title: string | null;
    };
  };
  dispatchJob: DispatchJob | null;
};

export type BillingStatus = {
  plan: string;
  subscriptionStatus: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  commentLimit: number;
  commentsSentCount: number;
  commentsRemaining: number;
  canDispatch: boolean;
  blockReason: string | null;
};

export type OnboardingStatus = {
  hasConnectedAccount: boolean;
  hasMonitoredChannel: boolean;
  hasKnowledgeBase: boolean;
  hasActiveMonitoring: boolean;
  hasGeneratedComments: boolean;
};

export type CommentOpportunity = {
  id: string;
  workspaceId: string;
  monitoredChannelId: string;
  telegramAccountId: string | null;
  externalPostId: string;
  postText: string;
  postDate: string;
  status: "NEW" | "REVIEWED" | "SKIPPED" | "APPROVED";
  analysisStatus: "PENDING" | "ANALYZED" | "SKIPPED" | "FAILED";
  analysisReason: string | null;
  commentType: string | null;
  keyTopic: string | null;
  spamRiskReason: string | null;
  relevanceScore: number | null;
  shouldComment: boolean | null;
  riskLevel: string | null;
  expertAngle: string | null;
  createdAt: string;
  updatedAt: string;
  monitoredChannel: {
    id: string;
    username: string;
    title: string | null;
    telegramAccountId?: string | null;
  };
  generatedComments: GeneratedComment[];
};

export type CreateTelegramAccountInput = {
  displayName?: string;
  phone?: string;
  proxyHost?: string;
  proxyPort?: number;
  proxyUsername?: string;
  proxyPassword?: string;
};

export type StartTelegramConnectInput = {
  displayName?: string;
  proxyHost?: string;
  proxyPort?: number;
  proxyUsername?: string;
  proxyPassword?: string;
};

export type UpdateTelegramAccountInput = {
  displayName?: string;
  proxyHost?: string;
  proxyPort?: number | null;
  proxyUsername?: string;
  proxyPassword?: string;
};

export type CreateMonitoredChannelInput = {
  username: string;
  title?: string;
  niche?: string;
  telegramAccountId?: string;
};

export type UpdateMonitoredChannelInput = {
  title?: string;
  niche?: string;
  telegramAccountId?: string | null;
  status?: "PENDING" | "ACTIVE" | "PAUSED" | "ARCHIVED";
};

export type CreateKnowledgeBaseInput = {
  title: string;
  content: string;
};

export type CreateOwnedChannelInput = {
  username: string;
  telegramAccountId?: string;
};

export type UpdateKnowledgeBaseInput = {
  title?: string;
  content?: string;
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    credentials: "include",
    cache: "no-store"
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    let message = `API request failed: ${response.status}`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json?.error) {
        message = json.error;
      }
    } catch {
      const body = await response.text();
      if (body) {
        message = body;
      }
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export const listTelegramAccounts = () => apiFetch<TelegramAccount[]>("/telegram-accounts");
export const createTelegramAccount = (input: CreateTelegramAccountInput) => apiFetch<TelegramAccount>("/telegram-accounts", { method: "POST", body: JSON.stringify(input) });
export const getTelegramAccountSafety = (id: string) => apiFetch<AccountSafetyState>(`/telegram-accounts/${id}/safety`);
export const updateTelegramAccountSafety = (id: string, input: Partial<Pick<AccountSafetyState, "dailyLimit" | "minDelayMinutes" | "activeFromHour" | "activeToHour" | "timezone">>) =>
  apiFetch<AccountSafetyState>(`/telegram-accounts/${id}/safety`, { method: "PATCH", body: JSON.stringify(input) });
export const startTelegramConnect = (input: StartTelegramConnectInput) => apiFetch<{ accountId: string; loginSessionId: string; status: string }>("/telegram-accounts/connect/start", { method: "POST", body: JSON.stringify(input) });
export const getTelegramConnectSession = (loginSessionId: string) => apiFetch<TelegramLoginSession>(`/telegram-accounts/connect/${loginSessionId}`);
export const cancelTelegramConnectSession = (loginSessionId: string) => apiFetch<{ ok: true }>(`/telegram-accounts/connect/${loginSessionId}/cancel`, { method: "POST" });
export const cleanupFailedTelegramAccounts = () => apiFetch<{ ok: true; deleted: number }>("/telegram-accounts/cleanup-failed", { method: "POST" });
export const updateTelegramAccount = (id: string, input: UpdateTelegramAccountInput) => apiFetch<TelegramAccount>(`/telegram-accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteTelegramAccount = (id: string) => apiFetch<{ ok: true }>(`/telegram-accounts/${id}`, { method: "DELETE" });

export const listMonitoredChannels = () => apiFetch<MonitoredChannel[]>("/monitored-channels");
export const createMonitoredChannel = (input: CreateMonitoredChannelInput) => apiFetch<MonitoredChannel>("/monitored-channels", { method: "POST", body: JSON.stringify(input) });
export const updateMonitoredChannel = (id: string, input: UpdateMonitoredChannelInput) => apiFetch<MonitoredChannel>(`/monitored-channels/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const startMonitoringChannel = (id: string) => apiFetch<MonitoredChannel>(`/monitored-channels/${id}/start-monitoring`, { method: "POST" });
export const stopMonitoringChannel = (id: string) => apiFetch<MonitoredChannel>(`/monitored-channels/${id}/stop-monitoring`, { method: "POST" });
export const updateMonitoringSettings = (id: string, freshnessWindowMinutes: number) => apiFetch<MonitoredChannel>(`/monitored-channels/${id}/settings`, { method: "PATCH", body: JSON.stringify({ freshnessWindowMinutes }) });
export const deleteMonitoredChannel = (id: string) => apiFetch<{ ok: true }>(`/monitored-channels/${id}`, { method: "DELETE" });
export const checkMonitoredChannelHealth = (id: string) => apiFetch<ChannelHealth>(`/monitored-channels/${id}/check-health`, { method: "POST" });

export const listCommentOpportunities = (filters?: { status?: string; channelId?: string; analysisStatus?: string; onlyRecommended?: boolean }) => {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.channelId) params.set("channelId", filters.channelId);
  if (filters?.analysisStatus) params.set("analysisStatus", filters.analysisStatus);
  if (filters?.onlyRecommended) params.set("onlyRecommended", "true");
  const query = params.toString();
  return apiFetch<CommentOpportunity[]>(`/comments/opportunities${query ? `?${query}` : ""}`);
};

export const analyzeCommentOpportunity = (id: string) => apiFetch<CommentOpportunity>(`/comments/opportunities/${id}/analyze`, { method: "POST" });
export const generateComment = (id: string) => apiFetch<{ ok: true }>(`/comments/opportunities/${id}/generate`, { method: "POST" });
export const listGeneratedComments = (filters?: { status?: string; opportunityId?: string }) => {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.opportunityId) params.set("opportunityId", filters.opportunityId);
  const query = params.toString();
  return apiFetch<GeneratedCommentFeedItem[]>(`/comments/generated${query ? `?${query}` : ""}`);
};
export const updateGeneratedComment = (id: string, input: { text?: string; status?: "APPROVED" | "REJECTED" }) =>
  apiFetch<{ generatedComment: GeneratedComment; dispatchJob: DispatchJob | null }>(`/comments/generated/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const listDispatchJobs = (filters?: { status?: string; telegramAccountId?: string }) => {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.telegramAccountId) params.set("telegramAccountId", filters.telegramAccountId);
  const query = params.toString();
  return apiFetch<DispatchJob[]>(`/comments/dispatch-jobs${query ? `?${query}` : ""}`);
};
export const updateDispatchJob = (id: string, input: { scheduledAt?: string; status?: "CANCELLED" }) =>
  apiFetch<DispatchJob>(`/comments/dispatch-jobs/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const listKnowledgeBase = () => apiFetch<KnowledgeBaseItem[]>("/knowledge-base");
export const createKnowledgeBase = (input: CreateKnowledgeBaseInput) => apiFetch<KnowledgeBaseItem>("/knowledge-base", { method: "POST", body: JSON.stringify(input) });
export const updateKnowledgeBase = (id: string, input: UpdateKnowledgeBaseInput) => apiFetch<KnowledgeBaseItem>(`/knowledge-base/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteKnowledgeBase = (id: string) => apiFetch<{ ok: true }>(`/knowledge-base/${id}`, { method: "DELETE" });

export const listOwnedChannels = () => apiFetch<OwnedChannel[]>("/owned-channels");
export const createOwnedChannel = (input: CreateOwnedChannelInput) =>
  apiFetch<OwnedChannel>("/owned-channels", { method: "POST", body: JSON.stringify(input) });
export const deleteOwnedChannel = (id: string) => apiFetch<{ ok: true }>(`/owned-channels/${id}`, { method: "DELETE" });
export const syncOwnedChannelStats = (id: string) =>
  apiFetch<{ status: "queued" }>(`/owned-channels/${id}/sync-stats`, { method: "POST" });
export const getOwnedChannelAiProfile = (id: string) =>
  apiFetch<OwnedChannelAiProfile | null>(`/owned-channels/${id}/ai-profile`);
export const generateOwnedChannelAiProfile = (id: string) =>
  apiFetch<{ status: "queued" }>(`/owned-channels/${id}/generate-ai-profile`, { method: "POST" });
export const getOwnedChannelContextSummary = (id: string) =>
  apiFetch<OwnedChannelContextSummary>(`/owned-channels/${id}/context-summary`);

export const getBillingStatus = () => apiFetch<BillingStatus>("/billing/status");
export const devActivateBilling = () => apiFetch<{ ok: true; workspace: { id: string; plan: string; subscriptionStatus: string } }>("/billing/dev-activate", { method: "POST" });
export const getOnboardingStatus = () => apiFetch<OnboardingStatus>("/workspaces/onboarding-status");

export const registerWithEmail = (input: { email: string; password: string }) =>
  apiFetch<AuthMeResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) });

export const loginWithEmail = (input: { email: string; password: string }) =>
  apiFetch<AuthMeResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) });

export const logoutSession = () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" });
export const getMe = () => apiFetch<AuthMeResponse>("/auth/me");

export const startTelegramVerification = () =>
  apiFetch<{ botUrl: string; expiresAt: string }>("/auth/telegram-verification/start", { method: "POST" });
