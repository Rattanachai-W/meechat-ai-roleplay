import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ username: string }> };

/** GET /api/creators/[username] — โปรไฟล์ + stats + ตัวละครสาธารณะ */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { username } = await context.params;
    const creator = await prisma.creatorProfile.findUnique({
      where: { username },
      include: {
        user: { select: { displayName: true, avatarUrl: true } },
        _count: { select: { characters: true, followers: true } },
      },
    });
    if (!creator) throw new ApiError("NOT_FOUND", "ไม่พบ creator");

    const characters = await prisma.character.findMany({
      where: { creatorId: creator.id, visibility: "PUBLIC" },
      orderBy: { chatCount: "desc" },
      take: 48,
      select: {
        id: true,
        name: true,
        slug: true,
        tagline: true,
        avatarUrl: true,
        chatCount: true,
        likeCount: true,
      },
    });

    return NextResponse.json({
      creator: {
        id: creator.id,
        username: creator.username,
        bio: creator.bio,
        avatarUrl: creator.avatarUrl,
        displayName: creator.user.displayName ?? creator.username,
        characterCount: creator._count.characters,
        followerCount: creator._count.followers,
      },
      characters,
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
