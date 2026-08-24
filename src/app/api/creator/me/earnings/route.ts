import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { listMyEarnings } from "@/lib/creators/service";

/** GET /api/creator/me/earnings?cursor=&limit= — ledger รายได้ครีเอเตอร์ */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const sp = request.nextUrl.searchParams;
    const limitRaw = Number(sp.get("limit") ?? 30);
    const limit = Math.min(60, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 30));
    const result = await listMyEarnings(userId, limit, sp.get("cursor") ?? undefined);
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
