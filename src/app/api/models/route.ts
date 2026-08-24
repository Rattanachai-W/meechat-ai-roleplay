import { NextResponse } from "next/server";
import { jsonErrorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

/** GET /api/models — รายการโมเดลที่เปิดใช้งาน (public read) */
export async function GET() {
  try {
    const models = await prisma.aiModel.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
      select: {
        modelKey: true,
        displayName: true,
        energyMultiplier: true,
        isPremiumOnly: true,
      },
    });
    return NextResponse.json({ models });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
