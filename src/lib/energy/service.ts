import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import { EnergyTransactionType, Prisma } from "@/generated/prisma/client";
import { DAILY_REWARD_AMOUNT } from "@/lib/energy/pricing";

/**
 * Energy ledger service — reserve → settle/refund pattern
 *
 * - ทุกการเปลี่ยน balance เข้า ledger เสมอ (amount ติดลบ = ใช้ไป)
 * - balanceBefore/balanceAfter เป็นยอดรวม (free + paid)
 * - idempotencyKey กันหักซ้ำเมื่อ retry
 * - หักจาก free ก่อน paid เสมอ
 * - lock แถว wallet ด้วย SELECT ... FOR UPDATE กัน race ตอนยอดต่ำ
 */

export interface WalletSummary {
  freeBalance: number;
  paidBalance: number;
  totalBalance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export async function getOrCreateWalletSummary(userId: string): Promise<WalletSummary> {
  const wallet = await prisma.energyWallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  return {
    freeBalance: wallet.freeBalance,
    paidBalance: wallet.paidBalance,
    totalBalance: wallet.freeBalance + wallet.paidBalance,
    lifetimeEarned: wallet.lifetimeEarned,
    lifetimeSpent: wallet.lifetimeSpent,
  };
}

interface SpendOptions {
  userId: string;
  amount: number;
  type: EnergyTransactionType;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Retry เมื่อ transaction โดน write-conflict/deadlock (P2034) หรือ timeout (P2028)
 * — เกิดบ่อยตอนหลาย request แต่ wallet เดียวพร้อมกัน (parallel chats)
 */
async function withContentionRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string } | null)?.code;
      if (code === "P2034" || code === "P2028") {
        await new Promise((r) => setTimeout(r, 40 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/** หักพลังงาน (ledger entry ติดลบ) — throw INSUFFICIENT_ENERGY ถ้ายอดไม่พอ */
export async function spendEnergy(opts: SpendOptions): Promise<void> {
  if (opts.amount <= 0) throw new Error("spendEnergy: amount must be > 0");
  await withContentionRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw<{ id: string }[]>`
        select id from energy_wallets where user_id = ${opts.userId} for update`;
      const wallet = await tx.energyWallet.findUnique({ where: { userId: opts.userId } });
      if (!wallet) throw new ApiError("NOT_FOUND", "ไม่พบกระเป๋าพลังงาน");

      const total = wallet.freeBalance + wallet.paidBalance;
      if (total < opts.amount) throw new ApiError("INSUFFICIENT_ENERGY");

      const fromFree = Math.min(wallet.freeBalance, opts.amount);
      const fromPaid = opts.amount - fromFree;
      const updated = await tx.energyWallet.update({
        where: { id: wallet.id },
        data: {
          freeBalance: { decrement: fromFree },
          paidBalance: fromPaid > 0 ? { decrement: fromPaid } : undefined,
          lifetimeSpent: { increment: opts.amount },
        },
      });

      await tx.energyTransaction.create({
        data: {
          walletId: wallet.id,
          userId: opts.userId,
          type: opts.type,
          amount: -opts.amount,
          balanceBefore: total,
          balanceAfter: updated.freeBalance + updated.paidBalance,
          referenceType: opts.referenceType,
          referenceId: opts.referenceId,
          idempotencyKey: opts.idempotencyKey,
          metadata: opts.metadata,
        },
      });
    })
  );
}

