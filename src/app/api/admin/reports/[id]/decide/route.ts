import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, jsonErrorResponseLocalized, requireUserId } from "@/lib/api/errors";

const decideSchema = z.object({
  status: z.enum(["RESOLVED", "DISMISSED", "REVIEWING"]),
  adminNote: z.string().trim().max(1000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (me?.role !== "ADMIN") throw new ApiError("FORBIDDEN");

    const { id } = await context.params;
    const body = decideSchema.parse(await request.json());

    const report = await prisma.report.update({
      where: { id },
      data: {
        status: body.status,
        adminNote: body.adminNote,
        resolvedAt: body.status === "RESOLVED" || body.status === "DISMISSED" ? new Date() : null,
      },
      select: { id: true, status: true, resolvedAt: true },
    });

    return NextResponse.json({ report });
  } catch (error) {
    return jsonErrorResponseLocalized(error);
  }
}
