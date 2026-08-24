import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { submitCharacter } from "@/lib/creators/service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/characters/[id]/submit — ส่งเผยแพร่ (owner เท่านั้น)
 * DRAFT|REJECTED → PUBLISHED (AUTO_APPROVE) หรือ → PENDING (มีทีมตรวจ)
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("character-create", userId);
    const { id } = await context.params;
    const character = await submitCharacter(id, userId);
    return NextResponse.json({ character });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
