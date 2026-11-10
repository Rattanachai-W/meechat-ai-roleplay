import Stripe from "stripe";
import { z } from "zod";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { EnergyTransactionType } from "@/generated/prisma/client";
import type { AppLocale } from "@/i18n/routing";

/**
 * Payment service — Stripe Checkout (THB + USD)
 *
 * Energy remains the shared unit; currency only affects checkout price.
 */

export type ShopCurrency = "THB" | "USD";

export interface EnergyPackage {
  id: string;
  coins: number;
  priceThb: number;
  priceUsd: number;
  /** Thai label (also exposed as `label` for older callers) */
  label: string;
  labelEn: string;
}

export const ENERGY_PACKAGES: EnergyPackage[] = [
  {
    id: "coins_500",
    coins: 500,
    priceThb: 99,
    priceUsd: 2.99,
    label: "500 พลังงาน",
    labelEn: "500 energy",
  },
  {
    id: "coins_1200",
    coins: 1200,
    priceThb: 199,
    priceUsd: 5.99,
    label: "1,200 พลังงาน (โบนัส 20%)",
    labelEn: "1,200 energy (20% bonus)",
  },
  {
    id: "coins_3000",
    coins: 3000,
    priceThb: 449,
    priceUsd: 12.99,
    label: "3,000 พลังงาน (โบนัส 40%)",
    labelEn: "3,000 energy (40% bonus)",
  },
];

export function packageLabel(pkg: EnergyPackage, locale: AppLocale = "th"): string {
  return locale === "en" ? pkg.labelEn : pkg.label;
}

export function resolvePaymentsMode(): "off" | "mock" | "stripe" {
  if (process.env.PAYMENTS_ENABLED !== "true") return "off";
  if (process.env.PAYMENTS_MODE === "mock") return "mock";
  return env.STRIPE_SECRET_KEY ? "stripe" : "off";
}

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. ตั้งค่าใน .env ก่อนเปิดโหมดชำระเงินจริง (ดู .env.example)"
    );
  }
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

const checkoutMetadataSchema = z.object({
  userId: z.string().uuid(),
  packageId: z.string().trim().min(1).max(60),
  coins: z.coerce.number().int().min(1).max(100_000),
  currency: z.enum(["thb", "usd"]).optional(),
});

export type CheckoutMetadata = z.infer<typeof checkoutMetadataSchema>;

export function parseCheckoutMetadata(metadata: Record<string, string> | null | undefined): CheckoutMetadata {
  const parsed = checkoutMetadataSchema.safeParse(metadata ?? {});
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "ข้อมูล session จาก payment gateway ไม่ถูกต้อง");
  }
  return parsed.data;
}

export async function createEnergyCheckout(opts: {
  pkg: EnergyPackage;
  userId: string;
  origin: string;
  currency: ShopCurrency;
  locale: AppLocale;
}): Promise<{ sessionId: string; checkoutUrl: string }> {
  const stripe = getStripe();
  const currency = opts.currency === "USD" ? "usd" : "thb";
  const unitAmount =
    currency === "usd"
      ? Math.round(opts.pkg.priceUsd * 100)
      : opts.pkg.priceThb * 100;
  const label = packageLabel(opts.pkg, opts.locale);
  const localePath = `/${opts.locale}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    locale: opts.locale === "en" ? "en" : "th",
    // Leave payment methods to Stripe Dashboard (card + PromptPay when account enables them)
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: unitAmount,
          product_data: { name: `MeeChat — ${label}` },
        },
      },
    ],
    metadata: {
      userId: opts.userId,
      packageId: opts.pkg.id,
      coins: String(opts.pkg.coins),
      currency,
    },
    success_url: `${opts.origin}${localePath}/wallet?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.origin}${localePath}/wallet?purchase=cancelled`,
  });
  if (!session.url) {
    throw new ApiError("INTERNAL_ERROR", "สร้างหน้าชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
  return { sessionId: session.id, checkoutUrl: session.url };
}

interface CheckoutSessionLike {
  id: string;
  paymentStatus: string | null;
  metadata: Record<string, string> | null;
}

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
  // Dynamic import keeps unit tests free of Prisma/DATABASE_URL at module load
  const { grantEnergy } = await import("@/lib/energy/service");

  try {
    await grantEnergy({
      userId: meta.userId,
      amount: meta.coins,
      type: EnergyTransactionType.PURCHASE,
      idempotencyKey: `stripe:${session.id}`,
      referenceType: "purchase",
      referenceId: meta.packageId,
      metadata: { gateway: "stripe", sessionId: session.id, currency: meta.currency ?? "thb" },
    });
  } catch (error) {
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

export async function verifyStripeEvent(
  payload: string,
  signature: string,
  secret: string
): Promise<Stripe.Event> {
  try {
    return await Stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Stripe signature ไม่ถูกต้อง");
  }
}
