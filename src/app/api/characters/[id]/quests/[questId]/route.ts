import { NextResponse, NextRequest } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { isUuid } from "@/lib/utils";
import { deleteQuest, updateQuest } from "@/lib/quests/service";
import { questUpdateSchema } from "@/lib/validation/quest";

type RouteContext = { params: Promise<{ id: string; questId: string }> };

/** PATCH /api/characters/[id]/quests/[questId] — ครีเอเตอร์แก้ภารกิจของตัวละครตัวเอง */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id, questId } = await context.params;
    if (!isUuid(questId)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "ไม่พบภารกิจ" } },
        { status: 404 }
      );
    }
    void id; // ownership ตรวจที่ quest → character.creator (id ใช้เป็น path context)
    const input = questUpdateSchema.parse(await request.json());
    const quest = await updateQuest(questId, userId, input);
    return NextResponse.json({ quest });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/** DELETE /api/characters/[id]/quests/[questId] — ครีเอเตอร์ลบภารกิจ (progress cascade ตาม) */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { questId } = await context.params;
    if (!isUuid(questId)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "ไม่พบภารกิจ" } },
        { status: 404 }
      );
    }
    await deleteQuest(questId, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
