import { NextRequest } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { chatRequestSchema } from "@/lib/validation/chat";
import { prepareChat, createChatStream } from "@/lib/chat/pipeline";

/**
 * POST /api/chat — SSE stream
 *   event: delta  data: {"text":"..."}
 *   event: done   data: { messageId, content?, usage?, energy? }
 *   event: error  data: { code }
 *
 * error ก่อนเริ่ม stream (auth/validate/energy) → JSON error ปกติ
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = chatRequestSchema.parse(await request.json());

    const prepared = await prepareChat({
      userId,
      conversationId: body.conversationId,
      content: body.content,
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
