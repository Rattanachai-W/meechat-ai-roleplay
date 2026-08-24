import { NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { claimDailyReward } from "@/lib/energy/service";

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
