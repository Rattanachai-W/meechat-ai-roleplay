import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { createConversationSchema } from "@/lib/validation/chat";

/** GET /api/conversations?characterId= — บทสนทนาของผู้ใช้ */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const characterId = request.nextUrl.searchParams.get("characterId");
    const conversations = await prisma.conversation.findMany({
      where: { userId, ...(characterId ? { characterId } : {}) },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: {
        character: {
          select: {
            id: true,
            name: true,
            slug: true,
            avatarUrl: true,
            creator: { select: { username: true } },
          },
        },
      },
    });
    return NextResponse.json({ conversations });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/**
 * POST /api/conversations — เริ่มบทสนทนาใหม่
 * สร้าง assistant message แรกจาก character.firstMessage ให้ทันที
 * (+1 chat_count ของตัวละคร)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createConversationSchema.parse(await request.json());

    const character = await prisma.character.findUnique({
      where: { id: body.characterId },
      select: {
        id: true,
        name: true,
        firstMessage: true,
        visibility: true,
        status: true,
        creator: { select: { userId: true } },
      },
    });
    if (!character) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");

    const isOwner = character.creator.userId === userId;
    // PRIVATE ต้องเป็นเจ้าของเท่านั้น
    if (character.visibility === "PRIVATE" && !isOwner) {
      throw new ApiError("FORBIDDEN", "ตัวละครนี้เป็นส่วนตัว");
    }
    // draft/pending/rejected เจ้าของทดสอบเองได้อย่างเดียว
    if (character.status !== "PUBLISHED" && !isOwner) {
      throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");
    }

    // persona ต้องเป็นของผู้ใช้ถ้าระบุมา
    if (body.personaId) {
      const persona = await prisma.userPersona.findUnique({ where: { id: body.personaId } });
      if (!persona || persona.userId !== userId) {
        throw new ApiError("VALIDATION_ERROR", "persona ไม่ถูกต้อง");
      }
    }

    const conversation = await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          userId,
          characterId: character.id,
          personaId: body.personaId ?? null,
          title: body.title ?? character.name,
        },
      });
      await tx.message.create({
        data: {
          conversationId: created.id,
          role: "ASSISTANT",
          content: character.firstMessage,
        },
      });
      await tx.character.update({
        where: { id: character.id },
        data: { chatCount: { increment: 1 } },
      });
      return created;
    });

    return NextResponse.json({ conversation: { id: conversation.id } }, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
