import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, jsonErrorResponseLocalized, requireUser } from "@/lib/api/errors";
import { auth } from "@/lib/auth/auth";

const bodySchema = z.object({
  confirm: z.literal("DELETE"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    bodySchema.parse(await request.json());

    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: user.id } }).catch(() => null);
      await tx.authUser.delete({ where: { id: user.id } }).catch(() => null);
    });

    await auth.api.signOut({ headers: await headers() }).catch(() => null);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof ApiError) return jsonErrorResponseLocalized(error);
    return jsonErrorResponseLocalized(error);
  }
}
