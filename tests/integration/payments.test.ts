import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";
import { creditPaidSession } from "@/lib/payments/service";

/**
 * Integration: creditPaidSession — เครดิตพลังงานหลัง Stripe รับเงิน
 * เรียก service ตรง ๆ (ไม่ผ่าน HTTP) — session จำลองที่ "จ่ายแล้ว"
 * ปลายทางเดียวกับ webhook (/api/webhooks/stripe) และ confirm (/api/energy/confirm)
 */

const USER_A = "0a408595-d52e-4bc3-80b0-6665e6341e0a"; // ใช้แค่รูปแบบ uuid ไม่ใช่ user จริง

function paidSession(sessionId: string, userId: string, coins = 500) {
  return {
    id: sessionId,
    paymentStatus: "paid",
    metadata: { userId, packageId: "coins_500", coins: String(coins) },
  };
}

describe("creditPaidSession (Stripe credit → energy ledger)", () => {
  let user: TestUser;

  beforeAll(async () => {
    await connectDb();
    user = await createTestUser();
  });

  afterAll(async () => {
    if (user) await cleanupTestUser(user);
    await closeDb();
  });

  it("จ่ายแล้ว → credited=true, wallet+coins, ledger PURCHASE gateway=stripe", async () => {
    const sessionId = `cs_test_${Date.now()}`;
    const result = await creditPaidSession(paidSession(sessionId, user.id));
    expect(result.credited).toBe(true);
    expect(result.coins).toBe(500);

    const wallet = await q<{ free: string; earned: string }>(
      `select free_balance::text free, lifetime_earned::text earned
       from energy_wallets where user_id=$1`,
      [user.id]
    );
    expect(Number(wallet.rows[0].free)).toBe(500);
    expect(Number(wallet.rows[0].earned)).toBe(500);

    const tx = await q<{ amount: string; key: string; gateway: string; ref: string }>(
      `select amount::text, idempotency_key key, metadata->>'gateway' gateway, reference_id ref
       from energy_transactions where user_id=$1 and type='PURCHASE'`,
      [user.id]
    );
    expect(tx.rows).toHaveLength(1);
    expect(Number(tx.rows[0].amount)).toBe(500);
    expect(tx.rows[0].key).toBe(`stripe:${sessionId}`);
    expect(tx.rows[0].gateway).toBe("stripe");
    expect(tx.rows[0].ref).toBe("coins_500");
  });

  it("idempotent: webhook เครดิตไปแล้ว → confirm ซ้ำ credited=false ไม่เพิ่มยอด", async () => {
    const sessionId = `cs_test_${Date.now()}dup`;

    const walletBefore = await q<{ free: string }>(
      `select free_balance::text free from energy_wallets where user_id=$1`,
      [user.id]
    );
    const txCountBefore = await q<{ n: string }>(
      `select count(*)::text n from energy_transactions where user_id=$1 and type='PURCHASE'`,
      [user.id]
    );
    const baseFree = Number(walletBefore.rows[0].free);
    const baseTx = Number(txCountBefore.rows[0].n);

    // session ใหม่ → เครดิตได้ปกติ
    const first = await creditPaidSession(paidSession(sessionId, user.id));
    expect(first.credited).toBe(true);

    // session เดิม replay (webhook + confirm ชนกัน) → P2002 ที่ idempotencyKey
    const again = await creditPaidSession(paidSession(sessionId, user.id));
    expect(again.credited).toBe(false);

    const wallet = await q<{ free: string }>(
      `select free_balance::text free from energy_wallets where user_id=$1`,
      [user.id]
    );
    expect(Number(wallet.rows[0].free)).toBe(baseFree + 500);

    const txs = await q<{ n: string }>(
      `select count(*)::text n from energy_transactions where user_id=$1 and type='PURCHASE'`,
      [user.id]
    );
    expect(Number(txs.rows[0].n)).toBe(baseTx + 1);
  });

  it("session ของคนอื่น (confirm path) → FORBIDDEN", async () => {
    const sessionId = `cs_test_${Date.now()}own`;
    // เครดิตให้ user A ก่อน (webhook path)
    await creditPaidSession(paidSession(sessionId, user.id));
    // user B พยายาม claim session ของ A
    await expect(
      creditPaidSession(
        { id: sessionId, paymentStatus: "paid", metadata: { userId: user.id, packageId: "coins_500", coins: "500" } },
        USER_A
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
