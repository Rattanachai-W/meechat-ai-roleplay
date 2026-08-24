import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId, ApiError } from "@/lib/api/errors";
import { listMyCharacters } from "@/lib/creators/service";
import { CharacterStatus } from "@/generated/prisma/client";

const STATUSES = new Set<string>(["DRAFT", "PENDING", "PUBLISHED", "REJECTED"]);

/** GET /api/creator/me/characters?status= — ตัวละครของฉันทุกสถานะ */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const statusParam = request.nextUrl.searchParams.get("status");
    let status: CharacterStatus | undefined;
    if (statusParam) {
      if (!STATUSES.has(statusParam)) throw new ApiError("VALIDATION_ERROR", "status ไม่ถูกต้อง");
      status = statusParam as CharacterStatus;
    }
    const characters = await listMyCharacters(userId, status);
    return NextResponse.json({ characters });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
