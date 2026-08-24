import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/utils";
import { CreatorEarningType, CharacterStatus } from "@/generated/prisma/client";

/**
 * Creator Studio service (docs/creator-system.md)
 * - profile onboarding/update (username unique + regex)
 * - studio stats + own-character list + earnings ledger
 * - publish state machine: DRAFT → PENDING → PUBLISHED / REJECTED
 * - creator earning accrual (share-of-energy) — idempotent
 */

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** ดึง creator profile ของ user; ยังไม่มี → null (ให้ UI ไปหน้า onboarding) */
export async function getMyCreatorProfile(userId: string) {
  return prisma.creatorProfile.findUnique({ where: { userId } });
}

function normalizeUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new ApiError("VALIDATION_ERROR", "username ต้องเป็น a-z 0-9 _ ความยาว 3-20 ตัวอักษร");
  }
  return username;
}

/**
 * สมัคร/ตั้งค่า creator profile ของตัวเอง
 * - ถ้ามีอยู่แล้ว = update bio/avatar (username เปลี่ยนได้ถ้าไม่ชน)
 * - P2002 ที่ username = VALIDATION_ERROR พร้อมข้อความชัด
 */
export async function upsertCreatorProfile(
  userId: string,
  input: { username?: string; bio?: string | null; avatarUrl?: string | null }
) {
  const existing = await getMyCreatorProfile(userId);
  if (!existing) {
    if (!input.username) {
      throw new ApiError("VALIDATION_ERROR", "กรุณาระบุ username สำหรับหน้าครีเอเตอร์");
    }
    const username = normalizeUsername(input.username);
    try {
      return await prisma.creatorProfile.create({
        data: { userId, username, bio: input.bio ?? null, avatarUrl: input.avatarUrl ?? null },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new ApiError("VALIDATION_ERROR", "username นี้มีผู้ใช้แล้ว");
      }
      throw error;
    }
  }

  const username = input.username !== undefined ? normalizeUsername(input.username) : undefined;
  try {
    return await prisma.creatorProfile.update({
      where: { id: existing.id },
      data: {
        ...(username !== undefined ? { username } : {}),
        ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new ApiError("VALIDATION_ERROR", "username นี้มีผู้ใช้แล้ว");
    }
    throw error;
  }
}

/** สถิติ studio รวมทุกตัวละครของครีเอเตอร์ */
export async function getStudioStats(userId: string) {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
    include: { characters: { select: { status: true, chatCount: true, likeCount: true, favoriteCount: true } } },
  });
  if (!profile) return null;

  const byStatus: Record<string, number> = { DRAFT: 0, PENDING: 0, PUBLISHED: 0, REJECTED: 0 };
  let totalChats = 0;
  let totalLikes = 0;
  for (const c of profile.characters) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    totalChats += c.chatCount;
    totalLikes += c.likeCount;
  }
  const followers = await prisma.creatorFollow.count({ where: { creatorId: profile.id } });

  return {
    profile,
    stats: {
      characterCount: profile.characters.length,
      characterCountByStatus: byStatus,
      totalChats,
      totalLikes,
      followerCount: followers,
      totalEarned: profile.totalEarned,
    },
  };
}

