import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponseLocalized, requireUserId, ApiError } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { grantEnergy } from "@/lib/energy/service";
import { EnergyTransactionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveRequestLocale } from "@/lib/i18n/locale";
import {
  ENERGY_PACKAGES,
  createEnergyCheckout,
  packageLabel,
  resolvePaymentsMode,
  type ShopCurrency,
} from "@/lib/payments/service";

const purchaseSchema = z.object({
  packageId: z.string().trim().min(1).max(60),
  currency: z.enum(["THB", "USD"]).optional(),
});

export async function GET() {
  const mode = resolvePaymentsMode();
  const locale = await resolveRequestLocale();
  return NextResponse.json({
    packages: ENERGY_PACKAGES.map((pkg) => ({
      ...pkg,
      label: packageLabel(pkg, locale),
    })),
    paymentsEnabled: mode !== "off",
    mode: mode === "off" ? null : mode,
  });
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("purchase", userId);
    const body = purchaseSchema.parse(await request.json());
    const pkg = ENERGY_PACKAGES.find((p) => p.id === body.packageId);
    if (!pkg) throw new ApiError("NOT_FOUND", "ไม่พบแพ็กเกจนี้");

    const mode = resolvePaymentsMode();
    if (mode === "off") throw new ApiError("PAYMENTS_DISABLED");

    const prefs = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredCurrency: true, preferredLocale: true },
    });
    const currency: ShopCurrency =
      body.currency ?? (prefs?.preferredCurrency === "USD" ? "USD" : "THB");
    const locale = prefs?.preferredLocale === "en" ? "en" : "th";

    if (mode === "stripe") {
      const origin = request.headers.get("origin") ?? new URL(request.url).origin;
      const checkout = await createEnergyCheckout({
        pkg,
        userId,
        origin,
        currency,
        locale,
      });
      return NextResponse.json({
        checkoutUrl: checkout.checkoutUrl,
        sessionId: checkout.sessionId,
        mode,
        currency,
      });
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
      metadata: {
        priceThb: pkg.priceThb,
        priceUsd: pkg.priceUsd,
        currency,
        gateway: "mock",
      },
    });

    return NextResponse.json({
      purchased: true,
      packageId: pkg.id,
      coins: pkg.coins,
      mode,
      currency,
    });
  } catch (error) {
    return jsonErrorResponseLocalized(error);
  }
}

export const dynamic = "force-dynamic";
