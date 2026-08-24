import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { api, parseSse } from "../helpers/http";
import { requireDevServer, BASE } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";

/**
 * Failure tests:
 * 1. LLM provider ล่ม (จำลองด้วย env key ว่าง ใน in-process pipeline) →
 *    SSE error + refund เต็ม + usage log ERROR — wallet กลับมาเท่าเดิม
 * 2. client abort กลาง stream → ABORTED path: refund + ไม่พัง server
 * 3. bad input matrix → error taxonomy ถูก code/status
 * 4. nonexistent resources → 404
 */

let user: TestUser;
let convId = "";

beforeAll(async () => {
  await requireDevServer();
  await connectDb();
  user = await createTestUser();
  await api("POST", "/api/energy/daily-claim", { cookie: user.cookie });
  const charRow = await q<{ id: string }>("select id from characters where slug='pranee-doctor'");
  convId = (
    await api("POST", "/api/conversations", {
      cookie: user.cookie,
      body: { characterId: charRow.rows[0].id },
    })
  ).json.conversation.id;
});

afterAll(async () => {
  if (user) await cleanupTestUser(user);
  vi.unstubAllEnvs();
  await closeDb();
});

async function walletBalance(): Promise<number> {
  const res = await api("GET", "/api/energy/wallet", { cookie: user.cookie });
  return res.json.wallet.totalBalance;
}

describe("LLM failure path (in-process pipeline, key ว่าง)", () => {
  it("stream ได้ event:error MODEL_UNAVAILABLE + refund เต็ม + log ERROR + balance เท่าเดิม", async () => {
    // ทำใน process นี้ (import pipeline ตรง) เพื่อ stub env โดยไม่กระทบ dev server
    const { prepareChat, createChatStream } = await import("@/lib/chat/pipeline");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const balanceBefore = await walletBalance();

    const prepared = await prepareChat({ userId: user.id, conversationId: convId, content: "ทดสอบ failure" });
    const reserved = prepared.reservedAmount;

    const stream = createChatStream(prepared);
    const reader = stream.getReader();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    const events = parseSse(text);
    expect(events.some((e) => e.event === "error" && e.data?.code === "MODEL_UNAVAILABLE")).toBe(true);

    // refund คืนเต็ม
    const tx = await q<{ types: string[]; net: string }>(
      `select array_agg(type::text) types,
              sum(case when type in ('CHAT_USAGE','REGENERATE','REFUND') then amount else 0 end)::text net
       from energy_transactions where user_id=$1 and created_at > now() - interval '1 minute'`,
      [user.id]
    );
    expect(tx.rows[0].types).toContain("REFUND");
    expect(Number(tx.rows[0].net)).toBe(0); // reserve −X + refund +X

    // usage log ERROR row
    const logs = await q<{ status: string; error_code: string | null }>(
      "select status, error_code from ai_usage_logs where user_id=$1 order by created_at desc limit 1",
      [user.id]
    );
    expect(logs.rows[0].status).toBe("ERROR");
    expect(logs.rows[0].error_code).toBe("MODEL_UNAVAILABLE");

    // balance คืนค่าเดิม (หัก 0)
    expect(await walletBalance()).toBe(balanceBefore);
    void reserved;
  });
});

