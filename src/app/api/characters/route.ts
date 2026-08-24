import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { listCharacters, searchCharacters, type CharacterSort } from "@/lib/characters/queries";
import { createCharacter } from "@/lib/characters/mutations";
import { characterInputSchema } from "@/lib/validation/character";
import { enforceRateLimit } from "@/lib/rate-limit";

/** GET /api/characters — list public + filters q/sort/tag/cursor */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim();

    if (q) {
      const items = await searchCharacters(q);
      return NextResponse.json({ items, nextCursor: null });
    }

    const sortParam = sp.get("sort");
    const sort: CharacterSort =
      sortParam === "new" || sortParam === "popular" || sortParam === "trending" ? sortParam : "trending";

    const result = await listCharacters({
      sort,
      tag: sp.get("tag") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/** POST /api/characters — สร้างตัวละคร (ต้อง login, auto creator profile)
 *  body.publish=true = เผยแพร่ทันที (AUTO_APPROVE=false → เข้าคิว PENDING) */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("character-create", userId);
    const body = characterInputSchema.parse(await request.json());
    const character = await createCharacter(userId, body, { publish: body.publish });
    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
