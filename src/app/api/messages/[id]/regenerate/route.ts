import { NextRequest } from "next/server";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";
import { prepareChat, createChatStream } from "@/lib/chat/pipeline";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/messages/[id]/regenerate — สร้าง variant ใหม่ของ assistant message (SSE)
 * event/delta/done/error เดียวกับ /api/chat
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    if (!isUuid(id)) throw new ApiError("NOT_FOUND", "ไม่พบข้อความ");

    const message = await prisma.message.findUnique({
      where: { id },
      select: { conversationId: true },
    });
    if (!message) throw new ApiError("NOT_FOUND", "ไม่พบข้อความ");

    const prepared = await prepareChat({
      userId,
      conversationId: message.conversationId,
      regenerateMessageId: id,
    });
    prepared.signal = request.signal;

    return new Response(createChatStream(prepared), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
