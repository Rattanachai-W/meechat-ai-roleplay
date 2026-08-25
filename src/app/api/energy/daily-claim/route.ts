import { NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { claimDailyReward, getDailyClaimStatus } from "@/lib/energy/service";

/**
 * GET /api/energy/daily-claim — สถานะปุ่มรับรางวัลรายวัน (ไม่เคลม)
 * { claimedToday, amount } — amount อ่านจาก app_settings (แอดมินปรับใน DB ได้)
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await getDailyClaimStatus(userId));
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/** POST /api/energy/daily-claim — รับพลังงานรายวัน (idempotent ต่อวัน) */
export async function POST() {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("daily-claim", userId);
    const result = await claimDailyReward(userId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
