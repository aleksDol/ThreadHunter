import {
  GeneratedCommentStatus,
  OpportunityAnalysisStatus,
  OpportunityStatus,
  PrismaClient
} from "@prisma/client";
import { config } from "dotenv";
import Redis from "ioredis";
import OpenAI from "openai";
import { z } from "zod";

config();

const ANALYSIS_QUEUE_NAME = "ai-analysis:queue";
const GENERATION_QUEUE_NAME = "comment-generation:queue";
const OWNED_CHANNEL_AI_PROFILE_QUEUE_NAME = "owned-channel-ai-profile:queue";

const envSchema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  OPENAI_BASE_URL: z.string().default("https://api.proxyapi.ru/openai/v1"),
  AI_RELEVANCE_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_API_KEY: z.string().optional()
});
const env = envSchema.parse(process.env);

const prisma = new PrismaClient();
const prismaAny = prisma as any;
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const openai = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL
    })
  : null;

const analysisPayloadSchema = z.object({
  type: z.literal("analyze_comment_opportunity"),
  workspaceId: z.string().cuid(),
  opportunityId: z.union([z.string().cuid(), z.string().uuid()]),
  createdAt: z.string()
});

const generationPayloadSchema = z.object({
  type: z.literal("generate_comment"),
  workspaceId: z.string().cuid(),
  opportunityId: z.union([z.string().cuid(), z.string().uuid()]),
  createdAt: z.string()
});

const aiProfilePayloadSchema = z.object({
  type: z.literal("generate_owned_channel_ai_profile"),
  workspaceId: z.string().cuid(),
  ownedChannelId: z.string().cuid(),
  createdAt: z.string()
});