/** ตัวละครของตัวเองทุก status (+filter) — ใช้ใน studio */
export async function listMyCharacters(userId: string, status?: CharacterStatus) {
  const profile = await prisma.creatorProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return [];
  return prisma.character.findMany({
    where: { creatorId: profile.id, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      tagline: true,
      avatarUrl: true,
      status: true,
      reviewNote: true,
      visibility: true,
      contentRating: true,
      chatCount: true,
      likeCount: true,
      favoriteCount: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
}

/** ledger earnings ของตัวเอง (desc, cursor=iso|id) */
export async function listMyEarnings(userId: string, limit = 30, cursor?: string) {
  const capped = Math.min(60, Math.max(1, limit));
  let cursorWhere: Record<string, unknown> = {};
  if (cursor) {
    const [iso, id] = cursor.split("|");
    const createdAt = iso ? new Date(iso) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
      throw new ApiError("VALIDATION_ERROR", "cursor ไม่ถูกต้อง");
    }
    cursorWhere = { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
  }
  const rows = await prisma.creatorEarning.findMany({
    where: { creatorUserId: userId, ...cursorWhere },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: capped + 1,
  });
  const hasMore = rows.length > capped;
  const items = rows.slice(0, capped);
  const last = items[items.length - 1];
  return {
    earnings: items,
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

async function getOwnedCharacterForTransition(characterIdOrSlug: string, userId: string) {
  const character = await prisma.character.findFirst({
    where: isUuid(characterIdOrSlug)
      ? { OR: [{ id: characterIdOrSlug }, { slug: characterIdOrSlug }] }
      : { slug: characterIdOrSlug },
    include: { creator: { select: { userId: true } } },
  });
  if (!character) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");
  if (character.creator.userId !== userId) throw new ApiError("FORBIDDEN", "ไม่ใช่เจ้าของตัวละคร");
  return character;
}

export interface SubmitOptions {
  /** AUTO_APPROVE (env) — submit ผ่านตรงเป็น PUBLISHED ทันที (MVP ไม่มีทีม review) */
  autoApprove?: boolean;
}

/**
 * ส่งตัวละครขึ้น publish: DRAFT|REJECTED → PENDING (หรือ PUBLISHED เมื่อ autoApprove)
 * PENDING/PUBLISHED submit ซ้ำ → VALIDATION_ERROR
 */
export async function submitCharacter(
  characterIdOrSlug: string,
  userId: string,
  opts: SubmitOptions = {}
) {
  const character = await getOwnedCharacterForTransition(characterIdOrSlug, userId);
  if (character.status === "PUBLISHED") {
    throw new ApiError("VALIDATION_ERROR", "ตัวละครนี้เผยแพร่อยู่แล้ว");
  }
  if (character.status === "PENDING") {
    throw new ApiError("VALIDATION_ERROR", "ตัวละครนี้รอตรวจสอบอยู่");
  }

  const autoApprove =
    opts.autoApprove ?? process.env.CREATOR_AUTO_APPROVE !== "false";
  return prisma.character.update({
    where: { id: character.id },
    data: autoApprove
      ? { status: "PUBLISHED", publishedAt: new Date(), reviewNote: null }
      : { status: "PENDING", reviewNote: null },
  });
}

/** guard role=ADMIN (promote ผ่าน SQL — ดู docs/creator-system.md §6) */
export async function requireAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "ADMIN") throw new ApiError("FORBIDDEN", "เฉพาะผู้ดูแลระบบ");
}

/** admin decide: PENDING → PUBLISHED / REJECTED(+note) */
export async function decideCharacter(
  adminUserId: string,
  characterId: string,
  approve: boolean,
  note?: string
) {
  await requireAdmin(adminUserId);
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, status: true },
  });
  if (!character) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร");
  if (character.status !== "PENDING") {
    throw new ApiError("VALIDATION_ERROR", "ตัวละครนี้ไม่ได้อยู่ระหว่างรอตรวจสอบ");
  }
  return prisma.character.update({
    where: { id: character.id },
    data: approve
      ? { status: "PUBLISHED", publishedAt: new Date(), reviewNote: null }
      : { status: "REJECTED", reviewNote: note?.trim() || null },
  });
}

/**
 * จ่ายส่วนแบ่งครีเอเตอร์หลัง chat settle สำเร็จ — idempotent
 * (P2002 ที่ idempotencyKey = จ่ายไปแล้ว, profile หาย = P2025 → caller .catch() ทั้งหมด)
 */
export async function accrueCreatorEarning(input: {
  creatorUserId: string;
  amount: number;
  characterId?: string;
  idempotencyKey: string;
  note?: string;
}): Promise<void> {
  if (input.amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.creatorEarning.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) return; // replay — ไม่จ่ายซ้ำ
    await tx.creatorEarning.create({
      data: {
        creatorUserId: input.creatorUserId,
        characterId: input.characterId ?? null,
        type: CreatorEarningType.CHAT_SHARE,
        amount: input.amount,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey,
      },
    });
    // update (ไม่ใช่ upsert): creator profile ถูกลบ = ไม่มีใครรับ coin — ยอม skip
    await tx.creatorProfile.update({
      where: { userId: input.creatorUserId },
      data: { totalEarned: { increment: input.amount } },
    });
  });
}
