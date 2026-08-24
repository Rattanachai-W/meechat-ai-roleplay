import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/http";
import { requireDevServer } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";

/**
 * E2E wallet flows: เติมเงิน (mock payment) + ประวัติการเติม/ใช้พลังงาน + เคลมรายวัน
 * (การแชท E2E อยู่ที่ tests/e2e/journey.test.ts — chat SSE + settle/refund ครบแล้ว)
 *
 * หมายเหตุ: โหมดชำระเงินอ่านจาก env ของ dev server
 * - PAYMENTS_ENABLED=true + PAYMENTS_MODE=mock → ซื้อได้จริง (credit ทันที)
 * - ไม่ตั้ง → 503 PAYMENTS_DISABLED (production default จนกว่าจะต่อ gateway)
 */

const mockMode =
  process.env.PAYMENTS_ENABLED === "true" && process.env.PAYMENTS_MODE === "mock";

describe("E2E wallet flows (top-up + history)", () => {
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

  it("catalog: 3 แพ็กเกจ + paymentsEnabled ตาม env", async () => {
    const res = await api("GET", "/api/energy/purchase", { cookie: user.cookie });
    expect(res.status).toBe(200);
    expect(res.json.packages.length).toBe(3);
    expect(res.json.paymentsEnabled).toBe(mockMode);
    if (mockMode) expect(res.json.mode).toBe("mock");
  });

  it("unauthenticated → 401", async () => {
    const res = await api("POST", "/api/energy/purchase", {
      body: { packageId: "coins_500" },
    });
    expect(res.status).toBe(401);
  });

  it("packageId ไม่รู้จัก → 404", async () => {
    const res = await api("POST", "/api/energy/purchase", {
      cookie: user.cookie,
      body: { packageId: "coins_free_money" },
    });
    expect(res.status).toBe(404);
  });

  it(mockMode
    ? "เติมเงิน (mock): ซื้อ coins_500 → wallet +500 + ledger PURCHASE"
    : "เติมเงินปิดอยู่: POST → 503 PAYMENTS_DISABLED", async () => {
    const res = await api("POST", "/api/energy/purchase", {
      cookie: user.cookie,
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

    // wallet โดนเครดิตจริง (grantEnergy เขียน lifetime_earned ด้วย — ซื้อ = รายได้ของ wallet)
    const wallet = await api("GET", "/api/energy/wallet", { cookie: user.cookie });
    expect(wallet.json.wallet.totalBalance).toBe(500);
    expect(wallet.json.wallet.lifetimeEarned).toBe(500);

    // ledger มีแถว PURCHASE ครบ: amount/balanceAfter/reference
    const row = await q<{ amount: string; after: string; ref: string | null; gateway: string }>(
      `select amount::text, balance_after::text after, reference_id ref, metadata->>'gateway' gateway
       from energy_transactions where user_id=$1 and type='PURCHASE' order by created_at desc limit 1`,
      [user.id]
    );
    expect(row.rows[0]).toBeTruthy();
    expect(Number(row.rows[0].amount)).toBe(500);
    expect(Number(row.rows[0].after)).toBe(500);
    expect(row.rows[0].ref).toBe("coins_500");
    expect(row.rows[0].gateway).toBe("mock");
  });

  it("ซื้อซ้ำ 2 ครั้ง = ยอดรวม 1000 (แต่ละ request คือการซื้อแยก)", async () => {
    if (!mockMode) return;
    const res = await api("POST", "/api/energy/purchase", {
      cookie: user.cookie,
      body: { packageId: "coins_500" },
    });
    expect(res.status).toBe(200);

    const wallet = await api("GET", "/api/energy/wallet", { cookie: user.cookie });
    expect(wallet.json.wallet.totalBalance).toBe(1000);
  });

  it("ประวัติธุรกรรม (API): เรียงใหม่→เก่า, balanceAfter ต่อเนื่องเป็น chain, มี PURCHASE ให้เห็นในหน้า wallet", async () => {
    if (!mockMode) return;
    const res = await api("GET", "/api/energy/transactions?limit=50", { cookie: user.cookie });
    expect(res.status).toBe(200);
    const txs = res.json.transactions;
    expect(txs.length).toBe(2);

    // chain: เรียงเก่า→ใหม่แล้ว balanceAfter ไล่ตรง cumulative
    const ordered = [...txs].reverse();
    let run = 0;
    for (const t of ordered) {
      run += Number(t.amount);
      expect(Number(t.balanceAfter)).toBe(run);
    }

    const purchase = txs.find((t: { type: string }) => t.type === "PURCHASE");
    expect(purchase).toBeTruthy();
    expect(Number(purchase.amount)).toBe(500);
  });

  it("เคลมรายวันยังทำงานคู่กับร้าน: +50 ครั้งเดียวต่อวัน, ยอดรวมถูกต้อง", async () => {
    const c1 = await api("POST", "/api/energy/daily-claim", { cookie: user.cookie });
    expect(c1.status).toBe(200);
    expect(c1.json.claimed).toBe(true);

    const c2 = await api("POST", "/api/energy/daily-claim", { cookie: user.cookie });
    expect(c2.json.claimed).toBe(false);

    const wallet = await api("GET", "/api/energy/wallet", { cookie: user.cookie });
    const expected = (mockMode ? 1000 : 0) + 50;
    expect(wallet.json.wallet.totalBalance).toBe(expected);

    // ledger chain ยังต่อเนื่องหลังผสมหลายประเภท (PURCHASE + DAILY_REWARD)
    const txs = await api("GET", "/api/energy/transactions?limit=50", { cookie: user.cookie });
    const ordered = [...txs.json.transactions].reverse();
    let run = 0;
    for (const t of ordered) {
      run += Number(t.amount);
      expect(Number(t.balanceAfter)).toBe(run);
    }
  });
});
