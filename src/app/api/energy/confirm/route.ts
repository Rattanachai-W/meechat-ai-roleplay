import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getStripe, resolvePaymentsMode, creditPaidSession } from "@/lib/payments/service";

/**
 * POST /api/energy/confirm {sessionId}
 *
 * Fallback ของ webhook: เรียกตอนผู้ใช้กลับมาถึง /wallet?purchase=success&session_id=...
 * ฝั่ง server retrieve session จาก Stripe API เอง แล้วเครดิตถ้าจ่ายแล้ว —
 * ช่วยกรณี dev/local ที่ไม่มี public URL รับ webhook
 * (ถ้า webhook เครดิตไปแล้ว จะโดน idempotencyKey กันซ้ำ → credited=false)
 */

const confirmSchema = z.object({
  sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/, "รูปแบบ sessionId ไม่ถูกต้อง"),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    if (resolvePaymentsMode() !== "stripe") throw new ApiError("PAYMENTS_DISABLED");

    await enforceRateLimit("purchase", userId);
    const { sessionId } = confirmSchema.parse(await request.json());

    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const result = await creditPaidSession(
      {
        id: session.id,
        paymentStatus: session.payment_status,
        metadata: session.metadata,
      },
      userId
    );

    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
