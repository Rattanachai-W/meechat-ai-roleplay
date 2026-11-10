import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, jsonErrorResponseLocalized, requireUserId } from "@/lib/api/errors";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import { isAppLocale } from "@/i18n/routing";

const prefsSchema = z.object({
  preferredLocale: z.enum(["th", "en"]).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  preferredCurrency: z.enum(["THB", "USD"]).optional(),
  matureConfirmed: z.boolean().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        preferredLocale: true,
        timezone: true,
        preferredCurrency: true,
        matureConfirmedAt: true,
      },
    });
    if (!user) throw new ApiError("NOT_FOUND");
    return NextResponse.json({
      preferredLocale: user.preferredLocale,
      timezone: user.timezone,
      preferredCurrency: user.preferredCurrency,
      matureConfirmed: Boolean(user.matureConfirmedAt),
    });
  } catch (error) {
    return jsonErrorResponseLocalized(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = prefsSchema.parse(await request.json());

    const data: {
      preferredLocale?: "th" | "en";
      timezone?: string;
      preferredCurrency?: "THB" | "USD";
      matureConfirmedAt?: Date;
    } = {};

    if (body.preferredLocale) data.preferredLocale = body.preferredLocale;
    if (body.timezone) data.timezone = body.timezone;
    if (body.preferredCurrency) data.preferredCurrency = body.preferredCurrency;
    if (body.matureConfirmed === true) data.matureConfirmedAt = new Date();

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        preferredLocale: true,
        timezone: true,
        preferredCurrency: true,
        matureConfirmedAt: true,
      },
    });

    const res = NextResponse.json({
      preferredLocale: user.preferredLocale,
      timezone: user.timezone,
      preferredCurrency: user.preferredCurrency,
      matureConfirmed: Boolean(user.matureConfirmedAt),
    });

    if (body.preferredLocale && isAppLocale(body.preferredLocale)) {
      res.cookies.set(LOCALE_COOKIE, body.preferredLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }

    return res;
  } catch (error) {
    return jsonErrorResponseLocalized(error);
  }
}
