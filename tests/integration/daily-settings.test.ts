import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectDb, closeDb, q } from "../helpers/db";
import { createTestUser, cleanupTestUser, type TestUser } from "../helpers/user";
import {
  claimDailyReward,
  getDailyClaimStatus,
  getDailyRewardAmount,
} from "@/lib/energy/service";

/**
 * Integration: จำนวนพลังงานแจกรายวันอ่านจาก app_settings (แอดมินปรับใน DB ได้)
 * เรียก service ตรง ๆ — MVP ไม่มี admin UI
 */

async function setSetting(value: string) {
  await q(
    `update app_settings set value=$1::text, updated_at=now() where key='daily_reward_amount'`,
    [value]
  );
}

describe("daily reward amount from app_settings", () => {
  let user: TestUser;

  beforeAll(async () => {
    await connectDb();
    user = await createTestUser();
  });

  afterAll(async () => {
    await setSetting("50"); // คืนค่า seed ปกติเสมอ
    if (user) await cleanupTestUser(user);
    await closeDb();
  });

  it("default: ไม่มี/seed=50 → amount 50 + status ยังไม่เคลม", async () => {
    const status = await getDailyClaimStatus(user.id);
    expect(status.amount).toBe(50);
    expect(status.claimedToday).toBe(false);
  });

  it("แอดมินตั้ง 75 → เคลมได้ +75 จริง + claimedToday=true", async () => {
    await setSetting("75");
    expect(await getDailyRewardAmount()).toBe(75);

    const result = await claimDailyReward(user.id);
    expect(result.claimed).toBe(true);
    expect(result.amount).toBe(75);

    const wallet = await q<{ free: string }>(
      `select free_balance::text free from energy_wallets where user_id=$1`,
      [user.id]
    );
    expect(Number(wallet.rows[0].free)).toBe(75);

    const after = await getDailyClaimStatus(user.id);
    expect(after.claimedToday).toBe(true);
  });

  it("เคลมซ้ำวันเดียวกัน → claimed=false (idempotent)", async () => {
    const again = await claimDailyReward(user.id);
    expect(again.claimed).toBe(false);
  });

  it.each([
    ["ค่าไม่ใช่ตัวเลข", "abc"],
    ["ค่าต่ำกว่า 1", "0"],
    ["ค่าเกินเพดาน", "999999"],
  ])("ค่าเพี้ยน (%s) → fallback 50", async (_name, value) => {
    await setSetting(value);
    expect(await getDailyRewardAmount()).toBe(50);
  });
});
