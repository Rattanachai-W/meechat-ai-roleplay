import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/conversations/[id]/messages?cursor=&limit=
 * cursor pagination เรียงใหม่ → เก่า, คืน nextCursor (createdAt iso + id)
 * client render โดย reverse เป็นเก่า → ใหม่
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    if (!isUuid(id)) throw new ApiError("NOT_FOUND", "ไม่พบบทสนทนา");

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!conversation || conversation.userId !== userId) {
      throw new ApiError("NOT_FOUND", "ไม่พบบทสนทนา");
    }

    const sp = request.nextUrl.searchParams;
    // Number("abc") → NaN ทำให้ prisma take พัง — clamp เฉพาะค่าที่เป็น finite number
    const limitRaw = Number(sp.get("limit") ?? 30);
    const limit = Math.min(60, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 30));
    const cursorParam = sp.get("cursor"); // format: <isoCreatedAt>|<id>

    let cursorWhere: Record<string, unknown> = {};
    if (cursorParam) {
      const [iso, messageId] = cursorParam.split("|");
      const createdAt = iso ? new Date(iso) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime()) || !messageId) {
        throw new ApiError("VALIDATION_ERROR", "cursor ไม่ถูกต้อง");
      }
      cursorWhere = {
        OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: messageId } }],
      };
    }

    const rows = await prisma.message.findMany({
      where: { conversationId: id, isActiveVariant: true, ...cursorWhere },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        role: true,
        content: true,
        parentMessageId: true,
        variantIndex: true,
        isActiveVariant: true,
        status: true,
        createdAt: true,
      },
    });

    // จำนวน variant ทั้งหมดของแต่ละ parent (ไว้ทำ UI สลับ regenerate)
    const variantGroups = await prisma.message.groupBy({
      by: ["parentMessageId"],
      where: { conversationId: id, role: "ASSISTANT", parentMessageId: { not: null } },
      _count: { _all: true },
    });
    const variantCounts: Record<string, number> = {};
    for (const g of variantGroups) {
      if (g.parentMessageId) variantCounts[g.parentMessageId] = g._count._all;
    }

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return NextResponse.json({
      messages: items.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      variantCounts,
      nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
