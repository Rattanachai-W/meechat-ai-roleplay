import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { api } from "../helpers/http";
import { requireDevServer } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";

/**
 * Creator quest CRUD (ค่าความสนิท) — ครีเอเตอร์จัดการภารกิจของตัวละครตัวเอง
 * - POST/PATCH/DELETE /api/characters/[id]/quests (+ [questId])
 * - ownership: non-owner → 404 (IDOR-safe), unauth → 401
 * - validation: AI_TOPIC require criteriaPrompt · cap 10 quests/character
 */

const suffix = randomUUID().slice(0, 8);

function charPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: `นักปรุงยาเมืองลับ${suffix}`,
    tagline: "เภสัชกรหญิงร้านยากลางคืน",
    description: "เจ้าของร้านยาโบราณที่ปรุงยาตามสูตรลับของตระกูล ใจดีแต่ปากแข็ง ช่างสังเกตผู้คน",
    firstMessage: "มาหาฉันเรื่องยา หรือเรื่องอื่น",
    defaultModelKey: "openai/gpt-4o-mini",
    ...overrides,
  };
}

describe("creator quest CRUD", () => {
  let creator: TestUser;
  let stranger: TestUser;
  let characterId = "";

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
    stranger = await newTestUser();
    await api("PATCH", "/api/creator/me", {
      cookie: creator.cookie,
      body: { username: `qmgr_${suffix}`, bio: "ครีเอเตอร์ภารกิจ" },
    });
    const pub = await api("POST", "/api/characters", {
      cookie: creator.cookie,
      body: charPayload({ publish: true }),
    });
    expect(pub.status).toBe(201);
    characterId = pub.json.character.id;
  }, 180_000);

  afterAll(async () => {
    for (const u of cleanupUsers) {
      await cleanupTestUser(u).catch(() => {});
    }
    await closeDb();
  });

  it("unauth POST → 401", async () => {
    expect(
      (
        await api("POST", `/api/characters/${characterId}/quests`, {
          body: { goalType: "MESSAGES", title: "x".repeat(5), description: "y".repeat(10) },
        })
      ).status
    ).toBe(401);
  });

  it("non-owner POST/PATCH/DELETE → 404 (IDOR-safe)", async () => {
    // creator GET ก่อนเพื่อให้ default quests ถูก auto-create แล้วจึงมี questId จริง
    const list = await api("GET", `/api/characters/${characterId}/quests`, { cookie: creator.cookie });
    const someQuestId = list.json.quests[0].id as string;

    const created = await api("POST", `/api/characters/${characterId}/quests`, {
      cookie: stranger.cookie,
      body: { goalType: "MESSAGES", title: "ภารกิจแอบสร้าง", description: "คนไม่ใช่เจ้าของพยายามสร้าง" },
    });
    expect(created.status).toBe(404);

    const patched = await api("PATCH", `/api/characters/${characterId}/quests/${someQuestId}`, {
      cookie: stranger.cookie,
      body: { rewardIntimacy: 50 },
    });
    expect(patched.status).toBe(404);

    const deleted = await api("DELETE", `/api/characters/${characterId}/quests/${someQuestId}`, {
      cookie: stranger.cookie,
    });
    expect(deleted.status).toBe(404);
  });

  it("AI_TOPIC ไม่มี criteriaPrompt → 400", async () => {
    const res = await api("POST", `/api/characters/${characterId}/quests`, {
      cookie: creator.cookie,
      body: { goalType: "AI_TOPIC", title: "ภารกิจไร้เกณฑ์", description: "ไม่บอกว่า AI ต้องตัดสินอะไร" },
    });
    expect(res.status).toBe(400);
  });

  it("POST MESSAGES + POST AI_TOPIC → 201 และโผล่ใน GET เรียงต่อท้าย defaults", async () => {
    const m = await api("POST", `/api/characters/${characterId}/quests`, {
      cookie: creator.cookie,
      body: {
        goalType: "MESSAGES",
        title: "ลูกค้าประจำร้าน",
        description: "แชทให้ครบ 20 ข้อความ",
        target: 20,
        rewardIntimacy: 9,
      },
    });
    expect(m.status).toBe(201);
    expect(m.json.quest.rewardIntimacy).toBe(9);

    const a = await api("POST", `/api/characters/${characterId}/quests`, {
      cookie: creator.cookie,
      body: {
        goalType: "AI_TOPIC",
        title: "ได้สูตรยาลับมา",
        description: "ทำให้ตัวละครยอมเผยสูตรยาลับของร้าน",
        criteriaPrompt: "ตัวละครบอกเล่าสูตรยาหรือความลับปรุงยาของร้านกับผู้ใช้อย่างจริงใจ",
        rewardIntimacy: 25,
      },
    });
    expect(a.status).toBe(201);
    expect(a.json.quest.criteriaPrompt).toContain("สูตรยา");

    const list = await api("GET", `/api/characters/${characterId}/quests`, { cookie: creator.cookie });
    const titles = (list.json.quests as Array<{ title: string }>).map((x) => x.title);
    expect(titles).toContain("ลูกค้าประจำร้าน");
    expect(titles).toContain("ได้สูตรยาลับมา");
    expect(list.json.quests.length).toBe(7); // 5 default + 2 custom
  });

  it("PATCH แก้ title + rewardIntimacy → GET สะท้อน", async () => {
    const list = await api("GET", `/api/characters/${characterId}/quests`, { cookie: creator.cookie });
    const target = (list.json.quests as Array<{ id: string; title: string }>).find(
      (x) => x.title === "ลูกค้าประจำร้าน"
    )!;

    const patched = await api("PATCH", `/api/characters/${characterId}/quests/${target.id}`, {
      cookie: creator.cookie,
      body: { title: "ลูกค้าประจำ (แก้แล้ว)", rewardIntimacy: 11 },
    });
    expect(patched.status).toBe(200);
    expect(patched.json.quest.rewardIntimacy).toBe(11);

    const after = await api("GET", `/api/characters/${characterId}/quests`, { cookie: creator.cookie });
    const updated = (after.json.quests as Array<{ id: string; title: string; rewardIntimacy: number }>).find(
      (x) => x.id === target.id
    )!;
    expect(updated.title).toBe("ลูกค้าประจำ (แก้แล้ว)");
    expect(updated.rewardIntimacy).toBe(11);
  });

  it("PATCH เปลี่ยนเป็น AI_TOPIC โดยไม่ส่ง criteriaPrompt → 400", async () => {
    const list = await api("GET", `/api/characters/${characterId}/quests`, { cookie: creator.cookie });
    const target = (list.json.quests as Array<{ id: string; title: string }>).find(
      (x) => x.title === "ลูกค้าประจำ (แก้แล้ว)"
    )!;
    const res = await api("PATCH", `/api/characters/${characterId}/quests/${target.id}`, {
      cookie: creator.cookie,
      body: { goalType: "AI_TOPIC" },
    });
    expect(res.status).toBe(400);
  });

  it("DELETE → หายจาก GET (progress cascade)", async () => {
    const list = await api("GET", `/api/characters/${characterId}/quests`, { cookie: creator.cookie });
    const before = (list.json.quests as Array<{ id: string; title: string }>).length;
    const target = (list.json.quests as Array<{ id: string; title: string }>).find(
      (x) => x.title === "ลูกค้าประจำ (แก้แล้ว)"
    )!;

    // ให้มี progress ก่อนลบ — ต้องถูก cascade ทิ้งด้วย (FK ON DELETE CASCADE)
    await q(
      `insert into user_quest_progress (id, user_id, quest_id, progress, completed_at) values ($1,$2,$3,5,now())`,
      [randomUUID(), creator.id, target.id]
    );
    const deleted = await api("DELETE", `/api/characters/${characterId}/quests/${target.id}`, {
      cookie: creator.cookie,
    });
    expect(deleted.status).toBe(204);

    const orphan = await q<{ n: string }>(
      `select count(*)::text as n from user_quest_progress where quest_id = $1`,
      [target.id]
    );
    expect(Number(orphan.rows[0].n)).toBe(0);

    const after = await api("GET", `/api/characters/${characterId}/quests`, { cookie: creator.cookie });
    expect((after.json.quests as unknown[]).length).toBe(before - 1);
  });

  it("cap 10 quests → POST ที่เกิน → 400", async () => {
    const list = await api("GET", `/api/characters/${characterId}/quests`, { cookie: creator.cookie });
    let count = (list.json.quests as unknown[]).length;
    // เติมจนถึง 10 (ตอนนี้ 6)
    while (count < 10) {
      const r = await api("POST", `/api/characters/${characterId}/quests`, {
        cookie: creator.cookie,
        body: {
          goalType: "MESSAGES",
          title: `ภารกิจเติม ${count}`,
          description: "ภารกิจชั่วคราวเพื่อทดสอบขีดจำกัด",
          target: 5,
        },
      });
      expect(r.status).toBe(201);
      count++;
    }
    const over = await api("POST", `/api/characters/${characterId}/quests`, {
      cookie: creator.cookie,
      body: {
        goalType: "MESSAGES",
        title: "เกินโควตา",
        description: "ภารกิจที่ 11 ต้องไม่ผ่าน",
        target: 5,
      },
    });
    expect(over.status).toBe(400);
    expect(over.json.error.message).toContain("10");
  });
});
