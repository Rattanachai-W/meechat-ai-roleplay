import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { toggleLike } from "@/lib/characters/mutations";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/characters/[id]/like — toggle like */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const result = await toggleLike(userId, id);
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
