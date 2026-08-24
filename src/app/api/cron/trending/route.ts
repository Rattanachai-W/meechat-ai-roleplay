import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

/**
 * GET /api/cron/trending — recompute growth-weighted trending score
 *
 * score = conversations(7d)×3 + likes(7d)×5 + favorites(7d)×10
 * วัดการเติบโตล่าสุด ไม่ใช่ยอดรวมตลอดกาล (ตาม spec §trending)
 *
 * Vercel Cron เรียกทุกชั่วโมง (vercel.json); ถ้าตั้ง CRON_SECRET
 * จะต้องส่ง header `Authorization: Bearer <secret>` เท่านั้น
 */
export async function GET(request: NextRequest) {
  try {
    const secret = env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: { code: "FORBIDDEN", message: "unauthorized" } }, { status: 403 });
      }
    }

    const updated = await prisma.$executeRaw`
      update characters c set trend_score = coalesce(s.score, 0), trend_updated_at = now()
      from (
        select ch.id,
          (coalesce(c7.n, 0) * 3 + coalesce(l7.n, 0) * 5 + coalesce(f7.n, 0) * 10)::float8 as score
        from characters ch
        left join (
          select character_id, count(*)::int n from conversations
          where created_at > now() - interval '7 days' group by 1
        ) c7 on c7.character_id = ch.id
        left join (
          select character_id, count(*)::int n from character_likes
          where created_at > now() - interval '7 days' group by 1
        ) l7 on l7.character_id = ch.id
        left join (
          select character_id, count(*)::int n from favorites
          where created_at > now() - interval '7 days' group by 1
        ) f7 on f7.character_id = ch.id
      ) s
      where s.id = c.id`;

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error("[cron/trending]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "trending recompute failed" } },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
