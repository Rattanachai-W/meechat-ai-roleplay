import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, jsonErrorResponseLocalized, requireUserId } from "@/lib/api/errors";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
        timezone: true,
        preferredCurrency: true,
        createdAt: true,
        personas: {
          select: {
            id: true,
            name: true,
            gender: true,
            age: true,
            description: true,
            isDefault: true,
            createdAt: true,
          },
        },
        conversations: {
          select: {
            id: true,
            title: true,
            characterId: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 500,
        },
        creator: {
          select: { username: true, totalEarned: true, payoutStatus: true },
        },
      },
    });
    if (!user) throw new ApiError("NOT_FOUND");

    return NextResponse.json(
      { exportedAt: new Date().toISOString(), user },
      {
        headers: {
          "Content-Disposition": `attachment; filename="meechat-export-${userId}.json"`,
        },
      }
    );
  } catch (error) {
    return jsonErrorResponseLocalized(error);
  }
}
