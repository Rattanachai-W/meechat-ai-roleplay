import Stripe from "stripe";
import { z } from "zod";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { grantEnergy } from "@/lib/energy/service";
import { EnergyTransactionType } from "@/generated/prisma/client";

/**
 * Payment service — Stripe Checkout (docs/creator-system.md §5)
 *
 * โหมดชำระเงิน (resolvePaymentsMode):
 * - off    : PAYMENTS_ENABLED ไม่ใช่ "true" หรือไม่มี STRIPE_SECRET_KEY → POST เติมเงิน 503
 * - mock   : PAYMENTS_ENABLED=true + PAYMENTS_MODE=mock → credit ทันที (dev/E2E ไม่มีเงินจริง)
 * - stripe : PAYMENTS_ENABLED=true + STRIPE_SECRET_KEY → Stripe Checkout redirect
 *
 * Flow เงินจริง: สร้าง Checkout Session (metadata = userId/packageId/coins)
 * → credit "เฉพาะตอนจ่ายแล้ว" จาก 2 ทางพร้อมกันได้ปลอดภัย:
 *   1) webhook checkout.session.completed (production — primary)
 *   2) ผู้ใช้กลับมาถึง /wallet?purchase=success&session_id=... → POST /api/energy/confirm
 *      ไป retrieve session กับ Stripe เอง (fallback กรณี dev/local ไม่มี webhook)
 * ทั้งสองทางใช้ idempotencyKey = `stripe:{sessionId}` เดียวกัน (unique ใน ledger)
 * → ซ้ำกันแค่ไหนก็เครดิตครั้งเดียว
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

export function resolvePaymentsMode(): "off" | "mock" | "stripe" {
  if (process.env.PAYMENTS_ENABLED !== "true") return "off";
  if (process.env.PAYMENTS_MODE === "mock") return "mock";
  return env.STRIPE_SECRET_KEY ? "stripe" : "off";
}

let stripeClient: Stripe | null = null;

/** lazy init — เรียกเมื่อรู้ว่า mode เป็น stripe แล้วเท่านั้น */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. ตั้งค่าใน .env ก่อนเปิดโหมดชำระเงินจริง (ดู .env.example)"
    );
  }
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

// ── metadata ของ Checkout Session ──

const checkoutMetadataSchema = z.object({
  userId: z.string().uuid(),
  packageId: z.string().trim().min(1).max(60),
  coins: z.coerce.number().int().min(1).max(100_000),
});

export type CheckoutMetadata = z.infer<typeof checkoutMetadataSchema>;

export function parseCheckoutMetadata(metadata: Record<string, string> | null | undefined): CheckoutMetadata {
  const parsed = checkoutMetadataSchema.safeParse(metadata ?? {});
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "ข้อมูล session จาก payment gateway ไม่ถูกต้อง");
  }
  return parsed.data;
}

// ── สร้าง Checkout Session ──

/** คืน url สำหรับ redirect ผู้ใช้ไปหน้าชำระเงินของ Stripe */
export async function createEnergyCheckout(opts: {
  pkg: EnergyPackage;
  userId: string;
  origin: string;
}): Promise<{ sessionId: string; checkoutUrl: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    locale: "th",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "thb",
          unit_amount: opts.pkg.priceThb * 100,
          product_data: { name: `MeeChat — ${opts.pkg.label}` },
        },
      },
    ],
    // snapshot coins ตอนซื้อไว้ใน metadata — แก้ catalog ทีหลังไม่กระทบ session เก่า
    metadata: {
      userId: opts.userId,
      packageId: opts.pkg.id,
      coins: String(opts.pkg.coins),
    },
    success_url: `${opts.origin}/wallet?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.origin}/wallet?purchase=cancelled`,
  });
  if (!session.url) {
    throw new ApiError("INTERNAL_ERROR", "สร้างหน้าชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
  return { sessionId: session.id, checkoutUrl: session.url };
}

// ── เครดิตพลังงานหลังจ่ายเงิน (idempotent) ──

interface CheckoutSessionLike {
  id: string;
  /** Stripe payment_status: "paid" | "unpaid" | "no_payment_required" */
  paymentStatus: string | null;
  metadata: Record<string, string> | null;
}

/**
 * เครดิตพลังงานจาก session ที่จ่ายแล้ว — idempotent ผ่าน ledger unique key
 * @param expectingUserId ถ้าระบุ (confirm path) ต้องเป็นเจ้าของ session เท่านั้น;
 *        webhook path ส่ง undefined เพราะ event มาจาก Stripe โดยตรง
 * @returns credited=false เมื่อเครดิตไปแล้วก่อนหน้า (P2002 ที่ idempotencyKey)
 */
export async function creditPaidSession(
  session: CheckoutSessionLike,
  expectingUserId?: string
): Promise<{ credited: boolean; coins: number }> {
  if (expectingUserId) {
    const meta = parseCheckoutMetadata(session.metadata);
    if (meta.userId !== expectingUserId) throw new ApiError("FORBIDDEN");
  }
  if (session.paymentStatus !== "paid" && session.paymentStatus !== "no_payment_required") {
    throw new ApiError("PAYMENT_FAILED");
  }
  const meta = parseCheckoutMetadata(session.metadata);

  try {
    await grantEnergy({
      userId: meta.userId,
      amount: meta.coins,
      type: EnergyTransactionType.PURCHASE,
      idempotencyKey: `stripe:${session.id}`,
      referenceType: "purchase",
      referenceId: meta.packageId,
      metadata: { gateway: "stripe", sessionId: session.id },
    });
  } catch (error) {
    // P2002 = webhook/confirm ใครสักฝ่ายเครดิตไปแล้ว — ถือว่าสำเร็จอยู่แล้ว
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { credited: false, coins: meta.coins };
    }
    throw error;
  }
  return { credited: true, coins: meta.coins };
}

// ── Webhook signature ──

/** verify header `stripe-signature` กับ raw body — ผิดทุกกรณี = VALIDATION_ERROR */
export async function verifyStripeEvent(
  payload: string,
  signature: string,
  secret: string
): Promise<Stripe.Event> {
  try {
    // static method — verify ด้วย webhook secret อย่างเดียว ไม่ต้องมี API key
    // constructEventAsync = รองรับ web crypto ที่ runtime ไม่มี node:crypto แบบ sync
    return await Stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Stripe signature ไม่ถูกต้อง");
  }
}
