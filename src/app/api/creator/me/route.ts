import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getStudioStats, upsertCreatorProfile } from "@/lib/creators/service";
import { creatorProfileSchema } from "@/lib/validation/creator";

/**
 * GET /api/creator/me — โปรไฟล์ครีเอเตอร์ของฉัน + สถิติ studio
 * (ยังไม่เคยสมัคร → profile: null ให้ UI เด้ง onboarding)
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const result = await getStudioStats(userId);
    return NextResponse.json({
      profile: result?.profile ?? null,
      stats: result?.stats ?? null,
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/** PATCH /api/creator/me — สมัครใหม่ (ต้องมี username) หรือแก้โปรไฟล์ */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("creator-profile", userId);
    const body = creatorProfileSchema.parse(await request.json());
    const profile = await upsertCreatorProfile(userId, body);
    return NextResponse.json({ profile });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
