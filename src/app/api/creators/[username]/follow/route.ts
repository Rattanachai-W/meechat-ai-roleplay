import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ username: string }> };

/** POST /api/creators/[username]/follow — toggle follow */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { username } = await context.params;

    const creator = await prisma.creatorProfile.findUnique({
      where: { username },
      select: { id: true, userId: true },
    });
    if (!creator) throw new ApiError("NOT_FOUND", "ไม่พบ creator");
    if (creator.userId === userId) throw new ApiError("VALIDATION_ERROR", "ติดตามตัวเองไม่ได้");

    const existing = await prisma.creatorFollow.findUnique({
      where: { userId_creatorId: { userId, creatorId: creator.id } },
    });

    if (existing) {
      await prisma.creatorFollow.delete({
        where: { userId_creatorId: { userId, creatorId: creator.id } },
      });
      return NextResponse.json({ following: false });
    }
    await prisma.creatorFollow.create({ data: { userId, creatorId: creator.id } });
    return NextResponse.json({ following: true });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
