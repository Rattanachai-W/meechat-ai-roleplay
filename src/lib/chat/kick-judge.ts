import { ApiError } from "@/lib/api/errors";
import {
  completeOnce,
  resolveCheapestJobModel,
  type ChatMessageParam,
} from "@/lib/ai/gateway";

export const KICK_CONFIDENCE_THRESHOLD = 0.75;
export const KICK_MIN_MESSAGES = 4;

export type KickJudgeInput = {
  characterName: string;
  personality?: string | null;
  transcript: string;
  assistantReply: string;
  activeMessageCount: number;
};

export type KickJudgeResult = {
  kick: boolean;
  confidence: number;
  reason: string;
};

export function assertConversationOpen(endedAt: Date | null | undefined): void {
  if (endedAt) throw new ApiError("CONVERSATION_ENDED");
}

export function parseKickJudgeResponse(text: string): KickJudgeResult | null {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as {
      kick?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };
    if (typeof parsed.kick !== "boolean") return null;
    const confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) return null;
    return {
      kick: parsed.kick,
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "",
    };
  } catch {
    return null;
  }
}

export function shouldApplyKick(
  parsed: { kick: boolean; confidence: number } | null
): boolean {
  return Boolean(parsed && parsed.kick && parsed.confidence >= KICK_CONFIDENCE_THRESHOLD);
}

export async function judgeConversationKick(
  input: KickJudgeInput
): Promise<KickJudgeResult> {
  if (input.activeMessageCount < KICK_MIN_MESSAGES) {
    return { kick: false, confidence: 0, reason: "" };
  }
  try {
    const model = await resolveCheapestJobModel();
    const messages: ChatMessageParam[] = [
      {
        role: "system",
        content:
          "You judge whether a roleplay character would refuse to continue THIS conversation. " +
          'Reply with JSON only: {"kick":boolean,"confidence":0-1,"reason":"short"}. ' +
          "Kick ONLY for severe insult, betrayal of core values, or extreme disrespect relative to the persona. " +
          "Default kick=false. Mild teasing, normal conflict, or accepted mature roleplay must not kick. " +
          "Do not mention systems, meters, or easter eggs.",
      },
      {
        role: "user",
        content:
          `Character: ${input.characterName}\n` +
          `Personality: ${input.personality?.trim() || "(unspecified)"}\n\n` +
          `Recent transcript:\n${input.transcript}\n\n` +
          `Latest assistant reply:\n${input.assistantReply}`,
      },
    ];
    const { text } = await completeOnce({
      model,
      messages,
      maxTokens: 120,
      temperature: 0.1,
    });
    return parseKickJudgeResponse(text) ?? { kick: false, confidence: 0, reason: "" };
  } catch {
    return { kick: false, confidence: 0, reason: "" };
  }
}
