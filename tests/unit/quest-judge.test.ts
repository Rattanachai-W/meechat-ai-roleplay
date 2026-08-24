import { describe, expect, it } from "vitest";
import { parseJudgeVerdict } from "@/lib/quests/service";

/** parse คำตอบ AI judge → boolean | null (best-effort, ห้าม throw) */
describe("parseJudgeVerdict", () => {
  it("JSON ตรง ๆ", () => {
    expect(parseJudgeVerdict('{"completed": true}')).toBe(true);
    expect(parseJudgeVerdict('{"completed": false}')).toBe(false);
  });

  it("JSON ใน code fence ```json```", () => {
    expect(parseJudgeVerdict('```json\n{"completed": true}\n```')).toBe(true);
    expect(parseJudgeVerdict('เรียบร้อย!\n```\n{"completed": false}\n```')).toBe(false);
  });

  it("มีข้อความประกอบรอบ ๆ JSON", () => {
    expect(parseJudgeVerdict('คำตอบ: {"completed": true} ครับ')).toBe(true);
  });

  it("ไม่มี JSON / parse พัง / completed ไม่ใช่ boolean → null", () => {
    expect(parseJudgeVerdict("ผ่านเกณฑ์")).toBeNull();
    expect(parseJudgeVerdict("{broken json}")).toBeNull();
    expect(parseJudgeVerdict('{"completed": "yes"}')).toBeNull();
    expect(parseJudgeVerdict("{}")).toBeNull();
    expect(parseJudgeVerdict("")).toBeNull();
  });
});