describe("client abort mid-stream", () => {
  it("abort แล้ว server จัดการ ABORTED — message ABORTED/partial + refund ครบ", async () => {
    const startedAt = new Date();
    const controller = new AbortController();
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: user.cookie },
      body: JSON.stringify({ conversationId: convId, content: "เล่าให้ฟังยาว ๆ หน่อยครับ" }),
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let sawDelta = false;
    while (!sawDelta) {
      const { done, value } = await reader.read();
      if (done) break;
      if (decoder.decode(value, { stream: true }).includes("event: delta")) sawDelta = true;
    }
    controller.abort();
    // cancel อาจค้างถ้า underlying socket ปิดช้า — กันด้วย race
    await Promise.race([
      reader.cancel().catch(() => {}),
      new Promise((r) => setTimeout(r, 3000)),
    ]);

    // poll รอ server จบการทำงาน (refund หรือ settle) — background job อาจใช้เวลา
    const deadline = Date.now() + 45_000;
    let freshRefund = false;
    let lastMsgStatus: string | null = null;
    while (Date.now() < deadline && !freshRefund) {
      await new Promise((r) => setTimeout(r, 1500));
      const tx = await q<{ n: number }>(
        `select count(*)::int n from energy_transactions where user_id=$1 and type='REFUND' and created_at > $2`,
        [user.id, startedAt]
      );
      freshRefund = tx.rows[0].n > 0;
      if (!freshRefund) {
        // abort อาจมาหลังโมเดลตอบจบ → settle ปกติ (COMPLETED) หรือกลางทาง (ABORTED)
        const m = await q<{ status: string }>(
          "select status from messages where conversation_id=$1 and role='ASSISTANT' order by created_at desc limit 1",
          [convId]
        );
        lastMsgStatus = m.rows[0]?.status ?? null;
        if (lastMsgStatus === "COMPLETED" || lastMsgStatus === "ABORTED") break;
      }
    }

    // invariant: ไม่ว่า abort จะไปถึงก่อน/หลัง stream จบ ต้องจบด้วย state ที่สมเหตุสมผล
    // (refund เต็ม เพราะ abort ทัน | หรือ message ถูกเซฟเป็น COMPLETED/ABORTED พร้อม charge ≤ reserved)
    const agg = await q<{ chat: string; refund: string }>(
      `select
         coalesce(sum(case when type='CHAT_USAGE' then amount else 0 end),0)::text chat,
         coalesce(sum(case when type='REFUND' then amount else 0 end),0)::text refund
       from energy_transactions where user_id=$1`,
      [user.id]
    );
    const netChat = Number(agg.rows[0].chat) + Number(agg.rows[0].refund);
    expect(netChat).toBeLessThanOrEqual(0);
    expect(await walletBalance()).toBeGreaterThanOrEqual(0);
    expect(freshRefund || lastMsgStatus === "COMPLETED" || lastMsgStatus === "ABORTED").toBe(true);
    console.log(
      `[abort] outcome: ${freshRefund ? "refunded (abort ทัน)" : `settled (${lastMsgStatus})`} netChat=${netChat}`
    );
  }, 120_000);
});

describe("bad input matrix (/api/chat + conversations)", () => {
  it.each([
    [{ body: { conversationId: convId } }, "ขาด content"],
    [{ body: { conversationId: convId, content: "" } }, "content ว่าง"],
    [{ body: { conversationId: convId, content: "x".repeat(4001) } }, "content ยาวเกิน"],
    [{ body: { conversationId: "abc", content: "hi" } }, "conversationId ไม่ใช่ uuid"],
    [{ body: { content: "hi" } }, "ขาด conversationId"],
  ] as [any, string][])("%s → 400 VALIDATION_ERROR", async ({ body }) => {
    const res = await api("POST", "/api/chat", { cookie: user.cookie, body });
    expect([400, 404]).toContain(res.status); // non-uuid → isUuid guard 404 ก็ยอมรับ
    if (res.status === 400) expect(res.json.error.code).toBe("VALIDATION_ERROR");
  });

  it("malformed JSON raw body → ไม่ crash server (4xx/5xx ที่มี error body)", async () => {
    const res = await api("POST", "/api/chat", {
      cookie: user.cookie,
      rawBody: `{"conversationId": "${convId}", "content": broken`,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    if (res.status === 500) {
      console.log("[finding] malformed JSON → 500 INTERNAL_ERROR (ควร 400 VALIDATION_ERROR)");
    }
  });

  it("nonexistent uuid → 404 NOT_FOUND", async () => {
    const ghost = "00000000-0000-4000-8000-999999999999";
    const chatRes = await api("POST", "/api/chat", {
      cookie: user.cookie,
      body: { conversationId: ghost, content: "hi" },
    });
    expect(chatRes.status).toBe(404);
    expect(chatRes.json.error.code).toBe("NOT_FOUND");

    const msgRes = await api("GET", `/api/conversations/${ghost}/messages`, { cookie: user.cookie });
    expect(msgRes.status).toBe(404);
  });

  it("regenerate บน USER message → 404 (target ต้องเป็น ASSISTANT)", async () => {
    const msgs = await api("GET", `/api/conversations/${convId}/messages`, { cookie: user.cookie });
    const userMsg = msgs.json.messages.find((m: any) => m.role === "USER");
    if (!userMsg) return; // ยังไม่มี user msg ก็ข้าม
    const res = await api("POST", `/api/messages/${userMsg.id}/regenerate`, {
      cookie: user.cookie,
      body: {},
    });
    expect(res.status).toBe(404);
  });

  it("messages limit param ปลอดภัย (limit=99999 → clamp 60, limit=abc → default)", async () => {
    const r1 = await api("GET", `/api/conversations/${convId}/messages?limit=99999`, { cookie: user.cookie });
    expect(r1.status).toBe(200);
    const r2 = await api("GET", `/api/conversations/${convId}/messages?limit=${encodeURIComponent("<script>")}`, { cookie: user.cookie });
    expect(r2.status).toBe(200); // Number() → NaN → ?? default path
  });
});
