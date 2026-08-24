import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/http";
import { requireDevServer, BASE } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, topUpEnergy, type TestUser } from "../helpers/user";
import {
  grantEnergy,
  spendEnergy,
  getOrCreateWalletSummary,
} from "@/lib/energy/service";
import { EnergyTransactionType } from "@/generated/prisma/client";

/**
 * Concurrency / Race Condition:
 * 1. daily-claim race (HTTP parallel) → ได้รับครั้งเดียว
 * 2. wallet FOR UPDATE lock → parallel grant/spend ยอดถูกต้อง ไม่ติดลบ
 * 3. parallel chat จริงบน wallet เดียว → ledger consistent
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

describe("daily claim race", () => {
  it("ยิงพร้อมกัน 6 requests → claimed=true แค่ครั้งเดียว, ledger รวม +50", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        api("POST", "/api/energy/daily-claim", { cookie: user.cookie })
      )
    );
    const claimed = results.filter((r) => r.json?.claimed === true);
    const notClaimed = results.filter((r) => r.json?.claimed === false);
    expect(claimed.length).toBe(1);
    expect(notClaimed.length).toBe(5);

    const sum = await q<{ total: string }>(
      "select coalesce(sum(amount),0)::text total from energy_transactions where user_id=$1 and type='DAILY_REWARD'",
      [user.id]
    );
    expect(Number(sum.rows[0].total)).toBe(50);

    const w = await getOrCreateWalletSummary(user.id);
    expect(w.lifetimeEarned).toBe(50);
    expect(w.totalBalance).toBe(50);
  });
});

describe("wallet row-lock invariant (service-level parallel)", () => {
  it("parallel grants+spends: balance ตรงกับผลรวมของ ops ที่สำเร็จ + ledger chain ไม่มีจุดติดลบ", async () => {
    await topUpEnergy(user.id, 100);
    const start = await getOrCreateWalletSummary(user.id);

    // ชนกันหนัก ๆ: +10 ×6, −15 ×4 — contention อาจทำบาง tx abort (P2034)
    // จุดสำคัญคือ balance สุดท้ายต้องตรงกับ "เฉพาะ ops ที่ commit จริง" เสมอ
    const GRANT_N = 6, SPEND_N = 4;
    const ops: { kind: "g" | "s"; p: Promise<unknown> }[] = [];
    for (let i = 0; i < GRANT_N; i++) {
      ops.push({
        kind: "g",
        p: grantEnergy({ userId: user.id, amount: 10, type: EnergyTransactionType.ADMIN_ADJUSTMENT, idempotencyKey: `race-g-${Date.now()}-${i}` }),
      });
    }
    for (let i = 0; i < SPEND_N; i++) {
      ops.push({
        kind: "s",
        p: spendEnergy({ userId: user.id, amount: 15, type: EnergyTransactionType.CHAT_USAGE, idempotencyKey: `race-s-${Date.now()}-${i}` }),
      });
    }
    const settled = await Promise.allSettled(ops.map((o) => o.p));
    const committed = settled
      .map((r, i) => ({ ok: r.status === "fulfilled", kind: ops[i].kind }))
      .filter((x) => x.ok);
    const gOK = committed.filter((c) => c.kind === "g").length;
    const sOK = committed.filter((c) => c.kind === "s").length;

    // ถ้ามี op โดน contention abort ก็ต้องเป็น minority (ไม่ใช่ทั้งชุดพัง)
    console.log(`[race] committed grants=${gOK}/${GRANT_N} spends=${sOK}/${SPEND_N}`);
    // อย่างน้อยครึ่งต้อง commit — ถ้าน้อยกว่านี้แปลว่า contention รุนแรงเกิน (prisma pool/timeout)
    expect(gOK + sOK).toBeGreaterThanOrEqual(5);

    const end = await getOrCreateWalletSummary(user.id);
    expect(end.totalBalance).toBe(start.totalBalance + 10 * gOK - 15 * sOK);

    // chain check (tie-proof): ทุก tx ต้อง after == before + amount, ≥0 ทุกแถว
    // (created_at อาจติดกันจน order สลับ — self-consistency ไม่พึ่งลำดับ)
    const rows = await q<{ amount: string; before: string; after: string }>(
      "select amount::text, balance_before::text before, balance_after::text after from energy_transactions where user_id=$1",
      [user.id]
    );
    for (const r of rows.rows) {
      const amt = Number(r.amount), bef = Number(r.before), aft = Number(r.after);
      if ([amt, bef, aft].some(Number.isNaN)) {
        console.log("[race] unparsable row:", JSON.stringify(r));
      }
      expect([amt, bef, aft].some(Number.isNaN)).toBe(false);
      expect(aft).toBe(bef + amt);
      expect(aft).toBeGreaterThanOrEqual(0);
    }
    // continuity (tie-proof): multiset(balanceBefore) − multiset(balanceAfter) = {ยอดเริ่มต้น}
    // และ multiset(balanceAfter) − multiset(balanceBefore) = {ยอดปัจจุบัน}
    // ห้าม sort-and-slice เพราะ "ยอดสุดท้าย" ไม่จำเป็นต้องเป็น max/min (spend ก่อน grant ได้)
    const befores = rows.rows.map((r) => Number(r.before));
    const afters = rows.rows.map((r) => Number(r.after));
    const multisetDiff = (xs: number[], ys: number[]) => {
      const remaining = [...ys];
      const out: number[] = [];
      for (const x of xs) {
        const idx = remaining.indexOf(x);
        if (idx === -1) out.push(x);
        else remaining.splice(idx, 1);
      }
      return out;
    };
    const onlyBefore = multisetDiff(befores, afters);
    const onlyAfter = multisetDiff(afters, befores);
    try {
      // ยอดเริ่มต้นของ chain = ยอดปัจจุบัน − ผลรวม amount ทั้งหมด (ไม่อิงตัวแปรภายนอก)
      const sumAmounts = rows.rows.reduce((s, r) => s + Number(r.amount), 0);
      expect(onlyBefore).toEqual([end.totalBalance - sumAmounts]);
      expect(onlyAfter).toEqual([end.totalBalance]);
    } catch (error) {
      // dump ลำดับเวลาจริงเพื่อหาจุดที่ chain สะดุด
      const detail = await q<{ created_at: string; type: string; amount: string; before: string; after: string; key: string | null }>(
        "select created_at::text, type, amount::text, balance_before::text before, balance_after::text after, idempotency_key key from energy_transactions where user_id=$1 order by created_at, id",
        [user.id]
      );
      console.log("[race] ledger timeline:");
      for (const d of detail.rows) console.log(`  ${d.created_at} ${d.type} ${d.amount} ${d.before}->${d.after} ${d.key ?? ""}`);
      throw error;
    }
  });

  it("spend ล้มเหลวเมื่อยอดไม่พอแม้แบบ parallel — ไม่เคยติดลบ", async () => {
    // เหลือยอด X; ยิง spend 3 ครั้งพร้อมกัน คนละ X → สำเร็จ ≤1 ครั้ง
    await topUpEnergy(user.id, 40);
    const before = await getOrCreateWalletSummary(user.id);

    const attempts = await Promise.allSettled(
      Array.from({ length: 3 }, (_, i) =>
        spendEnergy({
          userId: user.id,
          amount: before.totalBalance,
          type: EnergyTransactionType.CHAT_USAGE,
          idempotencyKey: `drain-${i}`,
        })
      )
    );
    const succeeded = attempts.filter((a) => a.status === "fulfilled").length;
    expect(succeeded).toBeLessThanOrEqual(1);

    const after = await getOrCreateWalletSummary(user.id);
    expect(after.totalBalance).toBeGreaterThanOrEqual(0);
    expect(before.totalBalance - after.totalBalance).toBe(succeeded > 0 ? before.totalBalance : 0);
  });
});

describe("parallel real chats on one wallet", () => {
  let convId = "";

  beforeAll(async () => {
    await topUpEnergy(user.id, 300);
    const charRow = await q<{ id: string }>("select id from characters where slug='pranee-doctor'");
    const conv = await api("POST", "/api/conversations", {
      cookie: user.cookie,
      body: { characterId: charRow.rows[0].id },
    });
    convId = conv.json.conversation.id;
  });

  // provider (OpenRouter) บางช่วงช้า >60s — 3 streams ขนานต้องยอมให้ถึง 120s
  it("3 chats พร้อมกัน: ทุก stream จบสมบูรณ์, balance ≥ 0, ledger ตรงกับ wallet", async () => {
    const sendChat = async (content: string) => {
      const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: user.cookie },
        body: JSON.stringify({ conversationId: convId, content }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        return { status: res.status, text: await res.text(), errorBody: "" };
      }
      return { status: res.status, text: "", errorBody: await res.text() };
    };

    const chats = await Promise.all(
      ["ปวดหัวมากเลยครับ", "เมื่อวานกินข้าวไม่ค่อยได้", "ออกกำลังกายไหมดี"].map(sendChat)
    );
    for (const c of chats) {
      if (c.status !== 200) console.log(`[race] chat non-200 (${c.status}):`, c.errorBody.slice(0, 300));
    }

    expect(chats.every((c) => c.status === 200)).toBe(true);
    for (const c of chats) {
      expect(c.text).toContain("event: done");
      expect(c.text).not.toContain("event: error");
      // integrity: delta concat == done.content
      const blocks = c.text.split("\n\n").filter(Boolean);
      let acc = "";
      let doneContent = "";
      for (const b of blocks) {
        if (b.startsWith("event: delta")) {
          acc += JSON.parse(/^data: (.+)$/m.exec(b)![1]).text;
        }
        if (b.startsWith("event: done")) {
          doneContent = JSON.parse(/^data: (.+)$/m.exec(b)![1]).content ?? "";
        }
      }
      expect(doneContent).toBe(acc);
    }

    const wallet = await getOrCreateWalletSummary(user.id);
    expect(wallet.totalBalance).toBeGreaterThanOrEqual(0);

    // ledger ↔ wallet ตรงกัน
    const agg = await q<{ net: string }>(
      `select coalesce(sum(amount),0)::text net from energy_transactions where user_id=$1`,
      [user.id]
    );
    expect(Number(agg.rows[0].net)).toBe(wallet.totalBalance);
  }, 120_000);
});
