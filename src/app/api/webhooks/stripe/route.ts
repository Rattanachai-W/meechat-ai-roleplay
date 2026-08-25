import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { jsonErrorResponse } from "@/lib/api/errors";
import { creditPaidSession, verifyStripeEvent } from "@/lib/payments/service";

/**
 * POST /api/webhooks/stripe — Stripe webhook endpoint (production primary path)
 *
 * ตั้งค่าที่ Stripe Dashboard → Developers → Webhooks:
 *   endpoint = https://<domain>/api/webhooks/stripe
 *   event    = checkout.session.completed
 *   secret   → STRIPE_WEBHOOK_SECRET ใน env ของ deployment
 *
 * ต้องอ่าน raw body (request.text()) เพราะ signature sign บน payload ดิบ —
 * ห้าม parse JSON ก่อน verify; ปลอดภัยเพราะเครดิตซ้ำไม่ได้ (idempotencyKey unique)
 */
export async function POST(request: NextRequest) {
  try {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    const signature = request.headers.get("stripe-signature");
    if (!secret || !signature) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Webhook ยังไม่ได้ตั้งค่า STRIPE_WEBHOOK_SECRET" } },
        { status: 400 }
      );
    }

    const payload = await request.text();
    const event = await verifyStripeEvent(payload, signature, secret);

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as {
        id: string;
        payment_status: string | null;
        metadata: Record<string, string> | null;
      };
      // event มาจาก Stripe โดยตรง → ไม่ต้องเช็ค expectingUserId
      const result = await creditPaidSession({
        id: s.id,
        paymentStatus: s.payment_status,
        metadata: s.metadata,
      });
      console.info(
        `[stripe-webhook] checkout.session.completed ${s.id} credited=${result.credited} coins=${result.coins}`
      );
    }

    // event อื่น ๆ (payment_intent.*, charge.*) ยังไม่ใช้ — ack รับไว้กัน retry
    return NextResponse.json({ received: true });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

// ห้าม cache/buffer body — webhook ต้องได้ raw payload
export const dynamic = "force-dynamic";
