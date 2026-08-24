import { NextRequest, NextResponse } from "next/server";
import { jsonErrorResponse, requireUserId } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCharacterDetail } from "@/lib/characters/queries";
import { updateCharacter, deleteCharacter } from "@/lib/characters/mutations";
import { characterUpdateSchema } from "@/lib/validation/character";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/characters/[id] — detail + viewer state */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const result = await getCharacterDetail(id, user?.id ?? null);
    if (!result) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "ไม่พบตัวละคร" } }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/** PATCH /api/characters/[id] — owner only */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = characterUpdateSchema.parse(await request.json());
    const character = await updateCharacter(id, userId, body);
    return NextResponse.json({ character });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

/** DELETE /api/characters/[id] — owner only */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    await deleteCharacter(id, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
