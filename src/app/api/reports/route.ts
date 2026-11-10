import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, jsonErrorResponseLocalized, requireUserId } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

const reportSchema = z.object({
  targetType: z.enum(["CHARACTER", "MESSAGE", "CREATOR"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3).max(200),
  details: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("report", userId);
    const body = reportSchema.parse(await request.json());

    const report = await prisma.report.create({
      data: {
        reporterId: userId,
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        details: body.details,
      },
      select: { id: true, status: true, createdAt: true },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return jsonErrorResponseLocalized(error);
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (me?.role !== "ADMIN") throw new ApiError("FORBIDDEN");

    const reports = await prisma.report.findMany({
      where: { status: { in: ["OPEN", "REVIEWING"] } },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        reporter: { select: { email: true, displayName: true } },
      },
    });
    return NextResponse.json({ reports });
  } catch (error) {
    return jsonErrorResponseLocalized(error);
  }
}