/** คืนพลังงาน (ledger entry บวก) — เติมเข้า free เสมอ */
export async function grantEnergy(opts: Omit<SpendOptions, "amount"> & { amount: number }): Promise<void> {
  if (opts.amount <= 0) throw new Error("grantEnergy: amount must be > 0");
  await withContentionRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw<{ id: string }[]>`
        select id from energy_wallets where user_id = ${opts.userId} for update`;
      const wallet = await tx.energyWallet.upsert({
        where: { userId: opts.userId },
        update: {},
        create: { userId: opts.userId },
      });
      const total = wallet.freeBalance + wallet.paidBalance;
      const updated = await tx.energyWallet.update({
        where: { id: wallet.id },
        data: {
          freeBalance: { increment: opts.amount },
          // refund = คืนเงินของตัวเองจากการ reserve เกิน — ไม่ใช่ "รายได้";
          // หัก lifetimeSpent คืนแทน (ตอน reserve เขียน lifetimeSpent เต็มจำนวนไว้แล้ว)
          ...(opts.type === EnergyTransactionType.REFUND
            ? { lifetimeSpent: { decrement: opts.amount } }
            : { lifetimeEarned: { increment: opts.amount } }),
        },
      });
      await tx.energyTransaction.create({
        data: {
          walletId: wallet.id,
          userId: opts.userId,
          type: opts.type,
          amount: opts.amount,
          balanceBefore: total,
          balanceAfter: updated.freeBalance + updated.paidBalance,
          referenceType: opts.referenceType,
          referenceId: opts.referenceId,
          idempotencyKey: opts.idempotencyKey,
          metadata: opts.metadata,
        },
      });
    })
  );
}

/**
 * Settle หลังจบ stream: ถ้าใช้จริงน้อยกว่าที่ reserve ไว้ → refund ส่วนต่าง
 * (reserve ถูกบันทึกเป็น entry ติดลบแล้ว, idempotency กัน refund ซ้ำ)
 */
export async function settleEnergy(opts: {
  userId: string;
  reservedAmount: number;
  actualCost: number;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
}): Promise<{ refunded: number }> {
  const refund = opts.reservedAmount - opts.actualCost;
  if (refund > 0) {
    await grantEnergy({
      userId: opts.userId,
      amount: refund,
      type: EnergyTransactionType.REFUND,
      idempotencyKey: `${opts.idempotencyKey}:refund`,
      referenceType: opts.referenceType,
      referenceId: opts.referenceId,
      metadata: { reserved: opts.reservedAmount, actual: opts.actualCost },
    });
  }
  return { refunded: Math.max(0, refund) };
}

/** Refund ทั้งจำนวนที่ reserve ไว้ (เมื่อ stream ล้มเหลว) */
export async function refundEnergy(opts: {
  userId: string;
  reservedAmount: number;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
}): Promise<void> {
  if (opts.reservedAmount <= 0) return;
  await grantEnergy({
    userId: opts.userId,
    amount: opts.reservedAmount,
    type: EnergyTransactionType.REFUND,
    idempotencyKey: `${opts.idempotencyKey}:refund`,
    referenceType: opts.referenceType,
    referenceId: opts.referenceId,
    metadata: { reason: opts.reason ?? "stream_failed" },
  });
}

/** วันที่แบบ timezone ไทย (YYYY-MM-DD) ใช้เป็นกุญแจกันเคลมซ้ำ */
function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/** รับพลังงานรายวัน — idempotent ต่อ user ต่อวัน (คืน claimed=false ถ้ารับไปแล้ว) */
export async function claimDailyReward(userId: string): Promise<{
  claimed: boolean;
  amount: number;
  wallet: WalletSummary;
}> {
  const idempotencyKey = `daily:${userId}:${bangkokToday()}`;
  try {
    await grantEnergy({
      userId,
      amount: DAILY_REWARD_AMOUNT,
      type: EnergyTransactionType.DAILY_REWARD,
      idempotencyKey,
      referenceType: "daily_reward",
      referenceId: bangkokToday(),
    });
  } catch (error) {
    // P2002 = unique violation ที่ idempotencyKey → เคลมไปแล้ววันนี้
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { claimed: false, amount: 0, wallet: await getOrCreateWalletSummary(userId) };
    }
    throw error;
  }
  return { claimed: true, amount: DAILY_REWARD_AMOUNT, wallet: await getOrCreateWalletSummary(userId) };
}
