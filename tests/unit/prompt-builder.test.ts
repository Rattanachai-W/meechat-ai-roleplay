import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildChatMessages } from "@/lib/ai/prompt-builder";

const baseCharacter = {
  name: "ปราณี",
  tagline: "หมอที่ใจดีเกินไป",
  description: "แพทย์ฝั่งผู้ป่วยนอก ชอบถามอาการละเอียด".repeat(2),
};

describe("buildSystemPrompt", () => {
  it("มี identity + กฎ roleplay เสมอ", () => {
    const p = buildSystemPrompt({ character: baseCharacter });
    expect(p).toContain('คุณคือ "ปราณี"');
    expect(p).toContain("ไม่หลุดบทบาท");
    expect(p).toContain("ภาษาไทย");
    expect(p).toContain("อย่าเปิดเผยว่าตัวเองเป็น AI");
  });

  it("มีกฎล็อกสรรพนามให้ถูกเพศของตัวละครเสมอ (กันหญิงใช้ 'ผม/ครับ')", () => {
    const p = buildSystemPrompt({ character: baseCharacter });
    expect(p).toContain("ถูกเพศตลอดทั้งบทสนทนา");
    expect(p).toContain('ห้ามเรียกตัวเองว่า "ผม"');
    expect(p).toContain('ห้ามลงท้าย "ค่ะ/จ้ะ/คะ"');
  });

  it("section ที่มีข้อมูลถูกใส่, section ว่างถูกข้าม", () => {
    const p = buildSystemPrompt({
      character: {
        ...baseCharacter,
        personality: "ใจเย็น พูดนุ่มนวล",
        scenario: null,
        speakingStyle: "   ",
      },
    });
    expect(p).toContain("### ตัวตนและเรื่องราว");
    expect(p).toContain("### นิสัย");
    expect(p).not.toContain("### ฉากเริ่มต้น");
    expect(p).not.toContain("### สไตล์การพูด");
  });

  it("persona → บล็อกตัวตนผู้ใช้", () => {
    const p = buildSystemPrompt({
      character: baseCharacter,
      persona: { name: "โจ้", gender: "ชาย", age: 28, description: "โปรแกรมเมอร์" },
    });
    expect(p).toContain("### ตัวตนของผู้ใช้");
    expect(p).toContain("ชื่อเล่นผู้ใช้: โจ้");
    expect(p).toContain("เพศ: ชาย");
    expect(p).toContain("อายุ: 28");
    expect(p).toContain("ข้อมูล: โปรแกรมเมอร์");
  });

  it("persona ว่างทั้งก้อน → ไม่มีบล็อก", () => {
    const p = buildSystemPrompt({
      character: baseCharacter,
      persona: { name: null, description: null },
    });
    expect(p).not.toContain("ตัวตนของผู้ใช้");
  });

  it("intimacy → บล็อกความสัมพันธ์พร้อมเลเวล+directive (วางหลังสไตล์การพูด)", () => {
    const p = buildSystemPrompt({
      character: { ...baseCharacter, speakingStyle: "พูดตรง ๆ" },
      intimacy: { level: 4, label: "สนิทใจ", directive: "ไว้ใจลึก — เปิดใจเล่าเรื่องที่ไม่ค่อยบอกใคร" },
    });
    expect(p).toContain("### ความสัมพันธ์กับผู้ใช้");
    expect(p).toContain("Lv.4 สนิทใจ");
    expect(p).toContain("ปรับน้ำเสียงและระยะใกล้ในการพูดให้เหมาะกับระดับนี้");
    expect(p.indexOf("### ความสัมพันธ์กับผู้ใช้")).toBeGreaterThan(p.indexOf("### สไตล์การพูด"));
  });

  it("ไม่ส่ง intimacy → ไม่มีบล็อกความสัมพันธ์", () => {
    const p = buildSystemPrompt({ character: baseCharacter });
    expect(p).not.toContain("ความสัมพันธ์กับผู้ใช้");
  });

  it("summary + memories ถูกฝังตามลำดับท้าย prompt", () => {
    const p = buildSystemPrompt({
      character: baseCharacter,
      summary: "เมื่อวานผู้ใช้มาตรวจความดัน",
      memories: [
        { type: "fact", content: "แพ้ยา penicillin", importance: 0.9 },
        { type: "preference", content: "ชอบกินข้าวผัด", importance: 0.5 },
      ],
    });
    const idxSummary = p.indexOf("เรื่องย่อของบทสนทนาก่อนหน้า");
    const idxMemories = p.indexOf("สิ่งที่ควรจำเกี่ยวกับผู้ใช้");
    expect(idxSummary).toBeGreaterThan(-1);
    expect(idxMemories).toBeGreaterThan(idxSummary);
    expect(p).toContain("[fact] แพ้ยา penicillin");
    expect(p).toContain("[preference] ชอบกินข้าวผัด");
  });
});

describe("buildChatMessages", () => {
  it("system ก่อนเสมอ + few-shot examples คั่น user/assistant", () => {
    const msgs = buildChatMessages({
      systemPrompt: "SYS",
      examples: [{ userTurn: "u1", characterTurn: "a1" }],
      recentMessages: [],
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
  });

  it("history: SYSTEM โดนกรองทิ้ง, USER→user ASSISTANT→assistant, เรียงตาม input", () => {
    const msgs = buildChatMessages({
      systemPrompt: "SYS",
      recentMessages: [
        { role: "USER", content: "h1" },
        { role: "SYSTEM", content: "internal" },
        { role: "ASSISTANT", content: "h2" },
        { role: "USER", content: "h3" },
      ],
    });
    expect(msgs.map((m) => [m.role, m.content])).toEqual([
      ["system", "SYS"],
      ["user", "h1"],
      ["assistant", "h2"],
      ["user", "h3"],
    ]);
  });
});
