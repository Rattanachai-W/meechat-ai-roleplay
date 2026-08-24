import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/messages/[id]/variants — ข้อความพี่น้องทั้งหมดของ assistant message
 * (ใช้ใน UI สลับ regenerate variant) id ที่ส่งมา = ข้อความ active ปัจจุบัน
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    if (!isUuid(id)) throw new ApiError("NOT_FOUND", "ไม่พบข้อความ");

    const target = await prisma.message.findUnique({
      where: { id },
      select: { parentMessageId: true, conversationId: true, role: true },
    });
    if (!target || target.role !== "ASSISTANT") throw new ApiError("NOT_FOUND", "ไม่พบข้อความ");

    const conversation = await prisma.conversation.findUnique({
      where: { id: target.conversationId },
      select: { userId: true },
    });
    if (!conversation || conversation.userId !== userId) throw new ApiError("FORBIDDEN");

    const siblings = target.parentMessageId
      ? await prisma.message.findMany({
          where: { parentMessageId: target.parentMessageId, role: "ASSISTANT" },
          orderBy: { variantIndex: "asc" },
          select: {
            id: true,
            content: true,
            variantIndex: true,
            isActiveVariant: true,
            status: true,
          },
        })
      : [];

    return NextResponse.json({ variants: siblings });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
