import { describe, it, expect } from "vitest";
import {
  TOKENS_PER_ENERGY,
  DAILY_REWARD_AMOUNT,
  ESTIMATED_OUTPUT_TOKENS,
  calculateChatCost,
  estimateTokens,
  estimateReserveAmount,
  estimatedUsdCost,
} from "@/lib/energy/pricing";

describe("energy pricing", () => {
  it("ค่าคงที่ตาม spec: 1 energy = 1000 tokens, daily reward = 50", () => {
    expect(TOKENS_PER_ENERGY).toBe(1000);
    expect(DAILY_REWARD_AMOUNT).toBe(50);
    expect(ESTIMATED_OUTPUT_TOKENS).toBeGreaterThan(0);
  });

  describe("calculateChatCost", () => {
    it("ceil ขึ้นเสมอ (1000 tokens × multiplier 1 = 1)", () => {
      expect(calculateChatCost(1, 600, 400)).toBe(1);
      expect(calculateChatCost(1, 601, 400)).toBe(2); // 1001 → ceil 2
      expect(calculateChatCost(1, 0, 1)).toBe(1); // min charge = 1
    });

    it("multiplier คูณตรง ๆ", () => {
      expect(calculateChatCost(2, 500, 500)).toBe(2); // 1000×2 /1000
      expect(calculateChatCost(0.8, 625, 625)).toBe(1); // 1250×0.8=1000
      expect(calculateChatCost(5, 300, 300)).toBe(3); // 600×5/1000=3
    });

    it("input ติดลบไม่ควรเกิดขึ้น แต่ถ้าเกิดก็ยัง clamp ที่ 1", () => {
      expect(calculateChatCost(1, -100, -200)).toBe(1);
    });
  });

  describe("estimateTokens", () => {
    it("ประมาณจากความยาว +4 offset", () => {
      expect(estimateTokens("")).toBe(4);
      expect(estimateTokens("abc")).toBe(5); // ceil(3/3)+4
      expect(estimateTokens("abcdef")).toBe(6); // ceil(6/3)+4
      expect(estimateTokens("สวัสดีครับหมอ")).toBe(Math.ceil("สวัสดีครับหมอ".length / 3) + 4);
    });
  });

  describe("estimateReserveAmount", () => {
    it("reserve = cost(prompt + ESTIMATED_OUTPUT)", () => {
      const promptEstimate = estimateTokens("x".repeat(900));
      expect(estimateReserveAmount(1, promptEstimate)).toBe(
        calculateChatCost(1, promptEstimate, ESTIMATED_OUTPUT_TOKENS)
      );
      // reserve ต้อง >= actual ที่ completion สั้นกว่า estimate เสมอ
      expect(estimateReserveAmount(1.2, 800)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("estimatedUsdCost", () => {
    it("คิดตาม rate ต่อ million", () => {
      // $0.50/M in, $1.50/M out → 1M+1M tokens = $2
      expect(estimatedUsdCost(0.5, 1.5, 1_000_000, 1_000_000)).toBeCloseTo(2.0);
      expect(estimatedUsdCost(0.5, 1.5, 1419, 639)).toBeCloseTo(
        (1419 / 1e6) * 0.5 + (639 / 1e6) * 1.5
      );
      expect(estimatedUsdCost(0, 0, 9999, 9999)).toBe(0); // โมเดลฟรี
    });
  });
});
