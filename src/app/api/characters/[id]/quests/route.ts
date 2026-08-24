import { NextResponse, NextRequest } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { getCharacterDetail } from "@/lib/characters/queries";
import { isUuid } from "@/lib/utils";
import {
  createQuest,
  getAffinitySummary,
  getQuestsWithProgress,
} from "@/lib/quests/service";
import { questInputSchema } from "@/lib/validation/quest";
import { enforceRateLimit } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/characters/[id]/quests — ภารกิจของตัวละคร + progress ของผู้ใช้
 * (auto-create default ครั้งแรก) + ค่าความสนิทปัจจุบัน
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "ไม่พบตัวละคร" } },
        { status: 404 }
      );
    }

    // reuse visibility rules เดียวกับหน้า detail (owner เห็นทุกสถานะ, คนอื่นเฉพาะ PUBLISHED)
    const detail = await getCharacterDetail(id, userId);
    if (!detail) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "ไม่พบตัวละคร" } },
        { status: 404 }
      );
    }

    const [quests, affinity] = await Promise.all([
      getQuestsWithProgress(userId, detail.character.id),
      getAffinitySummary(userId, detail.character.id),
    ]);
    return NextResponse.json({ quests, affinity });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/** POST /api/characters/[id]/quests — ครีเอเตอร์เพิ่มภารกิจให้ตัวละครตัวเอง (สูงสุด 10) */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("quest-write", userId);
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "ไม่พบตัวละคร" } },
        { status: 404 }
      );
    }
    const input = questInputSchema.parse(await request.json());
    const quest = await createQuest(id, userId, input);
    return NextResponse.json({ quest }, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
