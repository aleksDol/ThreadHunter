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

const envSchema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  OPENAI_BASE_URL: z.string().default("https://api.proxyapi.ru/openai/v1"),
  AI_RELEVANCE_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_API_KEY: z.string().optional()
});
const env = envSchema.parse(process.env);

const prisma = new PrismaClient();
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
  opportunityId: z.string().cuid(),
  createdAt: z.string()
});

const generationPayloadSchema = z.object({
  type: z.literal("generate_comment"),
  workspaceId: z.string().cuid(),
  opportunityId: z.string().cuid(),
  createdAt: z.string()
});

const aiResultSchema = z.object({
  shouldComment: z.boolean(),
  relevanceScore: z.number().min(0).max(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  expertAngle: z.string(),
  analysisReason: z.string(),
  commentType: z.string(),
  keyTopic: z.string(),
  spamRiskReason: z.string()
});

const generatedCommentSchema = z.object({
  text: z.string().min(80).max(1200),
  variant: z.string(),
  generationReason: z.string(),
  qualityScore: z.number().min(0).max(1)
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
  const opportunity = await prisma.commentOpportunity.findFirst({
    where: { id: payload.opportunityId, workspaceId: payload.workspaceId },
    include: {
      monitoredChannel: true,
      workspace: true
    }
  });

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

  const prompt = [
    "You are an assistant that evaluates whether a Telegram post should receive an expert comment.",
    "Return STRICT JSON only with keys:",
    "shouldComment, relevanceScore, riskLevel, expertAngle, analysisReason, commentType, keyTopic, spamRiskReason.",
    "Rules:",
    "- shouldComment=false if post is not relevant to workspace niche/knowledge base.",
    "- shouldComment=false if response would require direct self-promotion.",
    "- riskLevel high when likely to look like spam.",
    "- relevanceScore must be between 0 and 1.",
    "Workspace: " + opportunity.workspace.name,
    "Channel: @" + opportunity.monitoredChannel.username,
    "Post:\n" + opportunity.postText,
    "Knowledge base:\n" + kbContext
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
    const analysisStatus = result.shouldComment
      ? OpportunityAnalysisStatus.ANALYZED
      : OpportunityAnalysisStatus.SKIPPED;
    const status = result.shouldComment ? OpportunityStatus.NEW : OpportunityStatus.SKIPPED;

    await prisma.commentOpportunity.update({
      where: { id: opportunity.id },
      data: {
        analysisStatus,
        status,
        shouldComment: result.shouldComment,
        relevanceScore: result.relevanceScore,
        riskLevel: result.riskLevel,
        expertAngle: result.expertAngle,
        analysisReason: result.analysisReason,
        commentType: result.commentType,
        keyTopic: result.keyTopic,
        spamRiskReason: result.spamRiskReason
      }
    });

    if (result.shouldComment && result.riskLevel !== "high" && result.relevanceScore >= 0.6) {
      await enqueueGeneration(opportunity.workspaceId, opportunity.id);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown AI analysis error";
    await markAnalysisFailed(opportunity.id, reason);
  }
}

async function generateComment(payload: z.infer<typeof generationPayloadSchema>): Promise<void> {
  const opportunity = await prisma.commentOpportunity.findFirst({
    where: { id: payload.opportunityId, workspaceId: payload.workspaceId },
    include: {
      monitoredChannel: true,
      workspace: true
    }
  });

  if (!opportunity) return;

  const eligible =
    opportunity.analysisStatus === OpportunityAnalysisStatus.ANALYZED &&
    opportunity.shouldComment === true &&
    (opportunity.riskLevel || "").toLowerCase() !== "high";

  if (!eligible) return;

  if (!openai) {
    await prisma.generatedComment.create({
      data: {
        workspaceId: opportunity.workspaceId,
        opportunityId: opportunity.id,
        text: "AI generation unavailable: OPENAI_API_KEY is not configured.",
        status: GeneratedCommentStatus.FAILED,
        variant: "unavailable",
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

  const prompt = [
    "Сгенерируй экспертный комментарий на русском языке к посту Telegram.",
    "Требования:",
    "- 300-700 символов",
    "- без прямой продажи",
    "- без ссылок",
    "- без призывов написать в личку",
    "- без упоминания ИИ",
    "- без банального 'полностью согласен'",
    "- конкретика по теме поста",
    "- можно добавить один мягкий вопрос в конце при уместности",
    "Верни СТРОГО JSON с ключами: text, variant, generationReason, qualityScore.",
    `Тема поста: ${opportunity.keyTopic ?? "не указана"}`,
    `Экспертный угол: ${opportunity.expertAngle ?? "не указан"}`,
    `Пост:\n${opportunity.postText}`,
    `KnowledgeBase:\n${kbContext}`
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
      await prisma.generatedComment.create({
        data: {
          workspaceId: opportunity.workspaceId,
          opportunityId: opportunity.id,
          text: "",
          status: GeneratedCommentStatus.FAILED,
          variant: null,
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
      await prisma.generatedComment.create({
        data: {
          workspaceId: opportunity.workspaceId,
          opportunityId: opportunity.id,
          text: "",
          status: GeneratedCommentStatus.FAILED,
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

    await prisma.generatedComment.create({
      data: {
        workspaceId: opportunity.workspaceId,
        opportunityId: opportunity.id,
        text: generated.text,
        status: safety.passed ? GeneratedCommentStatus.DRAFT : GeneratedCommentStatus.REJECTED,
        variant: generated.variant,
        generationReason: generated.generationReason,
        qualityScore: generated.qualityScore,
        safetyStatus: safety.passed ? "PASSED" : "FAILED",
        safetyReason: safety.reason
      }
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Generation error";
    await prisma.generatedComment.create({
      data: {
        workspaceId: opportunity.workspaceId,
        opportunityId: opportunity.id,
        text: "",
        status: GeneratedCommentStatus.FAILED,
        generationReason: reason,
        qualityScore: 0,
        safetyStatus: "FAILED",
        safetyReason: reason
      }
    });
  }
}

async function main(): Promise<void> {
  console.info("[ai-worker] started, queues:", ANALYSIS_QUEUE_NAME, GENERATION_QUEUE_NAME);

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
    } catch (error) {
      console.error("[ai-worker] loop error", error);
    }
  }
}

main().catch((error) => {
  console.error("[ai-worker] fatal error", error);
  process.exit(1);
});
