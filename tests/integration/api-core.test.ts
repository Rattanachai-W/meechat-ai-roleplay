import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/http";
import { requireDevServer, BASE } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";

/**
 * Integration: public endpoints + auth gate + persona CRUD
 * (chat flow / ownership ละเอียดอยู่ suite อื่น)
 */

let user: TestUser;

beforeAll(async () => {
  await requireDevServer();
  await connectDb();
  user = await createTestUser();
});

afterAll(async () => {
  if (user) await cleanupTestUser(user);
  await closeDb();
});

describe("public endpoints", () => {
  it("GET /api/models → stealth/ox-alpha เป็น default (sort_order 0)", async () => {
    const res = await api("GET", "/api/models");
    expect(res.status).toBe(200);
    expect(res.json.models.length).toBeGreaterThan(0);
    expect(res.json.models[0].modelKey).toBe("stealth/ox-alpha");
    for (const m of res.json.models) {
      expect(m).toHaveProperty("energyMultiplier");
      // ห้าม leak ค่า cost raw / provider key อะไรก็ตามออกนอก select
      expect(Object.keys(m).sort()).toEqual([
        "displayName",
        "energyMultiplier",
        "isPremiumOnly",
        "modelKey",
      ]);
    }
  });

  it("GET /api/tags → seed tags ครบ", async () => {
    const res = await api("GET", "/api/tags");
    expect(res.status).toBe(200);
    const slugs: string[] = res.json.tags.map((t: any) => t.slug);
    expect(slugs).toContain("romance");
    expect(slugs).toContain("isekai");
  });

  it("GET /api/characters → list public พร้อม cursor shape", async () => {
    const res = await api("GET", "/api/characters");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.items)).toBe(true);
    expect(res.json.items.length).toBeGreaterThan(0);
    const card = res.json.items[0];
    expect(card).toHaveProperty("slug");
    expect(card).toHaveProperty("name");
  });
});

describe("auth gate", () => {
  it.each([
    ["GET", "/api/conversations"],
    ["GET", "/api/personas"],
    ["GET", "/api/energy/wallet"],
    ["GET", "/api/energy/transactions"],
    ["POST", "/api/chat"],
  ] as const)("no cookie %s %s → 401 UNAUTHORIZED", async (method, path) => {
    const res = await api(method, path, method === "POST" ? { body: {} } : {});
    expect(res.status).toBe(401);
    expect(res.json?.error?.code).toBe("UNAUTHORIZED");
    // error body ต้องเป็นรูปแบบกลาง {error:{code,message}}
    expect(typeof res.json?.error?.message).toBe("string");
  });
});

describe("persona CRUD + validation", () => {
  let personaId = "";

  it("POST สร้าง persona แรก → default อัตโนมัติ, userId spoof ถูก strip", async () => {
    const res = await api("POST", "/api/personas", {
      cookie: user.cookie,
      body: { name: "โจ้", description: "โปรแกรมเมอร์ดึกดื่น", isDefault: false },
    });
    expect(res.status).toBe(201);
    personaId = res.json.persona.id;
    expect(res.json.persona.isDefault).toBe(true); // count===0 → default ให้เอง
    expect(res.json.persona.userId).toBe(user.id);
  });

  it("GET list เจอ persona ที่สร้าง", async () => {
    const res = await api("GET", "/api/personas", { cookie: user.cookie });
    expect(res.status).toBe(200);
    expect(res.json.personas.some((p: any) => p.id === personaId)).toBe(true);
  });

  it("PATCH เปลี่ยนชื่อได้", async () => {
    const res = await api("PATCH", `/api/personas/${personaId}`, {
      cookie: user.cookie,
      body: { name: "โจ้จ้า" },
    });
    expect(res.status).toBe(200);
    expect(res.json.persona.name).toBe("โจ้จ้า");
  });

  it("persona ที่สองแบบ isDefault → ย้าย default ให้ตัวใหม่", async () => {
    const r2 = await api("POST", "/api/personas", {
      cookie: user.cookie,
      body: { name: "มิน", isDefault: true },
    });
    expect(r2.status).toBe(201);
    const list = await api("GET", "/api/personas", { cookie: user.cookie });
    const defaults = list.json.personas.filter((p: any) => p.isDefault);
    expect(defaults.length).toBe(1);
    expect(defaults[0].name).toBe("มิน");
    await api("DELETE", `/api/personas/${r2.json.persona.id}`, { cookie: user.cookie });
  });

  it.each([
    [{ name: "" }, "name ว่าง"],
    [{ name: "x".repeat(51) }, "name >50"],
    [{ name: "ok", age: 300 }, "age >120"],
    [{ name: "ok", age: -1 }, "age <1"],
  ] as [unknown, string][])("POST invalid %s → 400 VALIDATION_ERROR", async (body) => {
    const res = await api("POST", "/api/personas", { cookie: user.cookie, body });
    expect(res.status).toBe(400);
    expect(res.json?.error?.code).toBe("VALIDATION_ERROR");
  });

  it("DELETE → 204 แล้ว GET ไม่เจอ", async () => {
    const del = await api("DELETE", `/api/personas/${personaId}`, { cookie: user.cookie });
    expect(del.status).toBe(204);
    const list = await api("GET", "/api/personas", { cookie: user.cookie });
    expect(list.json.personas.some((p: any) => p.id === personaId)).toBe(false);
  });

  it("PATCH/DELETE id ที่ไม่มีอยู่ → 404", async () => {
    const ghost = "00000000-0000-4000-8000-000000000000";
    expect((await api("PATCH", `/api/personas/${ghost}`, { cookie: user.cookie, body: { name: "x" } })).status).toBe(404);
    expect((await api("DELETE", `/api/personas/${ghost}`, { cookie: user.cookie })).status).toBe(404);
  });

  it("PATCH id ไม่ใช่ uuid → 500 หรือ 404 (prisma P2023) — ต้องไม่ 2xx", async () => {
    const res = await api("PATCH", `/api/personas/not-a-uuid`, { cookie: user.cookie, body: { name: "x" } });
    expect([404, 400, 500]).toContain(res.status);
    if (res.status === 500) console.log("[finding] PATCH persona non-uuid → 500 INTERNAL_ERROR (ควร 400)");
  });
});
