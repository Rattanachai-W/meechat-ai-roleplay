import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

/** GET /api/energy/transactions?cursor=&limit= — ledger ของผู้ใช้ */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const sp = request.nextUrl.searchParams;
    const limitRaw = Number(sp.get("limit") ?? 20);
    const limit = Math.min(50, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
    const cursor = sp.get("cursor"); // iso|id

    let cursorWhere: Record<string, unknown> = {};
    if (cursor) {
      const [iso, id] = cursor.split("|");
      const createdAt = iso ? new Date(iso) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
        cursorWhere = {};
      } else {
        cursorWhere = {
          OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
        };
      }
    }

    const rows = await prisma.energyTransaction.findMany({
      where: { userId, ...cursorWhere },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return NextResponse.json({
      transactions: items.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        referenceType: t.referenceType,
        metadata: t.metadata,
        createdAt: t.createdAt.toISOString(),
      })),
      nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
