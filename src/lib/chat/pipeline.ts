import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import { EnergyTransactionType } from "@/generated/prisma/client";
import {
  estimateReserveAmount,
  estimateTokens,
  calculateChatCost,
  calculateCreatorShare,
  estimatedUsdCost,
} from "@/lib/energy/pricing";
import { spendEnergy, settleEnergy, refundEnergy } from "@/lib/energy/service";
import { accrueCreatorEarning } from "@/lib/creators/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveModel, streamChatCompletion, LlmError, type ChatMessageParam } from "@/lib/ai/gateway";
import { buildChatMessages, buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { retrieveMemories } from "@/lib/memory/retrieval";
import { maybeExtractMemories } from "@/lib/memory/extraction";
import { maybeUpdateSummary } from "@/lib/memory/summary";
import { bumpChatQuestProgress, judgeAiTopicQuests, getAffinitySummary } from "@/lib/quests/service";
import { pointsToLevel } from "@/lib/quests/intimacy";

/**
 * Chat pipeline — เส้นทางเดียวสำหรับ send message และ regenerate variant
 *
 * prepare → throw ApiError (route ตอบ JSON error)
 * stream  → SSE: delta* → done | error
 *
 * Pipeline: auth(โดย route) → ownership → rate limit → energy reserve →
 * prompt build → LLM stream → save message → usage log → settle/refund → post jobs
 */

const RECENT_MESSAGE_WINDOW = 24;
const DEFAULT_TITLE = "การสนทนาใหม่";

export interface PreparedChat {
  conversationId: string;
  userId: string;
  characterId: string;
  characterName: string;
  /** userId ของครีเอเตอร์เจ้าของตัวละคร (สำหรับ share-of-energy; null = ไม่มี) */
  creatorUserId: string | null;
  idempotencyKey: string;
  reservedAmount: number;
  /** user message ที่เพิ่ง insert (send mode เท่านั้น) */
  newUserMessageId: string | null;
  /** parent user message ของ assistant reply (regenerate = parent ของ target) */
  parentMessageId: string | null;
  regenerateTargetId: string | null;
  nextVariantIndex: number;
  messagesForLlm: ChatMessageParam[];
  model: ResolvedModelInfo;
  /** ข้อความผู้ใช้ล่าสุด (ไว้ตั้งชื่อ conversation ครั้งแรก) */
  titleSeed: string | null;
  signal?: AbortSignal;
}

interface ResolvedModelInfo {
  modelKey: string;
  providerModelId: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  energyMultiplier: number;
}

export async function prepareChat(opts: {
  userId: string;
  conversationId: string;
  content?: string;
  regenerateMessageId?: string;
}): Promise<PreparedChat> {
  const isRegenerate = Boolean(opts.regenerateMessageId);
  await enforceRateLimit(isRegenerate ? "regenerate" : "chat", opts.userId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: opts.conversationId },
    include: {
      character: {
        include: {
          examples: { orderBy: { position: "asc" } },
          creator: { select: { userId: true } },
        },
      },
      persona: true,
      summary: true,
    },
  });
  if (!conversation || conversation.userId !== opts.userId) {
    throw new ApiError("NOT_FOUND", "ไม่พบบทสนทนา");
  }

  // ── หาข้อความล่าสุดแบบ active variant ──
  let historyMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id, isActiveVariant: true },
    orderBy: { createdAt: "desc" },
    take: RECENT_MESSAGE_WINDOW + 2,
    select: { id: true, role: true, content: true, createdAt: true, parentMessageId: true },
  });
  historyMessages.reverse();

  let regenerateTargetId: string | null = null;
  let parentMessageId: string | null = null;
  let nextVariantIndex = 0;

  if (isRegenerate) {
    const target = await prisma.message.findUnique({
      where: { id: opts.regenerateMessageId! },
    });
    if (!target || target.conversationId !== conversation.id || target.role !== "ASSISTANT") {
      throw new ApiError("NOT_FOUND", "ไม่พบข้อความที่ต้องการสร้างใหม่");
    }
    regenerateTargetId = target.id;
    parentMessageId = target.parentMessageId;
    // context จบที่ก่อนข้อความ target
    historyMessages = historyMessages.filter((m) => m.createdAt < target.createdAt);

    if (parentMessageId) {
      const siblings = await prisma.message.findMany({
        where: { parentMessageId },
        select: { variantIndex: true },
        orderBy: { variantIndex: "desc" },
        take: 1,
      });
      nextVariantIndex = (siblings[0]?.variantIndex ?? -1) + 1;
    }
  }

  // ── insert ข้อความผู้ใช้ (send mode) ──
  let newUserMessageId: string | null = null;
  if (opts.content && !isRegenerate) {
    const inserted = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: opts.content,
      },
    });
    newUserMessageId = inserted.id;
    parentMessageId = inserted.id;
    historyMessages = [
      ...historyMessages,
      { id: inserted.id, role: "USER" as const, content: opts.content, createdAt: inserted.createdAt, parentMessageId: null },
    ];
  }

  // ── resolve model ──
  const model = await resolveModel(conversation.character.defaultModelKey).catch(() => {
    throw new ApiError("MODEL_UNAVAILABLE");
  });

  // ── build prompt (ก่อน reserve — เพื่อ estimate จาก payload จริงที่ยิงเข้า LLM) ──
  const [memories, affinity] = await Promise.all([
    retrieveMemories(conversation.id),
    getAffinitySummary(conversation.userId, conversation.characterId),
  ]);
  const intimacyLv = pointsToLevel(affinity.points);
  const systemPrompt = buildSystemPrompt({
    character: {
      name: conversation.character.name,
      tagline: conversation.character.tagline,
      description: conversation.character.description,
      personality: conversation.character.personality,
      scenario: conversation.character.scenario,
      speakingStyle: conversation.character.speakingStyle,
    },
    persona: conversation.persona,
    memories,
    summary: conversation.summary?.summary,
    intimacy: { level: intimacyLv.level, label: intimacyLv.label, directive: intimacyLv.directive },
  });
  const messagesForLlm = buildChatMessages({
    systemPrompt,
    examples: conversation.character.examples.map((e) => ({
      userTurn: e.userTurn,
      characterTurn: e.characterTurn,
    })),
    recentMessages: historyMessages.map((m) => ({ role: m.role, content: m.content })),
  });

  // ── reserve energy — ประมาณจาก messages จริงทั้งก้อน (system prompt + examples +
  //    history) เพื่อไม่ให้ charged เกิน reserved ตอน completion ยาวกว่า estimate ──
  const promptEstimate = messagesForLlm.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const reservedAmount = estimateReserveAmount(model.energyMultiplier, promptEstimate);
  const idempotencyKey = randomUUID();

  await spendEnergy({
    userId: opts.userId,
    amount: reservedAmount,
    type: isRegenerate ? EnergyTransactionType.REGENERATE : EnergyTransactionType.CHAT_USAGE,
    idempotencyKey,
    referenceType: "conversation",
    referenceId: conversation.id,
    metadata: { phase: "reserve", modelKey: model.modelKey },
  });

  return {
    conversationId: conversation.id,
    userId: opts.userId,
    characterId: conversation.character.id,
    characterName: conversation.character.name,
    creatorUserId: conversation.character.creator?.userId ?? null,
    idempotencyKey,
    reservedAmount,
    newUserMessageId,
    parentMessageId,
    regenerateTargetId,
    nextVariantIndex,
    messagesForLlm,
    model,
    titleSeed: opts.content ?? null,
  };
}

