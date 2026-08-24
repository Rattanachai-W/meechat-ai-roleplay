import { describe, it, expect } from "vitest";
import { INTIMACY_LEVELS, pointsToLevel } from "@/lib/quests/intimacy";
import { questInputSchema } from "@/lib/validation/quest";

describe("intimacy levels", () => {
  it("มี 5 เลเวลเรียงจากต่ำไปสูง พร้อมชื่อระดับและ directive", () => {
    expect(INTIMACY_LEVELS.length).toBe(5);
    expect(INTIMACY_LEVELS.map((l) => l.minPoints)).toEqual([0, 30, 80, 160, 300]);
    expect(INTIMACY_LEVELS.map((l) => l.label)).toEqual([
      "คนแปลกหน้า",
      "คนรู้จัก",
      "เพื่อนสนิท",
      "สนิทใจ",
      "ผู้พิเศษ",
    ]);
    expect(INTIMACY_LEVELS.every((l) => l.directive.length > 10)).toBe(true);
    // เลเวลสุดท้ายไม่มี nextLevelAt
    expect(INTIMACY_LEVELS[4].nextLevelAt).toBeNull();
  });

  it("pointsToLevel: 0→Lv1, 29→Lv1, 30→Lv2, 159→Lv3, 160→Lv4, 300+→Lv5", () => {
    expect(pointsToLevel(0).level).toBe(1);
    expect(pointsToLevel(29).level).toBe(1);
    expect(pointsToLevel(30).level).toBe(2);
    expect(pointsToLevel(79).level).toBe(2);
    expect(pointsToLevel(159).level).toBe(3);
    expect(pointsToLevel(160).level).toBe(4);
    expect(pointsToLevel(299).level).toBe(4);
    expect(pointsToLevel(300).level).toBe(5);
    expect(pointsToLevel(9999).label).toBe("ผู้พิเศษ");
  });

  it("คะแนนติดลบ/ทศนิยม → ปังลง Lv.1 (กัน input แปลก)", () => {
    expect(pointsToLevel(-5).level).toBe(1);
    expect(pointsToLevel(10.9).level).toBe(1);
  });
});

describe("questInputSchema", () => {
  const valid = {
    goalType: "MESSAGES",
    title: "ชวนไปเดินเล่น",
    description: "คุยจนได้ชวนไปเดินเล่นตอนเย็น",
  };

  it("schema พื้นฐานผ่าน + default target=1 rewardIntimacy=10", () => {
    const parsed = questInputSchema.parse(valid);
    expect(parsed.target).toBe(1);
    expect(parsed.rewardIntimacy).toBe(10);
  });

  it("AI_TOPIC ไม่มี criteriaPrompt → ไม่ผ่าน refine", () => {
    const r = questInputSchema.safeParse({ ...valid, goalType: "AI_TOPIC" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path[0]).toBe("criteriaPrompt");
    }
  });

  it("AI_TOPIC มี criteriaPrompt → ผ่าน", () => {
    const r = questInputSchema.safeParse({
      ...valid,
      goalType: "AI_TOPIC",
      criteriaPrompt: "ผู้ใช้ชวนไปดูดาวและตัวละครตอบตกลง",
    });
    expect(r.success).toBe(true);
  });

  it("rewardIntimacy เกิน 50 / target ติดลบ → ไม่ผ่าน", () => {
    expect(questInputSchema.safeParse({ ...valid, rewardIntimacy: 51 }).success).toBe(false);
    expect(questInputSchema.safeParse({ ...valid, target: 0 }).success).toBe(false);
  });

  it("title สั้นเกิน / description ยาวเกิน → ไม่ผ่าน", () => {
    expect(questInputSchema.safeParse({ ...valid, title: "ก" }).success).toBe(false);
    expect(questInputSchema.safeParse({ ...valid, description: "สั้น" }).success).toBe(false);
    expect(
      questInputSchema.safeParse({ ...valid, description: "ย".repeat(201) }).success
    ).toBe(false);
  });
});
