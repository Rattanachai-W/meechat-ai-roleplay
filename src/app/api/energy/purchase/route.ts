import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { grantEnergy } from "@/lib/energy/service";
import { EnergyTransactionType } from "@/generated/prisma/client";
import {
  ENERGY_PACKAGES,
  createEnergyCheckout,
  resolvePaymentsMode,
} from "@/lib/payments/service";

/**
 * Energy top-up shop (docs/creator-system.md §5)
 *
 * แพ็กเกจ + logic ชำระเงินอยู่ที่ src/lib/payments/service.ts
 * - mode off   : POST → 503 PAYMENTS_DISABLED
 * - mode mock  : credit ทันที (dev/E2E — ไม่มีเงินจริง)
 * - mode stripe: สร้าง Checkout Session → คืน checkoutUrl ให้ redirect
 *                เงินเข้ากระเป๋าหลัง webhook /api/webhooks/stripe
 *                หรือ POST /api/energy/confirm เมื่อผู้ใช้กลับมาถึง success_url
 */

const purchaseSchema = z.object({ packageId: z.string().trim().min(1).max(60) });

/** GET /api/energy/purchase — catalog + สถานะระบบชำระเงิน (mode ให้ UI โชว์ป้าย "โหมดทดสอบ") */
export async function GET() {
  const mode = resolvePaymentsMode();
  return NextResponse.json({
    packages: ENERGY_PACKAGES,
    paymentsEnabled: mode !== "off",
    mode: mode === "off" ? null : mode,
  });
}

/**
 * POST /api/energy/purchase {packageId}
 * mock mode: credit ทันที; stripe mode: คืน checkoutUrl (ยังไม่เครดิต — รอจ่ายจริง)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("purchase", userId);
    const body = purchaseSchema.parse(await request.json());
    const pkg = ENERGY_PACKAGES.find((p) => p.id === body.packageId);
    if (!pkg) throw new ApiError("NOT_FOUND", "ไม่พบแพ็กเกจนี้");

    const mode = resolvePaymentsMode();
    if (mode === "off") throw new ApiError("PAYMENTS_DISABLED");

    if (mode === "stripe") {
      // origin จาก header กัน mismatch เวลารันหลัง proxy/port ต่าง
      const origin =
        request.headers.get("origin") ?? new URL(request.url).origin;
      const checkout = await createEnergyCheckout({ pkg, userId, origin });
      return NextResponse.json({
        checkoutUrl: checkout.checkoutUrl,
        sessionId: checkout.sessionId,
        mode,
      });
    }

    // mock mode — idempotency key ต่อ request (กดซ้ำ = ซื้อซ้ำ ตั้งใจ เหมือนกดซื้อจริง)
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
