import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { personaUpdateSchema } from "@/lib/validation/persona";

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedPersona(id: string, userId: string) {
  const persona = await prisma.userPersona.findUnique({ where: { id } });
  if (!persona || persona.userId !== userId) throw new ApiError("NOT_FOUND", "ไม่พบ persona");
  return persona;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    await getOwnedPersona(id, userId);
    const body = personaUpdateSchema.parse(await request.json());

    const persona = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.userPersona.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.userPersona.update({ where: { id }, data: body });
    });
    return NextResponse.json({ persona });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    await getOwnedPersona(id, userId);
    // conversation.personaId เป็น SetNull — บทสนทนาเก่าไม่พัง
    await prisma.userPersona.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
