import { describe, expect, it } from "vitest";
import {
  assertConversationOpen,
  parseKickJudgeResponse,
  shouldApplyKick,
} from "@/lib/chat/kick-judge";
import { ApiError } from "@/lib/api/errors";

describe("parseKickJudgeResponse", () => {
  it("parses fenced JSON", () => {
    const raw = '```json\n{"kick":true,"confidence":0.9,"reason":"insult"}\n```';
    expect(parseKickJudgeResponse(raw)).toEqual({
      kick: true,
      confidence: 0.9,
      reason: "insult",
    });
  });

  it("returns null on garbage", () => {
    expect(parseKickJudgeResponse("nope")).toBeNull();
  });
});

describe("shouldApplyKick", () => {
  it("requires kick true and confidence >= 0.75", () => {
    expect(shouldApplyKick({ kick: true, confidence: 0.75 })).toBe(true);
    expect(shouldApplyKick({ kick: true, confidence: 0.74 })).toBe(false);
    expect(shouldApplyKick({ kick: false, confidence: 1 })).toBe(false);
    expect(shouldApplyKick(null)).toBe(false);
  });
});

describe("assertConversationOpen", () => {
  it("throws CONVERSATION_ENDED when endedAt set", () => {
    expect(() => assertConversationOpen(new Date())).toThrow(ApiError);
    try {
      assertConversationOpen(new Date());
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("CONVERSATION_ENDED");
    }
  });

  it("allows open conversations", () => {
    expect(() => assertConversationOpen(null)).not.toThrow();
    expect(() => assertConversationOpen(undefined)).not.toThrow();
  });
});
