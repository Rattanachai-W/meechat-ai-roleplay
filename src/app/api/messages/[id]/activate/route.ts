import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/messages/[id]/activate — เลือก variant ให้เป็นตัวที่ active
 * (บทสนทนาถัดไปจะอ้าง context จาก variant นี้)
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    if (!isUuid(id)) throw new ApiError("NOT_FOUND", "ไม่พบ variant");

    const target = await prisma.message.findUnique({
      where: { id },
      select: { id: true, parentMessageId: true, role: true, conversationId: true },
    });
    if (!target || target.role !== "ASSISTANT" || !target.parentMessageId) {
      throw new ApiError("NOT_FOUND", "ไม่พบ variant");
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: target.conversationId },
      select: { userId: true },
    });
    if (!conversation || conversation.userId !== userId) throw new ApiError("FORBIDDEN");

    await prisma.$transaction([
      prisma.message.updateMany({
        where: { parentMessageId: target.parentMessageId, role: "ASSISTANT" },
        data: { isActiveVariant: false },
      }),
      prisma.message.update({ where: { id }, data: { isActiveVariant: true } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
