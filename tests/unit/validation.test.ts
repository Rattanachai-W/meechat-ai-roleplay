import { describe, it, expect } from "vitest";
import { chatRequestSchema, createConversationSchema } from "@/lib/validation/chat";
import { characterInputSchema } from "@/lib/validation/character";
import { personaInputSchema } from "@/lib/validation/persona";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("chatRequestSchema", () => {
  it("valid ผ่าน", () => {
    const r = chatRequestSchema.parse({ conversationId: UUID, content: " สวัสดี " });
    expect(r).toEqual({ conversationId: UUID, content: "สวัสดี" });
  });

  it.each([
    [{ conversationId: "not-a-uuid", content: "hi" }, "conversationId uuid"],
    [{ conversationId: UUID, content: "" }, "content ว่าง"],
    [{ conversationId: UUID, content: "   " }, "content เว้นวรรคอย่างเดียว"],
    [{ conversationId: UUID, content: "x".repeat(4001) }, "content เกิน 4000"],
    [{ content: "hi" }, "ขาด conversationId"],
    [{}, "body เปล่า"],
  ] as [unknown, string][])("reject: %s", (input, label) => {
    expect(() => chatRequestSchema.parse(input), label).toThrow();
  });

  it("content 4000 ตัวอักษรพอดี → ผ่าน", () => {
    expect(() => chatRequestSchema.parse({ conversationId: UUID, content: "ก".repeat(4000) })).not.toThrow();
  });
});

describe("createConversationSchema", () => {
  it("personaId nullable + title optional", () => {
    expect(createConversationSchema.parse({ characterId: UUID }).personaId).toBeUndefined();
    expect(createConversationSchema.parse({ characterId: UUID, personaId: null }).personaId).toBeNull();
    expect(() =>
      createConversationSchema.parse({ characterId: UUID, title: "" })
    ).toThrow(); // title trim แล้วว่าง
  });
});

describe("characterInputSchema", () => {
  const valid = {
    name: "ตัวละครทดสอบ",
    tagline: "แท็กไลน์ที่ยาวพอ",
    description: "คำอธิบายที่ยาวเกิน 30 ตัวอักษรอย่างแน่นอนนนนนนนนนน",
    firstMessage: "ยินดีต้อนรับ!",
  };

  it("defaults: PUBLIC / GENERAL / tagSlugs [] / examples []", () => {
    const r = characterInputSchema.parse(valid);
    expect(r.visibility).toBe("PUBLIC");
    expect(r.contentRating).toBe("GENERAL");
    expect(r.tagSlugs).toEqual([]);
    expect(r.examples).toEqual([]);
  });

  it.each([
    [{ ...valid, name: "ก" }, "name สั้นเกิน (<2)"],
    [{ ...valid, name: "ก".repeat(61) }, "name ยาวเกิน"],
    [{ ...valid, tagline: "สั้น" }, "tagline <5"],
    [{ ...valid, description: "สั้นเกินไป" }, "description <30"],
    [{ ...valid, visibility: "SECRET" }, "visibility enum ผิด"],
    [{ ...valid, tagSlugs: Array.from({ length: 7 }, (_, i) => `t${i}`) }, "tagSlugs >6"],
    [{ ...valid, examples: Array.from({ length: 6 }, () => ({ userTurn: "u", characterTurn: "c" })) }, "examples >5"],
    [{ ...valid, defaultModelKey: "" }, "defaultModelKey ว่าง → undefined ไม่ throw"], // see below
  ] as [unknown, string][])("case %s", (input, label) => {
    if (label.includes("ไม่ throw")) {
      expect(characterInputSchema.parse(input).defaultModelKey).toBeUndefined();
      return;
    }
    expect(() => characterInputSchema.parse(input), label).toThrow();
  });

  it("optionalText trim แล้วว่าง → undefined", () => {
    const r = characterInputSchema.parse({ ...valid, personality: "   " });
    expect(r.personality).toBeUndefined();
  });
});

describe("personaInputSchema", () => {
  it("age coerce จาก string + bound 1..120", () => {
    expect(personaInputSchema.parse({ name: "โจ้", age: "25" }).age).toBe(25);
    expect(() => personaInputSchema.parse({ name: "โจ้", age: 0 })).toThrow();
    expect(() => personaInputSchema.parse({ name: "โจ้", age: 121 })).toThrow();
    expect(() => personaInputSchema.parse({ name: "โจ้", age: "abc" })).toThrow();
  });

  it("isDefault default false, unknown key ถูก strip (mass-assignment safe)", () => {
    const r = personaInputSchema.parse({
      name: "โจ้",
      userId: "spoofed-user-id",
      id: "spoofed-id",
    } as any);
    expect((r as any).userId).toBeUndefined();
    expect((r as any).id).toBeUndefined();
    expect(r.isDefault).toBe(false);
  });

  it.each([["", "name ว่าง"], ["x".repeat(51), "name >50"]] as [string, string][])(
    "name reject: %s (%s)",
    (name) => {
      expect(() => personaInputSchema.parse({ name })).toThrow();
    }
  );
});
