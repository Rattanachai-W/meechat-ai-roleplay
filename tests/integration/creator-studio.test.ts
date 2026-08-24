import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { api } from "../helpers/http";
import { BASE, requireDevServer } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, topUpEnergy, type TestUser } from "../helpers/user";
import { calculateCreatorShare } from "@/lib/energy/pricing";
import { accrueCreatorEarning } from "@/lib/creators/service";

/**
 * Creator Studio (docs/creator-system.md §9)
 * - profile onboarding + uniqueness
 * - publish lifecycle: DRAFT → PUBLISHED (AUTO_APPROVE) / PENDING → admin decide
 * - visibility + IDOR guards
 * - purchase catalog + mock/stub mode (env-aware) + admin energy grant
 * - creator earning e2e: real HTTP chat → share-of-energy row (idempotent, self-chat excluded)
 */

const suffix = randomUUID().slice(0, 8);
function charPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: `นักสืบเงา${suffix}`,
    tagline: "นักสืบผู้เห็นแสงในความมืดของกรุงเทพ",
    description:
      "อดีตตำรวจนอกราชการที่เปิดสำนักงานนักสืบเล็ก ๆ ย่านเยาวราช ฉลาด เย็นชา แต่แฝงความห่วงใยผู้มาหา",
    firstMessage: "…เรื่องของคุณชั้นฟังแล้ว เล่าต่อได้เลยว่าเกิดอะไรขึ้นคืนนั้น",
    // โมเดล paid ราคาถูก — เลี่ยง daily cap ของโมเดล :free ที่ suite ทั้งวันใช้จน provider 429
    defaultModelKey: "openai/gpt-4o-mini",
    ...overrides,
  };
}

