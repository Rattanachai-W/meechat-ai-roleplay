import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { api } from "../helpers/http";
import { requireDevServer } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";
import { judgeAiTopicQuests } from "@/lib/quests/service";

/**
 * AI_TOPIC quest — AI ตัดสินความสำเร็จจากบทสนทนา
 * mock gateway (completeOnce/resolveCheapestJobModel) เพื่อความ deterministic —
 * เช็คว่า judge อ่าน criteria + transcript แล้ว mark completed เฉพาะภารกิจที่ผ่านเกณฑ์
 */

const mocks = vi.hoisted(() => ({
  completeOnce: vi.fn(),
  resolveCheapestJobModel: vi.fn(),
}));

vi.mock("@/lib/ai/gateway", () => ({
  completeOnce: mocks.completeOnce,
  resolveCheapestJobModel: mocks.resolveCheapestJobModel,
}));

const suffix = randomUUID().slice(0, 8);

describe("AI_TOPIC quest judge", () => {
  let creator: TestUser;
  let fan: TestUser;
  let characterId = "";
  let laughQuestId = "";
  let sadQuestId = "";
  let conversationId = "";

  const cleanupUsers: TestUser[] = [];
  async function newTestUser(): Promise<TestUser> {
    const u = await createTestUser();
    cleanupUsers.push(u);
    return u;
  }

  beforeAll(async () => {
    await requireDevServer();
    await connectDb();

    creator = await newTestUser();
    fan = await newTestUser();
    await api("PATCH", "/api/creator/me", {
      cookie: creator.cookie,
      body: { username: `judge_${suffix}` },
    });
    const pub = await api("POST", "/api/characters", {
      cookie: creator.cookie,
      body: {
        name: `ตัวละครสายฮา${suffix}`,
        tagline: "คนเดียวที่หัวเราะกับมุกตัวเอง",
        description: "นักแสดงตลกออฟฟิศ ขี้เล่น ชอบมุกกันเอง",
        firstMessage: "วันนี้มีเรื่องขำ ๆ มาเล่าให้ฟัง",
        defaultModelKey: "openai/gpt-4o-mini",
        publish: true,
      },
    });
    expect(pub.status).toBe(201);
    characterId = pub.json.character.id;

    // 2 AI_TOPIC quests: เกณฑ์ "หัวเราะ" (ผ่าน) และ "เศร้า" (ไม่ผ่าน)
    // id ใส่เอง — @default(uuid()) ของ Prisma อยู่ฝั่ง client ไม่มี DEFAULT ในตาราง
    const laugh = await q<{ id: string }>(
      `insert into character_quests (id, character_id, goal_type, target, title, description, criteria_prompt, reward_intimacy, sort_order)
       values ($2, $1, 'AI_TOPIC', 1, 'ทำให้เขาหัวเราะ', 'เล่ามุกจนตัวละครขำ', 'ผู้ใช้เล่ามุก/เรื่องขำ ๆ จนตัวละครหัวเราะ', 15, 40)
       returning id`,
      [characterId, randomUUID()]
    );
    const sad = await q<{ id: string }>(
      `insert into character_quests (id, character_id, goal_type, target, title, description, criteria_prompt, reward_intimacy, sort_order)
       values ($2, $1, 'AI_TOPIC', 1, 'เล่าเรื่องเศร้า', 'เล่าเรื่องรื่นรมย์', 'ผู้ใช้เล่าเรื่องเศร้าซึมจนตัวละครเสียใจ', 15, 50)
       returning id`,
      [characterId, randomUUID()]
    );
    laughQuestId = laugh.rows[0].id;
    sadQuestId = sad.rows[0].id;

    const created = await api("POST", "/api/conversations", {
      cookie: fan.cookie,
      body: { characterId },
    });
    expect(created.status).toBe(201);
    conversationId = created.json.conversation.id;

    // บทสนทนา: ผู้ใช้เล่ามุก → ตัวละครขำ
    await q(
      `insert into messages (conversation_id, role, content) values
       ($1::uuid, 'USER', 'ฟังมุกนะ ทำไมปลาไม่ชอบเล่นเทนนิส?'),
       ($1::uuid, 'ASSISTANT', 'ทำไม?'),
       ($1::uuid, 'USER', 'เพราะกลัว net! 555'),
       ($1::uuid, 'ASSISTANT', 'โอ๊ย ขำจนตกเก้าอี้')`,
      [conversationId]
    );

    // verdict ตามเกณฑ์ใน prompt — "หัวเราะ" ผ่าน, อื่น ๆ ไม่ผ่าน
    mocks.resolveCheapestJobModel.mockResolvedValue("mock/cheapest");
    mocks.completeOnce.mockImplementation(async (req: { messages: { role: string; content: string }[] }) => {
      const judgePrompt = req.messages.find((m) => m.role === "user")?.content ?? "";
      return { text: JSON.stringify({ completed: judgePrompt.includes("หัวเราะ") }) };
    });
  }, 180_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const u of cleanupUsers) {
      await cleanupTestUser(u).catch(() => {});
    }
    await closeDb();
  });

  it("judge mark completed เฉพาะ quest ที่ผ่านเกณฑ์", async () => {
    await judgeAiTopicQuests(fan.id, characterId);

    expect(mocks.completeOnce).toHaveBeenCalledTimes(2);
    const rows = await q<{ quest_id: string; progress: number; completed_at: Date | null }>(
      `select quest_id, progress, completed_at from user_quest_progress where user_id = $1`,
      [fan.id]
    );
    const byId = new Map(rows.rows.map((r) => [r.quest_id, r]));

    expect(byId.get(laughQuestId)?.completed_at).toBeTruthy();
    expect(byId.get(sadQuestId)?.completed_at).toBeFalsy();
  });

  it("quest ที่ยังไม่ผ่าน ลอง judge ใหม่ได้ (idempotent กับ quest ที่จบแล้ว)", async () => {
    mocks.completeOnce.mockClear();
    await judgeAiTopicQuests(fan.id, characterId);
    // รอบสอง judge เฉพาะ quest ที่ยังไม่ completed
    expect(mocks.completeOnce).toHaveBeenCalledTimes(1);
  });
});
