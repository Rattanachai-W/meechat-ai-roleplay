import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnergyTransactionType, Prisma } from "@/generated/prisma/client";
import {
  getOrCreateWalletSummary,
  spendEnergy,
  grantEnergy,
  settleEnergy,
  refundEnergy,
  claimDailyReward,
} from "@/lib/energy/service";
import { ApiError } from "@/lib/api/errors";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, topUpEnergy, type TestUser } from "../helpers/user";

/**
 * Integration (in-process ต่อ DB จริง): energy ledger service
 * reserve→settle/refund, idempotency, free-before-paid ordering
 */

let user: TestUser;

beforeAll(async () => {
  await connectDb();
  user = await createTestUser();
});

afterAll(async () => {
  if (user) await cleanupTestUser(user);
  await closeDb();
});

async function balance(): Promise<number> {
  const w = await getOrCreateWalletSummary(user.id);
  return w.totalBalance;
}

describe("energy service", () => {
  it("wallet auto-create เริ่มที่ 0", async () => {
    const w = await getOrCreateWalletSummary(user.id);
    expect(w.freeBalance).toBe(0);
    expect(w.paidBalance).toBe(0);
    expect(w.lifetimeEarned).toBe(0);
  });

  it("spend เกินยอด → ApiError INSUFFICIENT_ENERGY", async () => {
    await expect(spendEnergy({ userId: user.id, amount: 1, type: EnergyTransactionType.CHAT_USAGE, idempotencyKey: "k-over" }))
      .rejects.toMatchObject({ name: "ApiError", code: "INSUFFICIENT_ENERGY" });
  });

  it("grant → spend: ledger amount/balanceBefore/balanceAfter ตรง", async () => {
    await grantEnergy({ userId: user.id, amount: 100, type: EnergyTransactionType.ADMIN_ADJUSTMENT, idempotencyKey: "g1" });
    await grantEnergy({ userId: user.id, amount: 50, type: EnergyTransactionType.ADMIN_ADJUSTMENT, idempotencyKey: "g2" });
    expect(await balance()).toBe(150);

    const w0 = await getOrCreateWalletSummary(user.id);
    await spendEnergy({
      userId: user.id,
      amount: 30,
      type: EnergyTransactionType.CHAT_USAGE,
      idempotencyKey: "s1",
    });
    const tx = await q<{ type: string; amount: string; before: number; after: number }>(
      "select type::text, amount::text, balance_before as before, balance_after as after from energy_transactions where user_id=$1 and idempotency_key='s1'",
      [user.id]
    );
    expect(tx.rows[0].type).toBe("CHAT_USAGE");
    expect(Number(tx.rows[0].amount)).toBe(-30);
    expect(tx.rows[0].before).toBe(150);
    expect(tx.rows[0].after).toBe(120);

    const w1 = await getOrCreateWalletSummary(user.id);
    expect(w1.lifetimeSpent).toBe(w0.lifetimeSpent + 30);
  });

  it("หักจาก free ก่อน paid เสมอ", async () => {
    // reset: หมดของเดิมก่อน
    await q("update energy_wallets set free_balance=0, paid_balance=0 where user_id=$1", [user.id]);
    await q(
      `update energy_wallets set free_balance=10, paid_balance=100 where user_id=$1`,
      [user.id]
    );
    await spendEnergy({ userId: user.id, amount: 40, type: EnergyTransactionType.CHAT_USAGE, idempotencyKey: "fp1" });
    const w = await getOrCreateWalletSummary(user.id);
    expect(w.freeBalance).toBe(0); // free โดนหมดก่อน
    expect(w.paidBalance).toBe(70); // ที่เหลือหักจาก paid
    expect(w.totalBalance).toBe(70);
  });

  it("settleEnergy: refund ส่วนเกินครั้งเดียว — replay key เดิม → P2002", async () => {
    const key = `settle-${user.id}`;
    const { refunded } = await settleEnergy({
      userId: user.id,
      reservedAmount: 100,
      actualCost: 37,
      idempotencyKey: key,
    });
    expect(refunded).toBe(63);

    // replay การ settle เดิม (key เดียวกัน) → unique violation ที่ DB level
    let caught: any = null;
    try {
      await settleEnergy({ userId: user.id, reservedAmount: 100, actualCost: 37, idempotencyKey: key });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect((caught as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");

    // balance ต้องไม่ถูกเพิ่มซ้ำ
    const afterReplay = await balance();
    expect(afterReplay).toBe(70 + 63);
  });

  it("refundEnergy คืนเต็มพร้อม metadata reason", async () => {
    const before = await balance();
    await refundEnergy({ userId: user.id, reservedAmount: 25, idempotencyKey: `rf-${user.id}`, reason: "stream_failed" });
    const tx = await q<{ metadata: any }>(
      "select metadata from energy_transactions where user_id=$1 and idempotency_key=$2",
      [user.id, `rf-${user.id}:refund`]
    );
    expect(tx.rows[0]?.metadata?.reason).toBe("stream_failed");
    expect(await balance()).toBe(before + 25);
    // refund 0 → no-op
    await refundEnergy({ userId: user.id, reservedAmount: 0, idempotencyKey: `rf0-${user.id}` });
    expect(await balance()).toBe(before + 25);
  });

  it("claimDailyReward: ครั้งแรกได้ 50, ครั้งสอง claimed=false", async () => {
    const r1 = await claimDailyReward(user.id);
    expect(r1.claimed).toBe(true);
    expect(r1.amount).toBe(50);
    const sum = await q<{ total: string }>(
      "select coalesce(sum(amount),0)::text total from energy_transactions where user_id=$1 and type='DAILY_REWARD'",
      [user.id]
    );
    expect(Number(sum.rows[0].total)).toBe(50);
    const r2 = await claimDailyReward(user.id);
    expect(r2.claimed).toBe(false);
    expect(r2.amount).toBe(0);
  });

  it("topUpEnergy helper ใช้ SQL ตรงได้จริง", async () => {
    await topUpEnergy(user.id, 5);
    const b = await balance();
    expect(b).toBeGreaterThan(0);
  });
});
