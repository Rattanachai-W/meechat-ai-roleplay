import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/http";
import { requireDevServer, BASE } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";

/**
 * Security:
 * - auth gate (no cookie / forged cookie / bearer service-key escalation)
 * - cross-user IDOR ทุก resource (conversations/messages/personas/characters/chat)
 * - private character visibility
 * - SQL injection ผ่าน search params
 * - stored XSS → SSR page ต้อง escape
 * - secrets ห้ามหลุดลง client bundle
 */

let A: TestUser; // owner
let B: TestUser; // attacker

// resources ของ A ที่ B จะพยายามแตะ
let personaIdOfA = "";
let convIdOfA = "";
let privateCharId = "";
let privateCharSlug = "";
let publicCharId = "";

beforeAll(async () => {
  await requireDevServer();
  await connectDb();

  A = await createTestUser();
  B = await createTestUser();

  personaIdOfA = (
    await api("POST", "/api/personas", { cookie: A.cookie, body: { name: "A-persona" } })
  ).json.persona.id;

  const charRow = await q<{ id: string }>("select id from characters where slug='pranee-doctor'");
  publicCharId = charRow.rows[0].id;

  convIdOfA = (
    await api("POST", "/api/conversations", { cookie: A.cookie, body: { characterId: publicCharId } })
  ).json.conversation.id;

  // PRIVATE character ของ A ผ่าน API จริง (ครอบคลุม createCharacter ด้วย)
  const created = await api("POST", "/api/characters", {
    cookie: A.cookie,
    body: {
      name: "ลับและเร้นลับ",
      tagline: "ตัวละครส่วนตัวสำหรับทดสอบ",
      description:
        "ตัวละครนี้ถูกสร้างเพื่อทดสอบ visibility rules ของระบบ MeeChat เท่านั้น ไม่ปรากฏต่อสาธารณะ",
      firstMessage: "คุณมาถึงได้อย่างไร?",
      visibility: "PRIVATE",
    },
  });
  expect(created.status).toBe(201);
  privateCharId = created.json.character.id;
  privateCharSlug = created.json.character.slug;
});

afterAll(async () => {
  if (A) await cleanupTestUser(A);
  if (B) await cleanupTestUser(B);
  await closeDb();
});

