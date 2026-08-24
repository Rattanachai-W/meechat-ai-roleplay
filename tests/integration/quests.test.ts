import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { api } from "../helpers/http";
import { requireDevServer } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";
import {
  bumpChatQuestProgress,
  getQuestsWithProgress,
} from "@/lib/quests/service";

/**
 * Character quests (docs/api-routes.md — Quests)
 * - GET quests: auto-create default ครั้งแรก (idempotent), 401/404/visibility + affinity summary
 * - progress bump ผ่าน service เดียวกับที่ pipeline เรียกหลังแชทสำเร็จ
 *   (MESSAGES +1 ต่อข้อความ / STREAK_DAYS นับเฉพาะวันละครั้ง)
 * - claim idempotent: mark claimedAt + เติมค่าความสนิทใน transaction เดียว
 *   HTTP 200 ครั้งแรก → 400 ครั้งถัดไป; ไม่แจกเหรียญ (กันเงินเฟ้อ)
 */

const suffix = randomUUID().slice(0, 8);

function charPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: `นักผจญภัยใจป่วง${suffix}`,
    tagline: "ไกด์นำเที่ยวสายแอดเวนเจอร์",
    description: "พาเที่ยวป่าลึกลับ มีความรู้เรื่องสิ่งมีชีวิตลึกลับ พูดตรง ๆ แต่ใจดี",
    firstMessage: "พร้อมออกเดินทางกันหรือยัง",
    defaultModelKey: "openai/gpt-4o-mini",
    ...overrides,
  };
}

