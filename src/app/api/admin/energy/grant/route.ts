import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { grantEnergy } from "@/lib/energy/service";
import { EnergyTransactionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

const grantSchema = z.object({
  targetUserId: z.string().uuid().optional(),
  email: z.string().trim().email().optional(),
  amount: z.number().int().min(1).max(100_000),
  note: z.string().trim().max(200).optional(),
});

/**
 * POST /api/admin/energy/grant — เติมพลังงานให้ user (support/compensation)
 * ADMIN_ADJUSTMENT → free_balance + ledger; guard role=ADMIN
 */
export async function POST(request: NextRequest) {
  try {
    const adminId = await requireUserId();
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    if (!admin || admin.role !== "ADMIN") throw new ApiError("FORBIDDEN", "เฉพาะผู้ดูแลระบบ");

    const body = grantSchema.parse(await request.json());
    if (!body.targetUserId && !body.email) {
      throw new ApiError("VALIDATION_ERROR", "ระบุ targetUserId หรือ email");
    }

    const target = body.targetUserId
      ? await prisma.user.findUnique({ where: { id: body.targetUserId }, select: { id: true } })
      : await prisma.user.findUnique({ where: { email: body.email! }, select: { id: true } });
    if (!target) throw new ApiError("NOT_FOUND", "ไม่พบผู้ใช้เป้าหมาย");

    await grantEnergy({
      userId: target.id,
      amount: body.amount,
      type: EnergyTransactionType.ADMIN_ADJUSTMENT,
      // idempotency key ต่อ request — admin กดซ้ำ = ตั้งใจจ่ายซ้ำ (ไม่ dedupe)
      idempotencyKey: `admin-grant:${adminId}:${target.id}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      referenceType: "admin_grant",
      metadata: { byAdmin: adminId, note: body.note ?? null },
    });

    return NextResponse.json({ granted: true, userId: target.id, amount: body.amount });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