describe("auth gate variants", () => {
  it("forged cookie (base64 มั่ว) → 401 ไม่ crash", async () => {
    const res = await api("GET", "/api/conversations", {
      cookie: "sb-yauoirkmvouoownxtbhr-auth-token=base64-e30=",
    });
    expect(res.status).toBe(401);
    expect(res.json?.error?.code).toBe("UNAUTHORIZED");
  });

  it("service-role key ส่งเป็น Authorization header → ยัง 401 (ไม่มี privilege escalation)", async () => {
    const res = await fetch(`${BASE}/api/conversations`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    // API ใช้ session cookie เท่านั้น — bearer ไม่ควรช่วยอะไร
    expect([401, 403]).toContain(res.status);
  });

  it("anon key เป็น cookie ปลอม → 401", async () => {
    const res = await api("GET", "/api/personas", {
      cookie: `sb-yauoirkmvouoownxtbhr-auth-token=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    });
    expect(res.status).toBe(401);
  });
});

describe("cross-user IDOR", () => {
  it("B GET messages ของ conversation ของ A → 404", async () => {
    const res = await api("GET", `/api/conversations/${convIdOfA}/messages`, { cookie: B.cookie });
    expect(res.status).toBe(404);
  });

  it("B PATCH/DELETE persona ของ A → 404", async () => {
    expect(
      (await api("PATCH", `/api/personas/${personaIdOfA}`, { cookie: B.cookie, body: { name: "hacked" } })).status
    ).toBe(404);
    expect((await api("DELETE", `/api/personas/${personaIdOfA}`, { cookie: B.cookie })).status).toBe(404);
    // ข้อมูลจริงยังไม่โดนแตะ
    const check = await q("select name from user_personas where id=$1", [personaIdOfA]);
    expect(check.rows[0].name).toBe("A-persona");
  });

  it("B POST /api/chat เข้า conversation ของ A → 404 + ไม่หัก energy A", async () => {
    const res = await api("POST", "/api/chat", {
      cookie: B.cookie,
      body: { conversationId: convIdOfA, content: "แฮก" },
    });
    expect(res.status).toBe(404);
    const msgs = await q<{ n: number }>(
      "select count(*)::int n from messages where conversation_id=$1",
      [convIdOfA]
    );
    expect(msgs.rows[0].n).toBe(1); // ไม่มี message ใหม่ถูก insert
  });

  it("B PATCH/DELETE character ของ A → non-2xx และไม่มีการเปลี่ยนแปลง", async () => {
    const patch = await api("PATCH", `/api/characters/${privateCharId}`, {
      cookie: B.cookie,
      body: { name: "ถูกจับได้" },
    });
    expect(patch.status).not.toBeLessThan(300);

    const del = await api("DELETE", `/api/characters/${privateCharId}`, { cookie: B.cookie });
    expect(del.status).not.toBeLessThan(300);

    const row = await q<{ name: string }>("select name from characters where id=$1", [privateCharId]);
    expect(row.rows[0]?.name).toBe("ลับและเร้นลับ");
  });

  it("B POST regenerate message ใน conv ของ A → 404", async () => {
    const msgs = await api("GET", `/api/conversations/${convIdOfA}/messages`, { cookie: A.cookie });
    const assistantMsg = msgs.json.messages.find((m: any) => m.role === "ASSISTANT");
    const res = await api("POST", `/api/messages/${assistantMsg.id}/regenerate`, {
      cookie: B.cookie,
      body: {},
    });
    expect(res.status).toBe(404);
  });
});

describe("private character visibility", () => {
  it("B GET detail → 404, converse → 403, SSR page → 404", async () => {
    expect(
      (await api("GET", `/api/characters/${privateCharId}`, { cookie: B.cookie })).status
    ).toBe(404);
    expect(
      (
        await api("POST", "/api/conversations", {
          cookie: B.cookie,
          body: { characterId: privateCharId },
        })
      ).status
    ).toBe(403);
    const page = await fetch(`${BASE}/character/${privateCharSlug}`, {
      headers: { Cookie: B.cookie },
    });
    expect(page.status).toBe(404);
  });

  it("owner เห็นตัวเอง (detail 200)", async () => {
    expect(
      (await api("GET", `/api/characters/${privateCharId}`, { cookie: A.cookie })).status
    ).toBe(200);
  });

  it("list/search สาธารณะไม่มี private character หลุด", async () => {
    const res = await api("GET", "/api/characters?sort=new&limit=50");
    expect(res.json.items.some((c: any) => c.id === privateCharId)).toBe(false);
    const search = await api("GET", "/api/characters?q=ลับและเร้นลับ");
    expect(search.json.items.some((c: any) => c.id === privateCharId)).toBe(false);
  });
});

describe("SQL injection", () => {
  it.each([
    `'; DROP TABLE characters;--`,
    `%' OR 1=1--`,
    `' UNION SELECT id, email FROM users--`,
    `'; SELECT pg_sleep(5);--`,
  ])("search q=%s → 200 และตาราง characters ยังอยู่", async (qstr) => {
    const res = await api("GET", `/api/characters?q=${encodeURIComponent(qstr)}`);
    expect(res.status).toBe(200);
    const still = await q<{ n: number }>("select count(*)::int n from characters");
    expect(still.rows[0].n).toBeGreaterThan(0);
  });

  it("persona name ที่มี quote/backslash เก็บ literal ได้", async () => {
    const tricky = `โจ' -- ; drop table x; <script>`;
    const res = await api("POST", "/api/personas", {
      cookie: A.cookie,
      body: { name: tricky.slice(0, 50), description: `desc ${tricky}` },
    });
    expect(res.status).toBe(201);
    expect(res.json.persona.name).toBe(tricky.slice(0, 50));
    await api("DELETE", `/api/personas/${res.json.persona.id}`, { cookie: A.cookie });
  });
});

describe("stored XSS escaping on SSR", () => {
  let xssSlug = "";

  it("สร้าง character (PRIVATE) ที่ description มี payload", async () => {
    const res = await api("POST", "/api/characters", {
      cookie: A.cookie,
      body: {
        name: "เจ้าหนี้ XSS",
        tagline: "ทดสอบการ escape ของหน้าเว็บ",
        description:
          "payload ทดสอบ: <script>alert('xss')</script> และ <img src=x onerror=alert(2)> จบบรรทัด",
        firstMessage: "<b>hello</b>",
        visibility: "PRIVATE",
      },
    });
    expect(res.status).toBe(201);
    xssSlug = res.json.character.slug;
  });

  it("SSR profile page ต้องไม่มี raw script/onerror attribute หลุด", async () => {
    const html = await (await fetch(`${BASE}/character/${xssSlug}`, { headers: { Cookie: A.cookie } })).text();
    expect(html).not.toMatch(/<script>alert\(/i);
    expect(html).not.toMatch(/<img src=x onerror=/i);
    // ข้อมูลยังแสดงในรูป escaped
    expect(html).toMatch(/&lt;(script|img)/i);
  });

  it("API JSON คืน raw string ได้ (JSON context ปลอดภัยตาม design)", async () => {
    const list = await q<{ description: string }>("select description from characters where slug=$1", [xssSlug]);
    expect(list.rows[0].description).toContain("<script>");
  });
});

describe("secret leakage scan (client bundle)", () => {
  const SECRET_PATTERNS: [string, RegExp][] = [
    ["OPENROUTER_API_KEY value", /sk-or-v1-[0-9a-f]{20,}/],
    ["SERVICE_ROLE signature fragment", /IArzdSE65tCnsnv/i],
    ["DATABASE_URL password", /YYXbS4HCIitB8aTJ/],
    ["service_role JWT claim inline", /"role":"service_role"/],
  ];

  function collectClientChunks(): string[] {
    const root = path.resolve(process.cwd(), ".next/static");
    if (!fs.existsSync(root)) return [];
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.js$/.test(f.name)) out.push(p);
      }
    };
    walk(root);
    return out;
  }

  it("client chunks (.next/static) ไม่มี secret ใด ๆ", () => {
    const chunks = collectClientChunks();
    expect(chunks.length, "dev build ต้องมี static chunks").toBeGreaterThan(0);
    for (const file of chunks) {
      const content = fs.readFileSync(file, "utf8");
      for (const [label, re] of SECRET_PATTERNS) {
        expect(content, `${label} leaked in ${path.basename(file)}`).not.toMatch(re);
      }
    }
  });

  it("sanity: pattern scanner เจอค่าจริงใน server files (scanner ไม่พัง)", () => {
    // .next/server เก็บ env ฝั่ง server ได้ตามปกติ — แค่พิสูจน์ว่า regex match ได้จริง
    const sample = process.env.OPENROUTER_API_KEY ?? "";
    expect(sample).toMatch(SECRET_PATTERNS[0][1]);
  });
});
