import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { decideCharacter } from "@/lib/creators/service";
import { isUuid } from "@/lib/utils";

type RouteContext = { params: Promise<{ id: string }> };

const decideSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/admin/characters/[id]/decide — admin อนุมัติ/ปฏิเสธตัวละครที่ PENDING
 * promote ใครเป็น ADMIN: update users set role='ADMIN' where email='...' (docs/creator-system.md §6)
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    if (!isUuid(id)) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");
    const body = decideSchema.parse(await request.json());
    const character = await decideCharacter(userId, id, body.approve, body.note);
    return NextResponse.json({ character });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
