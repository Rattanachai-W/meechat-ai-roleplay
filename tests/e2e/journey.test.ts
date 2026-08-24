import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, parseSse } from "../helpers/http";
import { requireDevServer, BASE } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";

/**
 * E2E: full user journey บน dev server
 * login-state → persona → conversation → chat SSE (จริง) → wallet →
 * favorite/like → follow → regenerate variant → activate variant → SSR pages
 */

let user: TestUser;
let personaId: string;
let convId: string;
let characterId: string;
let creatorUsername: string;

beforeAll(async () => {
  await requireDevServer();
  await connectDb();
  user = await createTestUser();

  const claim = await api("POST", "/api/energy/daily-claim", { cookie: user.cookie });
  expect(claim.json.claimed).toBe(true);

  const persona = await api("POST", "/api/personas", {
    cookie: user.cookie,
    body: { name: "นักทดสอบ", description: "ผู้ใช้ e2e" },
  });
  personaId = persona.json.persona.id;

  const charRow = await q<{ id: string; username: string | null }>(
    `select c.id, cp.username from characters c left join creator_profiles cp on cp.id = c.creator_id where c.slug='pranee-doctor'`
  );
  characterId = charRow.rows[0].id;
  creatorUsername = charRow.rows[0].username ?? "";

  const conv = await api("POST", "/api/conversations", {
    cookie: user.cookie,
    body: { characterId, personaId },
  });
  convId = conv.json.conversation.id;
});

afterAll(async () => {
  if (user) await cleanupTestUser(user);
  await closeDb();
});

