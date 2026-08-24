import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { grantEnergy } from "@/lib/energy/service";
import { EnergyTransactionType } from "@/generated/prisma/client";

/**
 * Energy top-up shop (docs/creator-system.md §5)
 *
 * แพ็กเกจอยู่ในโค้ดชั่วคราว — ย้ายลง DB ตอนต่อ payment gateway
 * - PAYMENTS_ENABLED=false (default): POST → 503 PAYMENTS_DISABLED
 * - PAYMENTS_ENABLED=true + PAYMENTS_MODE=mock: credit ทันที (dev/E2E — ไม่มีเงินจริง)
 *   TODO(payment-gateway): mode จริง (stripe/omise) → รับ provider session id,
 *   verify ฝั่ง webhook ก่อน credit เสมอ; idempotencyKey = `${provider}:${sessionId}`
 */

export interface EnergyPackage {
  id: string;
  coins: number;
  priceThb: number;
  label: string;
}

export const ENERGY_PACKAGES: EnergyPackage[] = [
  { id: "coins_500", coins: 500, priceThb: 99, label: "500 พลังงาน" },
  { id: "coins_1200", coins: 1200, priceThb: 199, label: "1,200 พลังงาน (โบนัส 20%)" },
  { id: "coins_3000", coins: 3000, priceThb: 449, label: "3,000 พลังงาน (โบนัส 40%)" },
];

const purchaseSchema = z.object({ packageId: z.string().trim().min(1).max(60) });

function paymentsMode(): "off" | "mock" | "gateway" {
  if (process.env.PAYMENTS_ENABLED !== "true") return "off";
  return process.env.PAYMENTS_MODE === "mock" ? "mock" : "gateway";
}

/** GET /api/energy/purchase — catalog + สถานะระบบชำระเงิน (mode ให้ UI โชว์ป้าย "โหมดทดสอบ") */
export async function GET() {
  const mode = paymentsMode();
  return NextResponse.json({
    packages: ENERGY_PACKAGES,
    paymentsEnabled: mode !== "off",
    mode: mode === "off" ? null : mode,
  });
}

/**
 * POST /api/energy/purchase {packageId}
 * mock mode: credit ทันที — idempotency key ต่อ request (กดซ้ำ = ซื้อซ้ำ ตั้งใจ เหมือนกดซื้อจริง)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = purchaseSchema.parse(await request.json());
    const pkg = ENERGY_PACKAGES.find((p) => p.id === body.packageId);
    if (!pkg) throw new ApiError("NOT_FOUND", "ไม่พบแพ็กเกจนี้");

    const mode = paymentsMode();
    if (mode === "off") throw new ApiError("PAYMENTS_DISABLED");
    if (mode !== "mock") {
      // TODO(payment-gateway): verify session/webhook กับ provider ก่อน credit
      throw new ApiError("PAYMENTS_DISABLED", "ยังไม่รองรับ payment gateway จริง");
    }

    await grantEnergy({
      userId,
      amount: pkg.coins,
      type: EnergyTransactionType.PURCHASE,
      idempotencyKey: `purchase:mock:${pkg.id}:${userId}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      referenceType: "purchase",
      referenceId: pkg.id,
      metadata: { priceThb: pkg.priceThb, gateway: "mock" },
    });

    return NextResponse.json({ purchased: true, packageId: pkg.id, coins: pkg.coins, mode });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
