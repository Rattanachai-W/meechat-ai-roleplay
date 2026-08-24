import { NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { getOrCreateWalletSummary } from "@/lib/energy/service";

/** GET /api/energy/wallet — ยอดพลังงานปัจจุบัน */
export async function GET() {
  try {
    const userId = await requireUserId();
    const wallet = await getOrCreateWalletSummary(userId);
    return NextResponse.json({ wallet });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
