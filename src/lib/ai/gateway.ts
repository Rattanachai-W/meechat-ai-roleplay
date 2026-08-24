/**
 * LLM Gateway — abstraction เหนือ provider
 * ตอนนี้มี OpenRouter เป็น provider เดียว (ตาม spec: OpenRouter-first)
 * โค้ดอื่นเรียกผ่าน streamChatCompletion() เท่านั้น ห้ามเรียก OpenRouter ตรง ๆ
 */

export interface ChatMessageParam {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamRequest {
  /** model key จากตาราง ai_models (เช่น "google/gemini-2.0-flash-001") */
  model: string;
  messages: ChatMessageParam[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
}

export interface StreamChunk {
  text?: string;
  usage?: UsageInfo;
}

export class LlmError extends Error {
  constructor(
    public readonly code: "MODEL_UNAVAILABLE" | "RATE_LIMITED" | "CONTENT_REJECTED" | "LLM_TIMEOUT" | "INTERNAL_ERROR",
    message?: string
  ) {
    super(message ?? code);
    this.name = "LlmError";
  }
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const STREAM_TIMEOUT_MS = 90_000;

interface OpenRouterStreamChunk {
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { code?: number | string; message?: string };
}

/**
 * Stream chat completion จาก OpenRouter (SSE)
 * yield ทีละ chunk: ข้อความบางส่วน และ/หรือ usage (chunk สุดท้าย)
 */
export async function* streamChatCompletion(req: StreamRequest): AsyncGenerator<StreamChunk> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new LlmError("MODEL_UNAVAILABLE", "OPENROUTER_API_KEY ยังไม่ได้ตั้งค่า");
  }

  const timeoutSignal = AbortSignal.timeout(STREAM_TIMEOUT_MS);
  const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://meechat.app",
        "X-Title": "MeeChat",
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: true,
        temperature: req.temperature ?? 0.9,
        max_tokens: req.maxTokens ?? 1200,
        usage: { include: true },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new LlmError("LLM_TIMEOUT");
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw error; // client กดหยุดเอง — ให้ caller จัดการ
    }
    throw new LlmError("MODEL_UNAVAILABLE", "เชื่อมต่อผู้ให้บริการโมเดลไม่สำเร็จ");
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    mapHttpError(response.status, text);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // OpenRouter ส่ง SSE: บรรทัด "data: {...}" คั่นด้วย \n\n
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          let parsed: OpenRouterStreamChunk;
          try {
            parsed = JSON.parse(payload) as OpenRouterStreamChunk;
          } catch {
            continue;
          }
          if (parsed.error) {
            throw new LlmError("MODEL_UNAVAILABLE", parsed.error.message);
          }
          const deltaText = parsed.choices?.[0]?.delta?.content;
          const usage = parsed.usage;
          if (deltaText || usage) {
            yield {
              ...(deltaText ? { text: deltaText } : {}),
              ...(usage
                ? {
                    usage: {
                      promptTokens: usage.prompt_tokens ?? 0,
                      completionTokens: usage.completion_tokens ?? 0,
                    },
                  }
                : {}),
            };
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new LlmError("LLM_TIMEOUT");
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function mapHttpError(status: number, bodyText: string): never {
  if (status === 401 || status === 403) {
    throw new LlmError("MODEL_UNAVAILABLE", "API key ของผู้ให้บริการไม่ถูกต้อง");
  }
  if (status === 402) {
    throw new LlmError("MODEL_UNAVAILABLE", "เครดิตของผู้ให้บริการไม่พอ (OpenRouter credit)");
  }
  // 404 = provider ไม่รู้จัก model นี้ (ถูกปลด/สะกดผิด)
  if (status === 404) {
    throw new LlmError("MODEL_UNAVAILABLE", "ไม่พบโมเดลนี้ที่ผู้ให้บริการ");
  }
  if (status === 429) {
    throw new LlmError("RATE_LIMITED");
  }
  if (status === 400 && /content|moderation|filter/i.test(bodyText)) {
    throw new LlmError("CONTENT_REJECTED");
  }
  if (status >= 500) {
    throw new LlmError("MODEL_UNAVAILABLE");
  }
  throw new LlmError("INTERNAL_ERROR", `provider error ${status}`);
}

export interface ResolvedModel {
  modelKey: string;
  providerModelId: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  energyMultiplier: number;
}

/** เลือกโมเดลจาก ai_models — ไม่พบ/ปิดใช้งาน → ลอง default แรกสุด */
export async function resolveModel(modelKey?: string | null): Promise<ResolvedModel> {
  const models = await prismaSafeList();
  if (models.length === 0) throw new LlmError("MODEL_UNAVAILABLE", "ยังไม่มีโมเดลในระบบ");

  const found = modelKey ? models.find((m) => m.modelKey === modelKey) : undefined;
  const chosen = found ?? models[0];
  return {
    modelKey: chosen.modelKey,
    providerModelId: chosen.providerModelId,
    inputCostPerMillion: Number(chosen.inputCostPerMillion),
    outputCostPerMillion: Number(chosen.outputCostPerMillion),
    energyMultiplier: Number(chosen.energyMultiplier),
  };
}

import { prisma } from "@/lib/db/prisma";

function prismaSafeList() {
  return prisma.aiModel.findMany({
    where: { isEnabled: true },
    orderBy: { sortOrder: "asc" },
  });
}

/** เรียกครั้งเดียวไม่ stream (ใช้ใน memory extraction / summary job) */
export async function completeOnce(req: {
  model: string;
  messages: ChatMessageParam[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; usage?: UsageInfo }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new LlmError("MODEL_UNAVAILABLE", "OPENROUTER_API_KEY ยังไม่ได้ตั้งค่า");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://meechat.app",
        "X-Title": "MeeChat",
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 600,
        usage: { include: true },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new LlmError("LLM_TIMEOUT");
    throw new LlmError("MODEL_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok || !response.body) {
    mapHttpError(response.status, await response.text().catch(() => ""));
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (data.error) throw new LlmError("MODEL_UNAVAILABLE", data.error.message);
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}

/** model ถูกที่สุดที่เปิดใช้งาน — สำหรับ background jobs */
export async function resolveCheapestJobModel(): Promise<string> {
  const models = await prismaSafeList();
  const flash = models.find(
    (m) => Number(m.inputCostPerMillion) > 0 && m.modelKey.includes("flash")
  );
  const chosen = flash ?? models[0];
  if (!chosen) throw new LlmError("MODEL_UNAVAILABLE", "ยังไม่มีโมเดลในระบบ");
  return chosen.providerModelId;
}