async function sendChat(
  cookie: string,
  conversationId: string,
  content: string
): Promise<{ status: number; text: string; errorBody: string }> {
  // OpenRouter 429 (RATE_LIMITED) เป็น throttle ชั่วคราวของ provider — รอแล้วลองใหม่
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ conversationId, content }),
    });
    const contentType = res.headers.get("content-type") ?? "";
    const out =
      contentType.includes("text/event-stream")
        ? { status: res.status, text: await res.text(), errorBody: "" }
        : { status: res.status, text: "", errorBody: await res.text() };
    const throttled =
      /"code":"RATE_LIMITED"/.test(out.text) || /"code":"RATE_LIMITED"/.test(out.errorBody);
    if (!throttled || attempt >= MAX_ATTEMPTS) return out;
    console.log(`[creator-test] provider 429 — รอ 30s ลองใหม่ (${attempt}/${MAX_ATTEMPTS})`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

/** ตัวละคร PUBLISHED ตัวแรกของ creator (เรียงตาม created_at) */
async function firstPublishedCharId(userId: string): Promise<string> {
  const rows = await q<{ id: string }>(
    `select c.id from characters c
     join creator_profiles cp on cp.id = c.creator_id
     where cp.user_id = $1 and c.status = 'PUBLISHED'
     order by c.created_at limit 1`,
    [userId]
  );
  expect(rows.rows.length).toBeGreaterThan(0);
  return rows.rows[0].id;
}

describe("creator studio", () => {
  let creator: TestUser; // user B — เจ้าของตัวละคร
  let fan: TestUser; // user A — คนทั่วไป
  let admin: TestUser;

  const cleanupUsers: TestUser[] = [];
  async function newTestUser(): Promise<TestUser> {
    const u = await createTestUser();
    cleanupUsers.push(u);
    return u;
  }

  beforeAll(async () => {
    await requireDevServer();
    await connectDb();
    // GoTrue admin API throttle การสร้างขนาน — สร้างทีละคน
    creator = await newTestUser();
    fan = await newTestUser();
    admin = await newTestUser();
    // promote แบบเดียวกับ production (docs/creator-system.md §6): update users set role='ADMIN'
    await q("update users set role='ADMIN' where id=$1", [admin.id]);
  }, 180_000);

  afterAll(async () => {
    // creator_earnings ไม่มี FK ไป users — ลบเองก่อน cascade อื่น
    for (const u of cleanupUsers) {
      await q("delete from creator_earnings where creator_user_id = $1", [u.id]).catch(() => {});
      await cleanupTestUser(u);
    }
    await closeDb();
  });

  describe("profile", () => {
    it("GET ครั้งแรก → profile null (ยังไม่สมัคร)", async () => {
      const res = await api("GET", "/api/creator/me", { cookie: creator.cookie });
      expect(res.status).toBe(200);
      expect(res.json.profile).toBeNull();
      expect(res.json.stats).toBeNull();
    });

    it("PATCH ไม่ใส่ username → 400", async () => {
      const res = await api("PATCH", "/api/creator/me", {
        cookie: creator.cookie,
        body: { bio: "สวัสดี" },
      });
      expect(res.status).toBe(400);
    });

    it("username ไม่ผ่าน regex (พิมพ์ใหญ่/เว้นวรรค/สั้นเกิน) → 400", async () => {
      for (const username of ["Bad Name", "ab", "x".repeat(21)]) {
        const res = await api("PATCH", "/api/creator/me", {
          cookie: creator.cookie,
          body: { username },
        });
        expect(res.status, `username=${username}`).toBe(400);
      }
    });

    it("สมัครด้วย username ได้ + GET กลับมาถูก + stats เริ่มศูนย์", async () => {
      const res = await api("PATCH", "/api/creator/me", {
        cookie: creator.cookie,
        body: { username: `creator_${suffix}`, bio: "นักเขียนบท roleplay" },
      });
      expect(res.status).toBe(200);
      expect(res.json.profile.username).toBe(`creator_${suffix}`);

      const again = await api("GET", "/api/creator/me", { cookie: creator.cookie });
      expect(again.json.profile.username).toBe(`creator_${suffix}`);
      expect(again.json.stats.characterCountByStatus.DRAFT).toBe(0);
      expect(again.json.stats.totalEarned).toBe(0);
    });

    it("username ซ้ำจาก user อื่น → 400 พร้อมข้อความไทย", async () => {
      const res = await api("PATCH", "/api/creator/me", {
        cookie: fan.cookie,
        body: { username: `creator_${suffix}` },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.message).toContain("ผู้ใช้แล้ว");
    });

    it("unauthenticated → 401", async () => {
      const res = await api("GET", "/api/creator/me");
      expect(res.status).toBe(401);
    });
  });

  describe("publish lifecycle", () => {
    let draftId = "";

    it("POST publish:false (default) → DRAFT", async () => {
      const res = await api("POST", "/api/characters", {
        cookie: creator.cookie,
        body: charPayload(),
      });
      expect(res.status).toBe(201);
      expect(res.json.character.status).toBe("DRAFT");
      draftId = res.json.character.id;
    });

    it("POST publish:true → PUBLISHED (AUTO_APPROVE default)", async () => {
      const res = await api("POST", "/api/characters", {
        cookie: creator.cookie,
        body: charPayload({ name: `นักสืบเงา${suffix}b`, publish: true }),
      });
      expect(res.status).toBe(201);
      expect(res.json.character.status).toBe("PUBLISHED");
      expect(res.json.character.publishedAt).toBeTruthy();
    });

    it("submit ตัวละคร DRAFT → PUBLISHED, submit ซ้ำ → 400", async () => {
      const ok = await api("POST", `/api/characters/${draftId}/submit`, { cookie: creator.cookie });
      expect(ok.status).toBe(200);
      expect(ok.json.character.status).toBe("PUBLISHED");

      const dup = await api("POST", `/api/characters/${draftId}/submit`, { cookie: creator.cookie });
      expect(dup.status).toBe(400);
    });

    it("creator me/characters list เห็นทุก status + filter + status ไม่ถูกต้อง 400", async () => {
      const all = await api("GET", "/api/creator/me/characters", { cookie: creator.cookie });
      expect(all.status).toBe(200);
      expect(all.json.characters.length).toBeGreaterThanOrEqual(2);

      const pubOnly = await api("GET", "/api/creator/me/characters?status=PUBLISHED", {
        cookie: creator.cookie,
      });
      expect(
        pubOnly.json.characters.every((c: { status: string }) => c.status === "PUBLISHED")
      ).toBe(true);

      const bad = await api("GET", "/api/creator/me/characters?status=HACKED", {
        cookie: creator.cookie,
      });
      expect(bad.status).toBe(400);
    });
  });

  describe("visibility + IDOR", () => {
    let draftChar: { id: string };

    beforeAll(async () => {
      const res = await api("POST", "/api/characters", {
        cookie: creator.cookie,
        body: charPayload({ name: `ลับและซ่อน${suffix}`, visibility: "PRIVATE" }),
      });
      draftChar = { id: res.json.character.id };
    });

    it("draft/private ของคนอื่นไม่อยู่ใน list/search/detail สาธารณะ", async () => {
      const list = await api("GET", "/api/characters", {});
      expect(list.json.items.some((c: { id: string }) => c.id === draftChar.id)).toBe(false);

      const search = await api(
        "GET",
        `/api/characters?q=${encodeURIComponent(`ลับและซ่อน${suffix}`)}`,
        {}
      );
      expect(search.json?.items?.some((c: { id: string }) => c.id === draftChar.id)).toBe(false);

      const detail = await api("GET", `/api/characters/${draftChar.id}`, { cookie: fan.cookie });
      expect(detail.status).toBe(404);
    });

    it("owner เห็น draft ของตัวเองใน detail", async () => {
      const detail = await api("GET", `/api/characters/${draftChar.id}`, { cookie: creator.cookie });
      expect(detail.status).toBe(200);
      expect(detail.json.character.id).toBe(draftChar.id);
    });

    it("IDOR: คนอื่น PATCH/submit/delete ตัวละครของเราไม่ได้", async () => {
      const patchRes = await api("PATCH", `/api/characters/${draftChar.id}`, {
        cookie: fan.cookie,
        body: { tagline: "แฮ็กแล้ว" },
      });
      expect(patchRes.status).toBe(403);

      const submitRes = await api("POST", `/api/characters/${draftChar.id}/submit`, {
        cookie: fan.cookie,
      });
      expect(submitRes.status).toBe(403);

      const delRes = await api("DELETE", `/api/characters/${draftChar.id}`, { cookie: fan.cookie });
      expect(delRes.status).toBe(403);
    });

    it("conversation: draft(PUBLIC) ของคนอื่น → 404, PRIVATE ของคนอื่น → 403", async () => {
      const pubDraft = await api("POST", "/api/characters", {
        cookie: creator.cookie,
        body: charPayload({ name: `ฉบับร่างสาธารณะ${suffix}`, visibility: "PUBLIC" }),
      });
      const res = await api("POST", "/api/conversations", {
        cookie: fan.cookie,
        body: { characterId: pubDraft.json.character.id },
      });
      expect(res.status).toBe(404);

      const res2 = await api("POST", "/api/conversations", {
        cookie: fan.cookie,
        body: { characterId: draftChar.id },
      });
      expect(res2.status).toBe(403);
    });

    it("decide route: non-admin → 403 / id ไม่ใช่ uuid → 404 / body ไม่ผ่าน zod → 400", async () => {
      const nonAdmin = await api("POST", `/api/admin/characters/${draftChar.id}/decide`, {
        cookie: fan.cookie,
        body: { approve: true },
      });
      expect(nonAdmin.status).toBe(403);

      const badId = await api("POST", "/api/admin/chars-not-uuid/decide", {
        cookie: admin.cookie,
        body: { approve: true },
      });
      expect(badId.status).toBe(404);

      const badBody = await api("POST", `/api/admin/characters/${draftChar.id}/decide`, {
        cookie: admin.cookie,
        body: { approve: "yes-please" },
      });
      expect(badBody.status).toBe(400);
    });

    it("admin decide: PENDING → reject(+note) / approve(+publishedAt)", async () => {
      // จำลอง flow มีทีมตรวจ: set เป็น PENDING ตรง DB (production เกิดเมื่อ CREATOR_AUTO_APPROVE=false)
      await q("update characters set status='PENDING' where id=$1", [draftChar.id]);

      const reject = await api("POST", `/api/admin/characters/${draftChar.id}/decide`, {
        cookie: admin.cookie,
        body: { approve: false, note: "คำโปรยไม่ตรงเนื้อหา" },
      });
      expect(reject.status).toBe(200);
      expect(reject.json.character.status).toBe("REJECTED");
      expect(reject.json.character.reviewNote).toContain("คำโปรย");

      // decide ซ้ำ (ไม่ใช่ PENDING แล้ว) → 400
      const again = await api("POST", `/api/admin/characters/${draftChar.id}/decide`, {
        cookie: admin.cookie,
        body: { approve: true },
      });
      expect(again.status).toBe(400);

      // owner resubmit หลังโดน reject ได้
      await q("update characters set status='DRAFT' where id=$1", [draftChar.id]);
      const resubmit = await api("POST", `/api/characters/${draftChar.id}/submit`, {
        cookie: creator.cookie,
      });
      expect(resubmit.status).toBe(200);
      expect(resubmit.json.character.status).toBe("PUBLISHED");

      // approve path
      const tmp = await api("POST", "/api/characters", {
        cookie: creator.cookie,
        body: charPayload({ name: `รอตรวจ${suffix}`, visibility: "PRIVATE" }),
      });
      await q("update characters set status='PENDING' where id=$1", [tmp.json.character.id]);
      const approve = await api("POST", `/api/admin/characters/${tmp.json.character.id}/decide`, {
        cookie: admin.cookie,
        body: { approve: true },
      });
      expect(approve.status).toBe(200);
      expect(approve.json.character.status).toBe("PUBLISHED");
      expect(approve.json.character.publishedAt).toBeTruthy();
    });
  });

  describe("purchase + admin grant", () => {
    // env-aware: .env ปัจจุบันเปิด mock payment (PAYMENTS_ENABLED=true, PAYMENTS_MODE=mock)
    const mockMode =
      process.env.PAYMENTS_ENABLED === "true" && process.env.PAYMENTS_MODE === "mock";

    it("GET catalog → 3 packages + paymentsEnabled ตาม env", async () => {
      const res = await api("GET", "/api/energy/purchase", { cookie: fan.cookie });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json.packages)).toBe(true);
      expect(res.json.packages.length).toBe(3);
      expect(res.json.paymentsEnabled).toBe(mockMode);
    });

    it(mockMode
      ? "POST โหมด mock → purchased=true เครดิตทันที"
      : "POST เมื่อ PAYMENTS_ENABLED ไม่ได้ตั้ง → 503 PAYMENTS_DISABLED", async () => {
      const res = await api("POST", "/api/energy/purchase", {
        cookie: fan.cookie,
        body: { packageId: "coins_500" },
      });
      if (!mockMode) {
        expect(res.status).toBe(503);
        expect(res.json.error.code).toBe("PAYMENTS_DISABLED");
        return;
      }
      expect(res.status).toBe(200);
      expect(res.json.purchased).toBe(true);
      expect(res.json.coins).toBe(500);
      expect(res.json.mode).toBe("mock");
    });

    it("packageId ไม่รู้จัก → 404", async () => {
      const res = await api("POST", "/api/energy/purchase", {
        cookie: fan.cookie,
        body: { packageId: "coins_free_money" },
      });
      expect(res.status).toBe(404);
    });

    it("admin grant: non-admin → 403; amount 0 → 400", async () => {
      const forbidden = await api("POST", "/api/admin/energy/grant", {
        cookie: fan.cookie,
        body: { email: fan.email, amount: 10 },
      });
      expect(forbidden.status).toBe(403);

      const badAmount = await api("POST", "/api/admin/energy/grant", {
        cookie: admin.cookie,
        body: { email: fan.email, amount: 0 },
      });
      expect(badAmount.status).toBe(400);
    });

    it("admin grant สำเร็จ: wallet เพิ่ม + ledger ADMIN_ADJUSTMENT", async () => {
      await topUpEnergy(fan.id, 10); // guarantee มี wallet row ก่อนวัด delta
      const before = await q<{ total: string }>(
        "select (free_balance+paid_balance)::text total from energy_wallets where user_id=$1",
        [fan.id]
      );
      const res = await api("POST", "/api/admin/energy/grant", {
        cookie: admin.cookie,
        body: { email: fan.email, amount: 123, note: "compensation-test" },
      });
      expect(res.status).toBe(200);
      expect(res.json.granted).toBe(true);

      const after = await q<{ total: string }>(
        "select (free_balance+paid_balance)::text total from energy_wallets where user_id=$1",
        [fan.id]
      );
      expect(Number(after.rows[0].total) - Number(before.rows[0].total)).toBe(123);

      const ledger = await q<{ count: string }>(
        `select count(*)::text from energy_transactions
         where user_id=$1 and type='ADMIN_ADJUSTMENT' and amount=123 and reference_type='admin_grant'`,
        [fan.id]
      );
      expect(Number(ledger.rows[0].count)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("creator earning (share-of-energy)", () => {

    it("service-level idempotency: key เดิมจ่ายครั้งเดียว", async () => {
      const key = `test-idem-${randomUUID()}`;
      await accrueCreatorEarning({ creatorUserId: creator.id, amount: 7, idempotencyKey: key });
      await accrueCreatorEarning({ creatorUserId: creator.id, amount: 7, idempotencyKey: key });

      const rows = await q<{ n: string }>(
        "select count(*)::text n from creator_earnings where idempotency_key=$1",
        [key]
      );
      expect(Number(rows.rows[0].n)).toBe(1);
    });

    it("e2e: fan แชทกับตัวละครของ creator → creator ได้ max(1,floor(charged×0.1))", async () => {
      await topUpEnergy(fan.id, 300);
      const characterId = await firstPublishedCharId(creator.id);

      const created = await api("POST", "/api/conversations", {
        cookie: fan.cookie,
        body: { characterId },
      });
      expect(created.status).toBe(201);

      const chat = await sendChat(fan.cookie, created.json.conversation.id, "ช่วยบอกหน่อยว่าคืนนั้นเห็นอะไร");
      expect(chat.status).toBe(200);
      expect(chat.text).toContain("event: done");
      expect(chat.text).not.toContain("event: error");

      const doneBlock = chat.text.split("\n\n").find((b) => b.startsWith("event: done"));
      const doneData = JSON.parse(/^data: (.+)$/m.exec(doneBlock!)![1]);
      const charged = doneData.energy.charged as number;
      expect(charged).toBeGreaterThan(0);

      const expected = calculateCreatorShare(charged);
      // poll สั้น ๆ กัน race กับการเขียน earning ฝั่ง server (แม้ await แล้ว)
      let chatShare: { amount: string; type: string; character_id: string | null } | undefined;
      for (let i = 0; i < 20 && !chatShare; i++) {
        const rows = await q<{ amount: string; type: string; character_id: string | null }>(
          `select amount::text, type::text, character_id from creator_earnings
           where creator_user_id=$1 order by created_at desc limit 5`,
          [creator.id]
        );
        chatShare = rows.rows.find((r) => r.type === "CHAT_SHARE" && r.character_id !== null);
        if (!chatShare) await new Promise((r) => setTimeout(r, 500));
      }
      expect(chatShare).toBeTruthy();
      expect(Number(chatShare!.amount)).toBe(expected);

      const profile = await q<{ total_earned: string }>(
        "select total_earned::text from creator_profiles where user_id=$1",
        [creator.id]
      );
      // idempotency-row (7) + chat share → total ต้องไม่ต่ำกว่า share
      expect(Number(profile.rows[0].total_earned)).toBeGreaterThanOrEqual(expected);
    }, 120_000);

    it("earnings ledger API ของ creator เห็นรายการ + pagination shape", async () => {
      const res = await api("GET", "/api/creator/me/earnings?limit=30", { cookie: creator.cookie });
      expect(res.status).toBe(200);
      expect(res.json.earnings.length).toBeGreaterThanOrEqual(2); // idem-row + chat share
      expect(res.json.earnings.every((e: { amount: number }) => e.amount > 0)).toBe(true);
      expect(typeof res.json.nextCursor === "string" || res.json.nextCursor === null).toBe(true);

      const badCursor = await api("GET", "/api/creator/me/earnings?cursor=garbage", {
        cookie: creator.cookie,
      });
      expect(badCursor.status).toBe(400);
    });

    it("self-chat: creator แชทกับตัวละครตัวเอง → ไม่เกิด CHAT_SHARE เพิ่ม", async () => {
      const beforeN = Number(
        (
          await q<{ n: string }>(
            `select count(*)::text n from creator_earnings
             where creator_user_id=$1 and type='CHAT_SHARE'`,
            [creator.id]
          )
        ).rows[0].n
      );

      await topUpEnergy(creator.id, 300);
      const characterId = await firstPublishedCharId(creator.id);

      const created = await api("POST", "/api/conversations", {
        cookie: creator.cookie,
        body: { characterId },
      });
      expect(created.status).toBe(201);

      const chat = await sendChat(creator.cookie, created.json.conversation.id, "ฉันขอลองคุยกับตัวเองดูหน่อย");
      expect(chat.status).toBe(200);
      expect(chat.text).toContain("event: done");

      const afterN = Number(
        (
          await q<{ n: string }>(
            `select count(*)::text n from creator_earnings
             where creator_user_id=$1 and type='CHAT_SHARE'`,
            [creator.id]
          )
        ).rows[0].n
      );
      expect(afterN).toBe(beforeN); // self-chat ไม่ได้ coin (กัน farm)
    }, 120_000);
  });
});