describe("character quests", () => {
  let creator: TestUser;
  let fan: TestUser;
  let characterId = "";
  let draftCharId = "";

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
      body: { username: `quest_${suffix}`, bio: "นักเขียนภารกิจ" },
    });
    const pub = await api("POST", "/api/characters", {
      cookie: creator.cookie,
      body: charPayload({ publish: true }),
    });
    expect(pub.status).toBe(201);
    characterId = pub.json.character.id;

    // draft ไว้ทดสอบ visibility (คนอื่นไม่ควรเห็นภารกิจ)
    const draft = await api("POST", "/api/characters", {
      cookie: creator.cookie,
      body: charPayload({ name: `ฉบับร่าง${suffix}` }),
    });
    expect(draft.status).toBe(201);
    draftCharId = draft.json.character.id;
  }, 180_000);

  afterAll(async () => {
    for (const u of cleanupUsers) {
      await cleanupTestUser(u).catch(() => {});
    }
    await closeDb();
  });

  describe("GET /api/characters/[id]/quests", () => {
    it("unauthenticated → 401", async () => {
      expect((await api("GET", `/api/characters/${characterId}/quests`)).status).toBe(401);
    });

    it("id ไม่ใช่ uuid / uuid ไม่มีจริง → 404", async () => {
      expect((await api("GET", "/api/characters/not-a-uuid/quests", { cookie: fan.cookie })).status).toBe(404);
      expect(
        (await api("GET", `/api/characters/${randomUUID()}/quests`, { cookie: fan.cookie })).status
      ).toBe(404);
    });

    it("ตัวละคร DRAFT ของคนอื่น → 404 (visibility)", async () => {
      const res = await api("GET", `/api/characters/${draftCharId}/quests`, { cookie: fan.cookie });
      expect(res.status).toBe(404);
    });

    it("GET ครั้งแรก → auto-create 5 default quests + progress ศูนย์ + affinity Lv.1", async () => {
      const res = await api("GET", `/api/characters/${characterId}/quests`, { cookie: fan.cookie });
      expect(res.status).toBe(200);
      const quests = res.json.quests as Array<{
        goalType: string;
        target: number;
        rewardIntimacy: number;
        progress: number;
        completed: boolean;
        claimed: boolean;
        title: string;
        criteriaPrompt: string | null;
      }>;
      expect(quests.length).toBe(5);
      expect(quests.map((x) => [x.goalType, x.target, x.rewardIntimacy])).toEqual([
        ["MESSAGES", 10, 8],
        ["MESSAGES", 50, 15],
        ["STREAK_DAYS", 3, 12],
        ["AI_TOPIC", 1, 10],
        ["AI_TOPIC", 1, 20],
      ]);
      // ภารกิจสายสนทนาต้องมีเกณฑ์ให้ AI ตัดสินเสมอ
      expect(quests.filter((x) => x.goalType === "AI_TOPIC").every((x) => x.criteriaPrompt)).toBe(true);
      expect(quests.every((x) => x.progress === 0 && !x.completed && !x.claimed)).toBe(true);
      // summary ความสนิทมาพร้อม response (ยังไม่เคย claim → Lv.1 ศูนย์แต้ม)
      expect(res.json.affinity).toEqual({ points: 0, level: 1, label: "คนแปลกหน้า", nextLevelAt: 30 });
    });

    it("GET ซ้ำ → ยัง 5 ตัว (createMany idempotent)", async () => {
      for (let i = 0; i < 2; i++) {
        await api("GET", `/api/characters/${characterId}/quests`, { cookie: fan.cookie });
      }
      const res = await api("GET", `/api/characters/${characterId}/quests`, { cookie: fan.cookie });
      expect(res.json.quests.length).toBe(5);
    });
  });

  describe("progress bump (service — pipeline เรียกหลังแชทสำเร็จ)", () => {
    it("bump ×2 → MESSAGES=2, STREAK_DAYS=1 (วันเดียวนับครั้งเดียว)", async () => {
      await bumpChatQuestProgress(fan.id, characterId);
      await bumpChatQuestProgress(fan.id, characterId);

      const quests = await getQuestsWithProgress(fan.id, characterId);
      const messages10 = quests.find((x) => x.target === 10)!;
      const streak = quests.find((x) => x.goalType === "STREAK_DAYS")!;
      expect(messages10.progress).toBe(2);
      expect(streak.progress).toBe(1); // bump สองรอบวันเดียวกัน → นับวันเดียว
    });

    it("backdate last_bump_on เป็นเมื่อวาน → bump อีกรอบนับวันใหม่", async () => {
      await q(
        `update user_quest_progress p set last_bump_on = now() - interval '25 hours'
         from character_quests cq
         where cq.id = p.quest_id and p.user_id = $1 and cq.goal_type = 'STREAK_DAYS' and cq.character_id = $2`,
        [fan.id, characterId]
      );
      await bumpChatQuestProgress(fan.id, characterId);

      const quests = await getQuestsWithProgress(fan.id, characterId);
      const streak = quests.find((x) => x.goalType === "STREAK_DAYS")!;
      expect(streak.progress).toBe(2);
    });

    it("bump จนครบ 10 ข้อความ → completed=true (quest อื่นยังไม่จบ)", async () => {
      for (let i = 0; i < 8; i++) {
        await bumpChatQuestProgress(fan.id, characterId);
      }
      const quests = await getQuestsWithProgress(fan.id, characterId);
      const messages10 = quests.find((x) => x.target === 10)!;
      // สะสมจาก describe ก่อนหน้า: 2 (bump ×2) + 1 (รอบ backdate) + 8 = 11
      expect(messages10.progress).toBe(11);
      expect(messages10.completed).toBe(true);
      expect(messages10.claimed).toBe(false);
      expect(quests.find((x) => x.target === 50)!.completed).toBe(false);
    });
  });

  describe("claim reward (ค่าความสนิท)", () => {
    it("claim quest ที่ยังไม่สำเร็จ (streak) → 400", async () => {
      const quests = await getQuestsWithProgress(fan.id, characterId);
      const streak = quests.find((x) => x.goalType === "STREAK_DAYS")!;
      const res = await api("POST", `/api/quests/${streak.id}/claim`, { cookie: fan.cookie });
      expect(res.status).toBe(400);
      expect(res.json.error.message).toContain("ยังทำภารกิจไม่สำเร็จ");
    });

    it("claim quest ที่สำเร็จ → ความสนิท +8 (ไม่แจกเหรียญ — wallet ต้องนิ่ง)", async () => {
      const before = await q<{ points: number }>(
        `select points from character_affinities where user_id = $1 and character_id = $2`,
        [fan.id, characterId]
      );
      const pointsBefore = before.rows[0]?.points ?? 0;

      const wallet = await api("GET", "/api/energy/wallet", { cookie: fan.cookie });
      const balanceBefore = wallet.json.wallet.totalBalance as number;

      const quests = await getQuestsWithProgress(fan.id, characterId);
      const messages10 = quests.find((x) => x.target === 10)!;
      const res = await api("POST", `/api/quests/${messages10.id}/claim`, { cookie: fan.cookie });
      expect(res.status).toBe(200);
      expect(res.json.claimed).toBe(true);
      expect(res.json.amount).toBe(8);
      expect(res.json.affinity.points).toBe(pointsBefore + 8);
      expect(res.json.affinity.level).toBeGreaterThanOrEqual(1);

      // เหรียญไม่ถูกแตะ + ไม่มี ledger QUEST_REWARD ใหม่
      const after = await api("GET", "/api/energy/wallet", { cookie: fan.cookie });
      expect(after.json.wallet.totalBalance).toBe(balanceBefore);
      const ledger = await q<{ n: string }>(
        `select count(*)::text as n from energy_transactions where reference_type = 'quest' and user_id = $1`,
        [fan.id]
      );
      expect(Number(ledger.rows[0].n)).toBe(0);
    });

    it("claim ซ้ำ → 400 รับไปแล้ว + คะแนนไม่เพิ่มอีก", async () => {
      const quests = await getQuestsWithProgress(fan.id, characterId);
      const messages10 = quests.find((x) => x.target === 10)!;
      const pointsBefore = (
        await q<{ points: number }>(
          `select points from character_affinities where user_id = $1 and character_id = $2`,
          [fan.id, characterId]
        )
      ).rows[0].points;

      const res = await api("POST", `/api/quests/${messages10.id}/claim`, { cookie: fan.cookie });
      expect(res.status).toBe(400);
      expect(res.json.error.message).toContain("รับรางวัล");

      const after = await q<{ points: number }>(
        `select points from character_affinities where user_id = $1 and character_id = $2`,
        [fan.id, characterId]
      );
      expect(after.rows[0].points).toBe(pointsBefore);
    });

    it("claim ภารกิจที่สอง (50 ข้อความยังไม่จบ) → 400", async () => {
      const other = await newTestUser();
      const quests = await getQuestsWithProgress(fan.id, characterId);
      const messages50 = quests.find((x) => x.target === 50)!;
      // other ยังไม่มี progress → ห้าม claim แทน fan ได้
      const res = await api("POST", `/api/quests/${messages50.id}/claim`, { cookie: other.cookie });
      expect(res.status).toBe(400);
    });

    it("claim quest uuid ไม่มีจริง → 404", async () => {
      const res = await api("POST", `/api/quests/${randomUUID()}/claim`, { cookie: fan.cookie });
      expect(res.status).toBe(404);
    });
  });
});
