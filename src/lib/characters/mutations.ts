import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import type { CharacterInput, CharacterUpdateInput } from "@/lib/validation/character";
import { isUuid } from "@/lib/utils";
import type { CharacterStatus } from "@/generated/prisma/client";

/**
 * Write-side mutations สำหรับ characters
 * - auto-create CreatorProfile ครั้งแรกที่สร้างตัวละคร
 * - ownership check ทุก mutation (Prisma bypass RLS)
 */

/** slug แบบ URL-friendly จากชื่อ (latin เท่านั้น) + random suffix กันชน */
function generateSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "char";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureCreatorProfile(userId: string) {
  const existing = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (existing) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const emailPrefix = (user?.email ?? "creator").split("@")[0]?.toLowerCase() ?? "creator";
  const sanitized = emailPrefix.replace(/[^a-z0-9]+/g, "").slice(0, 20) || "creator";

  // ลองใส่ username จาก email ก่อน ถ้าชนค่อยสุ่มต่อท้าย
  for (let attempt = 0; attempt < 5; attempt++) {
    const username = attempt === 0 ? sanitized : `${sanitized}${Math.random().toString(36).slice(2, 6)}`;
    try {
      return await prisma.creatorProfile.create({ data: { userId, username } });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new ApiError("INTERNAL_ERROR", "สร้าง creator profile ไม่สำเร็จ");
}

async function resolveTagIds(tagSlugs: string[]) {
  if (tagSlugs.length === 0) return [];
  const ids: { id: string }[] = [];
  for (const slug of tagSlugs) {
    const normalizedSlug = slug.toLowerCase();
    const name = slug.trim();
    const tag = await prisma.tag.upsert({
      where: { slug: normalizedSlug },
      update: {},
      create: { slug: normalizedSlug.slice(0, 60), name },
      select: { id: true },
    });
    ids.push(tag);
  }
  return ids;
}

/** สถานะแรกเมื่อเลือก "เผยแพร่" — AUTO_APPROVE=false (มีทีมตรวจ) → เข้าคิว PENDING */
export function initialPublishState(): { status: CharacterStatus; publishedAt: Date | null } {
  const autoApprove = process.env.CREATOR_AUTO_APPROVE !== "false";
  return autoApprove
    ? { status: "PUBLISHED", publishedAt: new Date() }
    : { status: "PENDING", publishedAt: null };
}

export async function createCharacter(
  userId: string,
  input: CharacterInput,
  opts: { publish?: boolean } = {}
) {
  const creator = await ensureCreatorProfile(userId);
  const tagIds = await resolveTagIds(input.tagSlugs);

  return prisma.character.create({
    data: {
      creatorId: creator.id,
      name: input.name,
      slug: generateSlug(input.name),
      tagline: input.tagline,
      description: input.description,
      personality: input.personality,
      scenario: input.scenario,
      speakingStyle: input.speakingStyle,
      firstMessage: input.firstMessage,
      visibility: input.visibility,
      contentRating: input.contentRating,
      defaultModelKey: input.defaultModelKey,
      ...(opts.publish ? initialPublishState() : {}),
      characterTags: { create: tagIds.map((t) => ({ tagId: t.id })) },
      examples: {
        create: input.examples.map((ex, index) => ({
          userTurn: ex.userTurn,
          characterTurn: ex.characterTurn,
          position: index,
        })),
      },
    },
    select: { id: true, slug: true, status: true, publishedAt: true },
  });
}

export async function getOwnedCharacter(characterIdOrSlug: string, userId: string) {
  const character = await prisma.character.findFirst({
    where: isUuid(characterIdOrSlug)
      ? { OR: [{ id: characterIdOrSlug }, { slug: characterIdOrSlug }] }
      : { slug: characterIdOrSlug },
    include: { creator: { select: { userId: true, username: true } } },
  });
  if (!character) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");
  if (character.creator.userId !== userId) throw new ApiError("FORBIDDEN", "ไม่ใช่เจ้าของตัวละคร");
  return character;
}

export async function updateCharacter(
  characterIdOrSlug: string,
  userId: string,
  input: CharacterUpdateInput
) {
  const character = await getOwnedCharacter(characterIdOrSlug, userId);

  let tagOps: Record<string, unknown> | undefined;
  if (input.tagSlugs) {
    const tagIds = await resolveTagIds(input.tagSlugs);
    tagOps = {
      deleteMany: {},
      create: tagIds.map((t) => ({ tagId: t.id })),
    };
  }
  let exampleOps: Record<string, unknown> | undefined;
  if (input.examples) {
    exampleOps = {
      deleteMany: {},
      create: input.examples.map((ex, index) => ({
        userTurn: ex.userTurn,
        characterTurn: ex.characterTurn,
        position: index,
      })),
    };
  }

  return prisma.character.update({
    where: { id: character.id },
    data: {
      ...(input.name !== undefined && input.name !== character.name
        ? { name: input.name, slug: generateSlug(input.name) }
        : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.personality !== undefined ? { personality: input.personality } : {}),
      ...(input.scenario !== undefined ? { scenario: input.scenario } : {}),
      ...(input.speakingStyle !== undefined ? { speakingStyle: input.speakingStyle } : {}),
      ...(input.firstMessage !== undefined ? { firstMessage: input.firstMessage } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.contentRating !== undefined ? { contentRating: input.contentRating } : {}),
      ...(input.defaultModelKey !== undefined ? { defaultModelKey: input.defaultModelKey } : {}),
      ...(tagOps ? { characterTags: tagOps } : {}),
      ...(exampleOps ? { examples: exampleOps } : {}),
    },
    select: { id: true, slug: true },
  });
}

export async function deleteCharacter(characterIdOrSlug: string, userId: string) {
  const character = await getOwnedCharacter(characterIdOrSlug, userId);
  await prisma.character.delete({ where: { id: character.id } });
}

/** toggle like/favorite + อัปเดต counter แบบ atomic ใน transaction เดียว */
export async function toggleLike(
  userId: string,
  characterId: string
): Promise<{ liked: boolean; likeCount: number }> {
  if (!isUuid(characterId)) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");
  return prisma.$transaction(async (tx) => {
    const character = await tx.character.findUnique({ where: { id: characterId } });
    if (!character) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");

    const existing = await tx.characterLike.findUnique({
      where: { userId_characterId: { userId, characterId } },
    });
    if (existing) {
      await tx.characterLike.delete({ where: { userId_characterId: { userId, characterId } } });
      const updated = await tx.character.update({
        where: { id: characterId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: Math.max(0, updated.likeCount) };
    }
    await tx.characterLike.create({ data: { userId, characterId } });
    const updated = await tx.character.update({
      where: { id: characterId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { liked: true, likeCount: updated.likeCount };
  });
}

export async function toggleFavorite(
  userId: string,
  characterId: string
): Promise<{ favorited: boolean; favoriteCount: number }> {
  if (!isUuid(characterId)) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");
  return prisma.$transaction(async (tx) => {
    const character = await tx.character.findUnique({ where: { id: characterId } });
    if (!character) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");

    const existing = await tx.favorite.findUnique({
      where: { userId_characterId: { userId, characterId } },
    });
    if (existing) {
      await tx.favorite.delete({ where: { userId_characterId: { userId, characterId } } });
      const updated = await tx.character.update({
        where: { id: characterId },
        data: { favoriteCount: { decrement: 1 } },
        select: { favoriteCount: true },
      });
      return { favorited: false, favoriteCount: Math.max(0, updated.favoriteCount) };
    }
    await tx.favorite.create({ data: { userId, characterId } });
    const updated = await tx.character.update({
      where: { id: characterId },
      data: { favoriteCount: { increment: 1 } },
      select: { favoriteCount: true },
    });
    return { favorited: true, favoriteCount: updated.favoriteCount };
  });
}
