import { NextResponse, NextRequest } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { isUuid } from "@/lib/utils";
import { claimQuestReward } from "@/lib/quests/service";

type RouteContext = { params: Promise<{ questId: string }> };

/**
 * POST /api/quests/[questId]/claim — รับรางวัลภารกิจ (idempotent ต่อ user+quest)
 * 400 VALIDATION_ERROR ถ้ายังไม่สำเร็จหรือรับไปแล้ว · 404 ถ้าไม่พบ quest
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { questId } = await context.params;
    if (!isUuid(questId)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "ไม่พบภารกิจ" } },
        { status: 404 }
      );
    }

    const result = await claimQuestReward(userId, questId);
    return NextResponse.json({
      claimed: true,
      amount: result.amount,
      affinity: result.affinity,
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
