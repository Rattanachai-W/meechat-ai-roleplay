import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, jsonErrorResponseLocalized, requireUserId } from "@/lib/api/errors";

const bodySchema = z.object({
  action: z.enum(["request_kyc"]),
  note: z.string().trim().max(500).optional(),
});

/** POST — start payout readiness (manual KYC queue; no auto-withdraw yet) */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await request.json());

    const profile = await prisma.creatorProfile.findUnique({ where: { userId } });
    if (!profile) throw new ApiError("NOT_FOUND", "ยังไม่มีโปรไฟล์ครีเอเตอร์");

    if (body.action === "request_kyc") {
      if (profile.payoutStatus === "READY") {
        return NextResponse.json({ profile });
      }
      const updated = await prisma.creatorProfile.update({
        where: { id: profile.id },
        data: {
          payoutStatus: "PENDING_KYC",
          kycNote: body.note ?? "Awaiting manual KYC review",
        },
        select: {
          id: true,
          username: true,
          payoutStatus: true,
          payoutReadyAt: true,
          kycNote: true,
          totalEarned: true,
        },
      });
      return NextResponse.json({ profile: updated });
    }

    throw new ApiError("VALIDATION_ERROR");
  } catch (error) {
    return jsonErrorResponseLocalized(error);
  }
}