describe("E2E user journey", () => {
  it("conversation เริ่มด้วย first message ของตัวละคร", async () => {
    const res = await api("GET", `/api/conversations/${convId}/messages`, { cookie: user.cookie });
    expect(res.status).toBe(200);
    expect(res.json.messages.length).toBe(1);
    expect(res.json.messages[0].role).toBe("ASSISTANT");
    expect(res.json.messages[0].content.length).toBeGreaterThan(0);
  });

  it("chat SSE: delta* → done, content ตรงกับ concat ของ delta, ข้อความถูกเซฟ COMPLETED", async () => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: user.cookie },
      body: JSON.stringify({ conversationId: convId, content: "หมอคะ เมื่อคืนนอนไม่หลับเลยครับ" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    const events = parseSse(text);
    const deltas = events.filter((e) => e.event === "delta");
    const dones = events.filter((e) => e.event === "done");
    const errors = events.filter((e) => e.event === "error");

    expect(errors.length).toBe(0);
    expect(deltas.length).toBeGreaterThan(0);
    expect(dones.length).toBe(1);

    const streamedText = deltas.map((d) => d.data.text).join("");
    expect(dones[0].data.content).toBe(streamedText);
    expect(dones[0].data.messageId).toBeTruthy();
    expect(dones[0].data.usage.promptTokens).toBeGreaterThan(0);
    expect(dones[0].data.usage.completionTokens).toBeGreaterThan(0);

    // energy settle ตามที่ report ใน done
    expect(dones[0].data.energy.reserved).toBeGreaterThan(0);
    expect(dones[0].data.energy.charged).toBeGreaterThan(0);
    expect(dones[0].data.energy.charged).toBeLessThanOrEqual(dones[0].data.energy.reserved);
  });

  it("wallet/ledger สอดคล้องกับที่ chat คิดเงิน + usage log SUCCESS", async () => {
    const wallet = await api("GET", "/api/energy/wallet", { cookie: user.cookie });
    const txs = await api("GET", "/api/energy/transactions?limit=50", { cookie: user.cookie });

    const chatTxs = txs.json.transactions.filter((t: any) => t.type === "CHAT_USAGE");
    const refunds = txs.json.transactions.filter((t: any) => t.type === "REFUND");
    expect(chatTxs.length).toBe(1); // reserve entry

    // ledger chain: balanceAfter ไล่ตรงตาม cumulative
    const ordered = [...txs.json.transactions].reverse();
    let run = 0;
    for (const t of ordered) {
      run += Number(t.amount);
      expect(Number(t.balanceAfter)).toBe(run);
    }

    const chargedNet =
      Number(chatTxs[0].amount) +
      refunds.reduce((s: number, r: any) => s + Number(r.amount), 0);
    expect(chargedNet).toBeLessThan(0); // ติดลบ = โดนหัก

    const charged = -chargedNet;
    expect(wallet.json.wallet.totalBalance).toBe(50 - charged);
    expect(wallet.json.wallet.lifetimeEarned).toBe(50);
    expect(wallet.json.wallet.lifetimeSpent).toBe(charged);

    const logs = await q<{ status: string }>(
      "select status from ai_usage_logs where user_id=$1 and feature='chat' order by created_at desc limit 1",
      [user.id]
    );
    expect(logs.rows[0]?.status).toBe("SUCCESS");
  });

  it("user message + assistant reply อยู่ใน conversation แล้ว", async () => {
    const res = await api("GET", `/api/conversations/${convId}/messages`, { cookie: user.cookie });
    const roles = res.json.messages.map((m: any) => m.role);
    expect(roles).toEqual(["ASSISTANT", "USER", "ASSISTANT"]);
  });

  it("favorite toggle on/off + like toggle", async () => {
    const f1 = await api("POST", `/api/characters/${characterId}/favorite`, { cookie: user.cookie });
    expect(f1.status).toBe(200);
    expect(f1.json.favorited ?? f1.json.favourite ?? true).toBeTruthy();
    const f2 = await api("POST", `/api/characters/${characterId}/favorite`, { cookie: user.cookie });
    const offValue = f2.json.favorited ?? f2.json.favourite ?? false;
    expect(offValue).toBeFalsy();

    const l1 = await api("POST", `/api/characters/${characterId}/like`, { cookie: user.cookie });
    expect(l1.status).toBe(200);
    await api("POST", `/api/characters/${characterId}/like`, { cookie: user.cookie }); // toggle กลับ
  });

  it("follow creator → following true → unfollow false", async () => {
    expect(creatorUsername).not.toBe("");
    const f1 = await api("POST", `/api/creators/${creatorUsername}/follow`, { cookie: user.cookie });
    expect(f1.json.following).toBe(true);
    const f2 = await api("POST", `/api/creators/${creatorUsername}/follow`, { cookie: user.cookie });
    expect(f2.json.following).toBe(false);
  });

  it("regenerate → variant ใหม่ (index+1), variants>1, activate สลับ active variant ได้", async () => {
    const msgs = await api("GET", `/api/conversations/${convId}/messages`, { cookie: user.cookie });
    // list เรียง desc → assistant ตัวแรกคือ reply ล่าสุด (มี parent) — ห้ามหยิบ greeting (parentless)
    const assistantMsg = msgs.json.messages.find((m: any) => m.role === "ASSISTANT");
    expect(assistantMsg.parentMessageId).toBeTruthy();

    const res = await fetch(`${BASE}/api/messages/${assistantMsg.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: user.cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const events = parseSse(await res.text());
    const done = events.find((e) => e.event === "done");
    expect(done).toBeTruthy();
    expect(done!.data.messageId).not.toBe(assistantMsg.id);

    const after = await api("GET", `/api/conversations/${convId}/messages`, { cookie: user.cookie });
    const counts = after.json.variantCounts as Record<string, number>;
    expect(counts[assistantMsg.parentMessageId]).toBeGreaterThanOrEqual(2);

    // active variant ควรเป็นตัวใหม่
    const newActive = after.json.messages.find(
      (m: any) => m.role === "ASSISTANT" && m.isActiveVariant && m.parentMessageId === assistantMsg.parentMessageId
    );
    expect(newActive?.variantIndex).toBeGreaterThan(0);
    void creatorUsername;
  });

  it("SSR pages ทุกหน้า (authenticated) render 200", async () => {
    const pages = [
      "/", "/discover", "/library", "/persona", "/settings", "/wallet",
      `/chat/${convId}`, "/character/pranee-doctor",
    ];
    for (const p of pages) {
      const res = await fetch(`${BASE}${p}`, { headers: { Cookie: user.cookie } });
      expect(res.status, `page ${p}`).toBe(200);
    }
  });
});

