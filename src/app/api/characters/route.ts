import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponseLocalized, requireUserId } from "@/lib/api/errors";
import {
  listCharacters,
  searchCharacters,
  type CharacterLanguageFilter,
  type CharacterSort,
} from "@/lib/characters/queries";
import { createCharacter } from "@/lib/characters/mutations";
import { characterInputSchema } from "@/lib/validation/character";
import { enforceRateLimit } from "@/lib/rate-limit";

function parseLanguage(raw: string | null): CharacterLanguageFilter | undefined {
  if (raw === "TH" || raw === "EN" || raw === "BILINGUAL" || raw === "ALL") return raw;
  return undefined;
}

/** GET /api/characters — list public + filters q/sort/tag/lang/cursor */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const language = parseLanguage(sp.get("lang"));

    if (q) {
      const items = await searchCharacters(q, 30, language);
      return NextResponse.json({ items, nextCursor: null });
    }

    const sortParam = sp.get("sort");
    const sort: CharacterSort =
      sortParam === "new" || sortParam === "popular" || sortParam === "trending" ? sortParam : "trending";

    const result = await listCharacters({
      sort,
      tag: sp.get("tag") ?? undefined,
      language,
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponseLocalized(error);
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
    return jsonErrorResponseLocalized(error);
  }
}

export const dynamic = "force-dynamic";