const aiResultSchema = z.object({
  shouldComment: z.boolean(),
  commentIntent: z.enum(["expert_comment", "neutral_opinion", "clarifying_question", "skip"]),
  relevanceScore: z.number().min(0).max(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  expertAngle: z.string().optional().default(""),
  analysisReason: z.string().optional().default(""),
  commentType: z.string().optional().default(""),
  keyTopic: z.string().optional().default(""),
  spamRiskReason: z.string().optional().default("")
});

const generatedCommentSchema = z.object({
  text: z.string().min(80).max(1200),
  variant: z.string(),
  generationReason: z.string(),
  qualityScore: z.number().min(0).max(1)
});

const ownedChannelProfileSchema = z.object({
  styleSummary: z.string().min(1).max(1500),
  topicSummary: z.string().min(1).max(1500),
  positioningSummary: z.string().min(1).max(1500),
  recurringIdeas: z.string().min(1).max(2500),
  vocabularyNotes: z.string().min(1).max(2000),
  offerNotes: z.string().min(1).max(2000),
  avoidNotes: z.string().min(1).max(1500)
});

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function trimContext(text: string, max = 8000): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

async function getOwnedChannelsPromptContext(workspaceId: string): Promise<string> {
  const profiles = await prismaAny.ownedChannelAiProfile.findMany({
    where: { workspaceId, status: "READY" },
    select: { combinedPromptContext: true },
    orderBy: { updatedAt: "desc" },
    take: 5
  });

  const raw = profiles
    .map((profile: { combinedPromptContext?: string | null }) => (profile.combinedPromptContext || "").trim())
    .filter(Boolean)
    .join("\n\n");

  if (!raw) {
    return "No owned channel AI profile available.";
  }

  return trimContext(raw, 4000);
}

function buildCombinedPromptContext(profile: z.infer<typeof ownedChannelProfileSchema>): string {
  return trimContext(
    [
      "Профиль авторского канала:",
      `Стиль: ${profile.styleSummary}`,
      `Темы: ${profile.topicSummary}`,
      `Позиционирование: ${profile.positioningSummary}`,
      `Повторяющиеся идеи: ${profile.recurringIdeas}`,
      `Лексика: ${profile.vocabularyNotes}`,
      `Офферы: ${profile.offerNotes}`,
      `Чего избегать: ${profile.avoidNotes}`
    ].join("\n"),
    4000
  );
}

function passesSafety(text: string): { passed: boolean; reason: string } {
  const lower = text.toLowerCase();
  if (text.length < 300) return { passed: false, reason: "Text is too short (<300 chars)" };
  if (text.length > 700) return { passed: false, reason: "Text is too long (>700 chars)" };
  if (/https?:\/\//i.test(text) || /t\.me\//i.test(text)) return { passed: false, reason: "Contains link" };
  if (/(пишите в личк|напишите мне|свяжитесь со мной|мой курс|мой продукт|пишите в лс|пишите в директ)/i.test(lower)) {
    return { passed: false, reason: "Contains direct sales/contact CTA" };
  }
  if (/\+\d{7,}/.test(text) || /@\w{4,}/.test(text)) return { passed: false, reason: "Contains contact handle/phone" };
  return { passed: true, reason: "Passed" };
}

async function markAnalysisFailed(opportunityId: string, reason: string): Promise<void> {
  await prisma.commentOpportunity.update({
    where: { id: opportunityId },
    data: {
      analysisStatus: OpportunityAnalysisStatus.FAILED,
      analysisReason: reason.slice(0, 2000)
    }
  });
}

async function enqueueGeneration(workspaceId: string, opportunityId: string): Promise<void> {
  await redis.rpush(
    GENERATION_QUEUE_NAME,
    JSON.stringify({
      type: "generate_comment",
      workspaceId,
      opportunityId,
      createdAt: new Date().toISOString()
    })
  );
}

async function analyzeOpportunity(payload: z.infer<typeof analysisPayloadSchema>): Promise<void> {
  const opportunity = (await prisma.commentOpportunity.findFirst({
    where: { id: payload.opportunityId, workspaceId: payload.workspaceId },
    include: {
      monitoredChannel: true,
      workspace: true
    }
  })) as any;

  if (!opportunity) return;
  if (opportunity.analysisStatus !== OpportunityAnalysisStatus.PENDING) return;

  if (!openai) {
    await markAnalysisFailed(opportunity.id, "OPENAI_API_KEY is not configured");
    return;
  }

  const kbItems = await prisma.knowledgeBase.findMany({
    where: { workspaceId: opportunity.workspaceId },
    orderBy: { updatedAt: "desc" },
    take: 20
  });

  const kbContext = trimContext(
    kbItems.map((item, i) => `#${i + 1} ${item.title}\n${item.content}`).join("\n\n") ||
      "No knowledge base entries available.",
    8000
  );
  const ownedChannelContext = await getOwnedChannelsPromptContext(opportunity.workspaceId);

  const prompt = [
    "You are an assistant that evaluates whether a Telegram post should receive a comment.",
    "Return STRICT JSON only with keys:",
    "shouldComment, commentIntent, relevanceScore, riskLevel, expertAngle, analysisReason, commentType, keyTopic, spamRiskReason.",
    "Allowed commentIntent values: expert_comment, neutral_opinion, clarifying_question, skip.",
    "Rules:",
    "- shouldComment=false if post is not relevant to workspace niche/knowledge base.",
    "- shouldComment=false if response would require direct self-promotion.",
    "- riskLevel high when likely to look like spam.",
    "- relevanceScore must be between 0 and 1.",
    `neutralCommentsEnabled: ${opportunity.workspace.neutralCommentsEnabled ? "true" : "false"}`,
    "- expert_comment: strong practical expert angle.",
    "- neutral_opinion: relevant short meaningful opinion without sales.",
    "- clarifying_question: one natural question that continues discussion.",
    "- skip: if forced, risky, irrelevant, or low-value.",
    "- If neutralCommentsEnabled=false, neutral_opinion and clarifying_question must become skip.",
    "Workspace: " + opportunity.workspace.name,
    "Channel: @" + opportunity.monitoredChannel.username,
    "Post:\n" + opportunity.postText,
    "Knowledge base:\n" + kbContext,
    "Owned channel style context:\n" + ownedChannelContext
  ].join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: env.AI_RELEVANCE_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You must output valid JSON only." },
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      await markAnalysisFailed(opportunity.id, "Empty AI response");
      return;
    }

    const parsed = aiResultSchema.safeParse(safeJsonParse(content));
    if (!parsed.success) {
      await markAnalysisFailed(opportunity.id, "AI response schema validation failed");
      return;
    }

    const result = parsed.data;
    const neutralEnabled = Boolean(opportunity.workspace?.neutralCommentsEnabled);
    let finalIntent = result.commentIntent;
    if (!neutralEnabled && (finalIntent === "neutral_opinion" || finalIntent === "clarifying_question")) {
      finalIntent = "skip";
    }

    const shouldComment = result.shouldComment && finalIntent !== "skip";
    const analysisStatus = shouldComment
      ? OpportunityAnalysisStatus.ANALYZED
      : OpportunityAnalysisStatus.SKIPPED;
    const status = shouldComment ? OpportunityStatus.NEW : OpportunityStatus.SKIPPED;

    await prismaAny.commentOpportunity.update({
      where: { id: opportunity.id },
      data: {
        analysisStatus,
        status,
        shouldComment,
        commentIntent: finalIntent,
        relevanceScore: result.relevanceScore,
        riskLevel: result.riskLevel,
        expertAngle: result.expertAngle,
        analysisReason: result.analysisReason,
        commentType: result.commentType,
        keyTopic: result.keyTopic,
        spamRiskReason: result.spamRiskReason
      }
    });

    const canAutoExpert = finalIntent === "expert_comment" && result.riskLevel !== "high" && result.relevanceScore >= 0.7;
    const canAutoNeutral =
      finalIntent === "neutral_opinion" &&
      neutralEnabled &&
      result.riskLevel === "low" &&
      result.relevanceScore >= 0.55;
    const canAutoQuestion =
      finalIntent === "clarifying_question" &&
      neutralEnabled &&
      result.riskLevel === "low" &&
      result.relevanceScore >= 0.5;

    if (canAutoExpert || canAutoNeutral || canAutoQuestion) {
      await enqueueGeneration(opportunity.workspaceId, opportunity.id);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown AI analysis error";
    await markAnalysisFailed(opportunity.id, reason);
  }
}

async function generateComment(payload: z.infer<typeof generationPayloadSchema>): Promise<void> {
  const opportunity = (await prisma.commentOpportunity.findFirst({
    where: { id: payload.opportunityId, workspaceId: payload.workspaceId },
    include: {
      monitoredChannel: true,
      workspace: true
    }
  })) as any;

  if (!opportunity) return;

  const eligible =
    opportunity.analysisStatus === OpportunityAnalysisStatus.ANALYZED &&
    opportunity.shouldComment === true &&
    (opportunity.riskLevel || "").toLowerCase() !== "high";

  if (!eligible) return;

  if (!openai) {
    await prismaAny.generatedComment.create({
      data: {
        workspaceId: opportunity.workspaceId,
        opportunityId: opportunity.id,
        text: "AI generation unavailable: OPENAI_API_KEY is not configured.",
        status: GeneratedCommentStatus.FAILED,
        variant: "unavailable",
        commentIntent: opportunity.commentIntent,
        generationReason: "OPENAI_API_KEY is not configured",
        qualityScore: 0,
        safetyStatus: "FAILED",
        safetyReason: "OPENAI_API_KEY is not configured"
      }
    });
    return;
  }

  const kbItems = await prisma.knowledgeBase.findMany({
    where: { workspaceId: opportunity.workspaceId },
    orderBy: { updatedAt: "desc" },
    take: 20
  });

  const kbContext = trimContext(
    kbItems.map((item, i) => `#${i + 1} ${item.title}\n${item.content}`).join("\n\n") ||
      "No knowledge base entries available.",
    8000
  );
  const ownedChannelContext = await getOwnedChannelsPromptContext(opportunity.workspaceId);

  const prompt = [
    "Сгенерируй комментарий на русском языке к посту Telegram.",
    "Требования:",
    "- 300-700 символов",
    "- без прямой продажи",
    "- без ссылок",
    "- без призывов написать в личку",
    "- без упоминания ИИ",
    "- без банального 'полностью согласен'",
    "- конкретика по теме поста",
    "Верни СТРОГО JSON с ключами: text, variant, generationReason, qualityScore.",
    `Intent: ${opportunity.commentIntent ?? "expert_comment"}`,
    "Intent rules:",
    "- expert_comment: практический экспертный комментарий с конкретикой.",
    "- neutral_opinion: короткое осмысленное мнение по теме без воды и продаж.",
    "- clarifying_question: один естественный уточняющий вопрос по теме, без bait.",
    `Тема поста: ${opportunity.keyTopic ?? "не указана"}`,
    `Экспертный угол: ${opportunity.expertAngle ?? "не указан"}`,
    `Пост:\n${opportunity.postText}`,
    `KnowledgeBase:\n${kbContext}`,
    `Профиль авторского канала:\n${ownedChannelContext}`
  ].join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: env.AI_RELEVANCE_MODEL,
      temperature: 0.5,
      messages: [
        { role: "system", content: "You must output valid JSON only." },
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      await prismaAny.generatedComment.create({
        data: {
          workspaceId: opportunity.workspaceId,
          opportunityId: opportunity.id,
          text: "",
          status: GeneratedCommentStatus.FAILED,
          variant: null,
          commentIntent: opportunity.commentIntent,
          generationReason: "Empty generation response",
          qualityScore: 0,
          safetyStatus: "FAILED",
          safetyReason: "Empty generation response"
        }
      });
      return;
    }

    const parsed = generatedCommentSchema.safeParse(safeJsonParse(content));
    if (!parsed.success) {
      await prismaAny.generatedComment.create({
        data: {
          workspaceId: opportunity.workspaceId,
          opportunityId: opportunity.id,
          text: "",
          status: GeneratedCommentStatus.FAILED,
          commentIntent: opportunity.commentIntent,
          generationReason: "Generation JSON schema failed",
          qualityScore: 0,
          safetyStatus: "FAILED",
          safetyReason: "Generation JSON schema failed"
        }
      });
      return;
    }

    const generated = parsed.data;
    const safety = passesSafety(generated.text);

    await prismaAny.generatedComment.create({
      data: {
        workspaceId: opportunity.workspaceId,
        opportunityId: opportunity.id,
        text: generated.text,
        status: safety.passed ? GeneratedCommentStatus.DRAFT : GeneratedCommentStatus.REJECTED,
        variant: generated.variant,
        commentIntent: opportunity.commentIntent,
        generationReason: generated.generationReason,
        qualityScore: generated.qualityScore,
        safetyStatus: safety.passed ? "PASSED" : "FAILED",
        safetyReason: safety.reason
      }
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Generation error";
    await prismaAny.generatedComment.create({
      data: {
        workspaceId: opportunity.workspaceId,
        opportunityId: opportunity.id,
        text: "",
        status: GeneratedCommentStatus.FAILED,
        commentIntent: opportunity.commentIntent,
        generationReason: reason,
        qualityScore: 0,
        safetyStatus: "FAILED",
        safetyReason: reason
      }
    });
  }
}

async function generateOwnedChannelAiProfile(payload: z.infer<typeof aiProfilePayloadSchema>): Promise<void> {
  const ownedChannel = await prisma.ownedChannel.findFirst({
    where: { id: payload.ownedChannelId, workspaceId: payload.workspaceId },
    select: { id: true, workspaceId: true, username: true }
  });

  if (!ownedChannel) return;

  await prismaAny.ownedChannelAiProfile.upsert({
    where: { ownedChannelId: ownedChannel.id },
    update: { status: "PENDING" },
    create: { workspaceId: payload.workspaceId, ownedChannelId: ownedChannel.id, status: "PENDING" }
  });

  const samples = await prismaAny.ownedChannelPostSample.findMany({
    where: { workspaceId: payload.workspaceId, ownedChannelId: ownedChannel.id },
    orderBy: [{ postDate: "desc" }, { createdAt: "desc" }],
    take: 50
  });

  if (samples.length < 3) {
    await prismaAny.ownedChannelAiProfile.update({
      where: { ownedChannelId: ownedChannel.id },
      data: {
        status: "FAILED",
        sourcePostCount: samples.length,
        avoidNotes: "Недостаточно текстовых постов для анализа",
        generatedAt: new Date()
      }
    });
    return;
  }

  if (!openai) {
    await prismaAny.ownedChannelAiProfile.update({
      where: { ownedChannelId: ownedChannel.id },
      data: {
        status: "FAILED",
        sourcePostCount: samples.length,
        avoidNotes: "OPENAI_API_KEY is not configured",
        generatedAt: new Date()
      }
    });
    return;
  }

  const postsContext = trimContext(
    samples
      .map((sample: { views?: number | null; postDate?: Date | null; text: string }, index: number) => {
        const views = sample.views ?? "-";
        const date = sample.postDate ? new Date(sample.postDate).toISOString() : "-";
        return `#${index + 1} [${date}] views=${views}\n${sample.text}`;
      })
      .join("\n\n"),
    12000
  );

  const prompt = [
    "Проанализируй посты авторского Telegram-канала и верни только валидный JSON без markdown.",
    "JSON contract:",
    "{",
    '  "styleSummary": "...",',
    '  "topicSummary": "...",',
    '  "positioningSummary": "...",',
    '  "recurringIdeas": "...",',
    '  "vocabularyNotes": "...",',
    '  "offerNotes": "...",',
    '  "avoidNotes": "..."',
    "}",
    "Требования:",
    "- Пиши на русском.",
    "- Кратко и по делу.",
    "- Не добавляй выдуманные факты.",
    `Канал: @${ownedChannel.username}`,
    `Постов для анализа: ${samples.length}`,
    `Посты:\n${postsContext}`
  ].join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: env.AI_RELEVANCE_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty AI profile response");
    }

    const parsed = ownedChannelProfileSchema.safeParse(safeJsonParse(content));
    if (!parsed.success) {
      throw new Error("AI profile JSON schema validation failed");
    }

    const profile = parsed.data;
    const combinedPromptContext = buildCombinedPromptContext(profile);

    await prismaAny.ownedChannelAiProfile.update({
      where: { ownedChannelId: ownedChannel.id },
      data: {
        status: "READY",
        sourcePostCount: samples.length,
        lastAnalyzedPostId: samples[0]?.externalPostId ?? null,
        styleSummary: profile.styleSummary,
        topicSummary: profile.topicSummary,
        positioningSummary: profile.positioningSummary,
        recurringIdeas: profile.recurringIdeas,
        vocabularyNotes: profile.vocabularyNotes,
        offerNotes: profile.offerNotes,
        avoidNotes: profile.avoidNotes,
        combinedPromptContext,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "AI profile generation error";
    await prismaAny.ownedChannelAiProfile.update({
      where: { ownedChannelId: ownedChannel.id },
      data: {
        status: "FAILED",
        sourcePostCount: samples.length,
        avoidNotes: reason.slice(0, 2000),
        generatedAt: new Date()
      }
    });
  }
}

async function main(): Promise<void> {
  console.info(
    "[ai-worker] started, queues:",
    ANALYSIS_QUEUE_NAME,
    GENERATION_QUEUE_NAME,
    OWNED_CHANNEL_AI_PROFILE_QUEUE_NAME
  );

  while (true) {
    try {
      const analysisItem = await redis.blpop(ANALYSIS_QUEUE_NAME, 2);
      if (analysisItem) {
        const [, raw] = analysisItem;
        const parsed = analysisPayloadSchema.safeParse(safeJsonParse(raw));
        if (parsed.success) {
          await analyzeOpportunity(parsed.data);
        } else {
          console.warn("[ai-worker] invalid analysis payload");
        }
      }

      const generationItem = await redis.blpop(GENERATION_QUEUE_NAME, 2);
      if (generationItem) {
        const [, raw] = generationItem;
        const parsed = generationPayloadSchema.safeParse(safeJsonParse(raw));
        if (parsed.success) {
          await generateComment(parsed.data);
        } else {
          console.warn("[ai-worker] invalid generation payload");
        }
      }

      const aiProfileItem = await redis.blpop(OWNED_CHANNEL_AI_PROFILE_QUEUE_NAME, 2);
      if (aiProfileItem) {
        const [, raw] = aiProfileItem;
        const parsed = aiProfilePayloadSchema.safeParse(safeJsonParse(raw));
        if (parsed.success) {
          await generateOwnedChannelAiProfile(parsed.data);
        } else {
          console.warn("[ai-worker] invalid owned channel ai profile payload");
        }
      }
    } catch (error) {
      console.error("[ai-worker] loop error", error);
    }
  }
}

main().catch((error) => {
  console.error("[ai-worker] fatal error", error);
  process.exit(1);
});