export interface StreamResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}

/** SSE encoder */
function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** สร้าง ReadableStream ของ SSE — caller wrap เป็น Response */
export function createChatStream(prepared: PreparedChat): ReadableStream<Uint8Array> {
  const startedAt = Date.now();
  let fullText = "";
  let usage = { promptTokens: 0, completionTokens: 0 };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => controller.enqueue(sse(event, data));
      let settled = false;

      try {
        for await (const chunk of streamChatCompletion({
          model: prepared.model.providerModelId,
          messages: prepared.messagesForLlm,
          signal: prepared.signal,
        })) {
          if (chunk.text) {
            fullText += chunk.text;
            enqueue("delta", { text: chunk.text });
          }
          if (chunk.usage) usage = chunk.usage;
        }

        // token จาก provider อาจไม่ยอดครบ — fallback ประมาณจากความยาว
        const finalPromptTokens =
          usage.promptTokens ||
          prepared.messagesForLlm.reduce((s, m) => s + estimateTokens(m.content), 0);
        const finalCompletionTokens = usage.completionTokens || estimateTokens(fullText);

        // ── save assistant message ──
        const saved = await saveAssistantMessage(prepared, fullText, finalCompletionTokens);

        // ── settle energy (refund ส่วนเกิน) + usage log ──
        const actualCost = calculateChatCost(
          prepared.model.energyMultiplier,
          finalPromptTokens,
          finalCompletionTokens
        );
        await settleEnergy({
          userId: prepared.userId,
          reservedAmount: prepared.reservedAmount,
          actualCost,
          idempotencyKey: prepared.idempotencyKey,
          referenceType: "conversation",
          referenceId: prepared.conversationId,
        }).catch(() => {});

        // ── creator earning (share-of-energy, docs/creator-system.md §4) ──
        // จ่ายจาก cost ที่ user จ่ายจริงหลัง refund; self-chat ไม่ได้ share (กัน farm);
        // await ได้ — tx ท้องถิ่นเร็ว และทำให้ event done การันตีว่า earning ถูกบันทึกแล้ว
        if (prepared.creatorUserId && prepared.creatorUserId !== prepared.userId) {
          await accrueCreatorEarning({
            creatorUserId: prepared.creatorUserId,
            characterId: prepared.characterId,
            amount: calculateCreatorShare(actualCost),
            idempotencyKey: `${prepared.idempotencyKey}:earning`,
            note: "chat_share",
          }).catch(() => {});
        }

        await prisma.aiUsageLog
          .create({
            data: {
              userId: prepared.userId,
              conversationId: prepared.conversationId,
              feature: "chat",
              provider: "openrouter",
              modelKey: prepared.model.modelKey,
              promptTokens: finalPromptTokens,
              completionTokens: finalCompletionTokens,
              totalTokens: finalPromptTokens + finalCompletionTokens,
              estimatedCost: estimatedUsdCost(
                prepared.model.inputCostPerMillion,
                prepared.model.outputCostPerMillion,
                finalPromptTokens,
                finalCompletionTokens
              ),
              latencyMs: Date.now() - startedAt,
              status: "SUCCESS",
            },
          })
          .catch(() => {});
        settled = true;

        enqueue("done", {
          messageId: saved.id,
          content: saved.content,
          usage: { promptTokens: finalPromptTokens, completionTokens: finalCompletionTokens },
          energy: { reserved: prepared.reservedAmount, charged: actualCost },
        });

        // post-message background jobs (memory + summary) — ก่อนปิด stream
        await maybeExtractMemories(prepared.conversationId);
        await maybeUpdateSummary(prepared.conversationId);

        // quest progress — นับเฉพาะแชทสำเร็จ; AI-judge quest ยิง background (LLM latency)
        await bumpChatQuestProgress(prepared.userId, prepared.characterId).catch(() => {});
        void judgeAiTopicQuests(prepared.userId, prepared.characterId).catch(() => {});
      } catch (error) {
        // ── failure path: refund ทั้งที่ reserve + log ERROR ──
        // หมายเหตุ: เช็คทั้ง instanceof และชื่อ class — Next.js dev bundle อาจแยก
        // module instance ทำให้ instanceof ข้ามไฟล์ไม่ตรง
        if (!settled) {
          console.error(
            `[chat] stream failed:`,
            error instanceof Error ? `${error.name}: ${error.message}` : error
          );
          const llmName = (error as { name?: string } | null)?.name === "LlmError";
          const llmCodeRaw = (error as { code?: unknown } | null)?.code;
          const knownCodes = ["MODEL_UNAVAILABLE", "RATE_LIMITED", "CONTENT_REJECTED", "LLM_TIMEOUT", "INTERNAL_ERROR"] as const;
          const code =
            error instanceof LlmError
              ? error.code
              : llmName && typeof llmCodeRaw === "string" && (knownCodes as readonly string[]).includes(llmCodeRaw)
                ? (llmCodeRaw as (typeof knownCodes)[number])
                : error instanceof Error && error.name === "AbortError"
                  ? "ABORTED"
                  : "INTERNAL_ERROR";

          await refundEnergy({
            userId: prepared.userId,
            reservedAmount: prepared.reservedAmount,
            idempotencyKey: prepared.idempotencyKey,
            referenceType: "conversation",
            referenceId: prepared.conversationId,
            reason: code.toLowerCase(),
          }).catch(() => {});

          await prisma.aiUsageLog
            .create({
              data: {
                userId: prepared.userId,
                conversationId: prepared.conversationId,
                feature: "chat",
                provider: "openrouter",
                modelKey: prepared.model.modelKey,
                promptTokens: usage.promptTokens,
                completionTokens: 0,
                totalTokens: usage.promptTokens,
                latencyMs: Date.now() - startedAt,
                status: code === "LLM_TIMEOUT" ? "TIMEOUT" : code === "CONTENT_REJECTED" ? "CONTENT_REJECTED" : "ERROR",
                errorCode: code,
              },
            })
            .catch(() => {});

          if (code === "ABORTED") {
            // ผู้ใช้กด stop เอง — เซฟข้อความที่ได้มาเป็น ABORTED ถ้ามี
            if (fullText.trim().length > 0) {
              const saved = await saveAssistantMessage(prepared, fullText, usage.completionTokens || estimateTokens(fullText), "ABORTED").catch(() => null);
              enqueue("done", {
                messageId: saved?.id ?? null,
                aborted: true,
                content: fullText,
              });
            } else {
              enqueue("done", { aborted: true });
            }
          } else {
            enqueue("error", { code });
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}

async function saveAssistantMessage(
  prepared: PreparedChat,
  content: string,
  completionTokens: number,
  status: "COMPLETED" | "ABORTED" = "COMPLETED"
) {
  const message = await prisma.message.create({
    data: {
      conversationId: prepared.conversationId,
      role: "ASSISTANT",
      content,
      parentMessageId: prepared.regenerateTargetId ? prepared.parentMessageId : prepared.newUserMessageId ?? prepared.parentMessageId,
      variantIndex: prepared.regenerateTargetId ? prepared.nextVariantIndex : 0,
      isActiveVariant: true,
      model: prepared.model.modelKey,
      completionTokens,
      status,
    },
  });

  if (prepared.regenerateTargetId) {
    // ปิด variants เก่า ให้ variant ใหม่เป็นตัวที่ active
    await prisma.message.updateMany({
      where: {
        conversationId: prepared.conversationId,
        parentMessageId: prepared.parentMessageId,
        role: "ASSISTANT",
        id: { not: message.id },
      },
      data: { isActiveVariant: false },
    });
  }

  await prisma.conversation.update({
    where: { id: prepared.conversationId },
    data: {
      lastMessageAt: new Date(),
      // ตั้งชื่อจากข้อความแรกของผู้ใช้ ถ้ายังเป็นชื่อ default
      ...(prepared.titleSeed
        ? {
            title:
              (
                await prisma.conversation.findUnique({
                  where: { id: prepared.conversationId },
                  select: { title: true },
                })
              )?.title === DEFAULT_TITLE
                ? prepared.titleSeed.slice(0, 40)
                : undefined,
          }
        : {}),
    },
  });
  return message;
}
