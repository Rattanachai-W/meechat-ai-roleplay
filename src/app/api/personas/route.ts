import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { personaInputSchema } from "@/lib/validation/persona";

/** GET /api/personas — persona ทั้งหมดของผู้ใช้ */
export async function GET() {
  try {
    const userId = await requireUserId();
    const personas = await prisma.userPersona.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ personas });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/** POST /api/personas — สร้าง persona (ตัวแรกเป็น default อัตโนมัติ) */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = personaInputSchema.parse(await request.json());

    const count = await prisma.userPersona.count({ where: { userId } });
    const persona = await prisma.$transaction(async (tx) => {
      if (body.isDefault || count === 0) {
        await tx.userPersona.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.userPersona.create({
        data: { ...body, isDefault: body.isDefault || count === 0, userId },
      });
    });
    return NextResponse.json({ persona }, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
