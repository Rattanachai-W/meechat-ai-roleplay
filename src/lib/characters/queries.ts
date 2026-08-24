import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { isUuid } from "@/lib/utils";

/**
 * Read-side queries สำหรับ characters / discover
 * ownership check เป็นหน้าที่ของ caller (Prisma bypass RLS)
 */

export type CharacterSort = "trending" | "new" | "popular";

export interface CharacterCardData {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  avatarUrl: string | null;
  contentRating: string;
  chatCount: number;
  likeCount: number;
  favoriteCount: number;
  trendScore: number;
  creatorUsername: string | null;
  tags: string[];
}

const cardSelect = {
  id: true,
  name: true,
  slug: true,
  tagline: true,
  avatarUrl: true,
  contentRating: true,
  chatCount: true,
  likeCount: true,
  favoriteCount: true,
  trendScore: true,
  createdAt: true,
  creator: { select: { username: true } },
  characterTags: { select: { tag: { select: { slug: true, name: true } } } },
} satisfies Prisma.CharacterSelect;

type CardRow = Prisma.CharacterGetPayload<{ select: typeof cardSelect }>;

function toCard(row: CardRow): CharacterCardData {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagline: row.tagline,
    avatarUrl: row.avatarUrl,
    contentRating: row.contentRating,
    chatCount: row.chatCount,
    likeCount: row.likeCount,
    favoriteCount: row.favoriteCount,
    trendScore: row.trendScore,
    creatorUsername: row.creator?.username ?? null,
    tags: row.characterTags.map((ct) => ct.tag.slug),
  };
}

// listing สาธารณะ = เผยแพร่แล้ว + public (draft/pending/rejected ของ owner เท่านั้น)
const PUBLIC_ONLY: Prisma.CharacterWhereInput = { visibility: "PUBLIC", status: "PUBLISHED" };

function orderAndSeek(sort: CharacterSort, cursorRaw?: string) {
  const decoded = decodeCursor(cursorRaw);
  switch (sort) {
    case "new":
      return {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }] as Prisma.CharacterOrderByWithRelationInput[],
        ...(decoded
          ? {
              where: {
                OR: [
                  { createdAt: { lt: new Date(decoded.v[0]) } },
                  { createdAt: new Date(decoded.v[0]), id: { lt: decoded.id } },
                ],
              },
            }
          : {}),
      };
    case "popular":
      return {
        orderBy: [{ chatCount: "desc" }, { id: "desc" }] as Prisma.CharacterOrderByWithRelationInput[],
        ...(decoded
          ? {
              where: {
                OR: [
                  { chatCount: { gt: Number(decoded.v[0]) } },
                  { chatCount: Number(decoded.v[0]), id: { lt: decoded.id } },
                ],
              },
            }
          : {}),
      };
    case "trending":
      return {
        orderBy: [{ trendScore: "desc" }, { chatCount: "desc" }, { id: "desc" }] as Prisma.CharacterOrderByWithRelationInput[],
        ...(decoded
          ? {
              where: {
                OR: [
                  { trendScore: { gt: Number(decoded.v[0]) } },
                  { trendScore: Number(decoded.v[0]), id: { lt: decoded.id } },
                ],
              },
            }
          : {}),
      };
  }
}

interface CursorPayload {
  id: string;
  v: (string | number)[];
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor?: string): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString()) as CursorPayload;
    return parsed && typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export async function listCharacters(params: {
  sort?: CharacterSort;
  tag?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: CharacterCardData[]; nextCursor: string | null }> {
  const limit = Math.min(48, Math.max(1, params.limit ?? 24));
  const seek = orderAndSeek(params.sort ?? "trending", params.cursor);

  const rows = await prisma.character.findMany({
    where: {
      ...PUBLIC_ONLY,
      ...("where" in seek ? (seek.where as Prisma.CharacterWhereInput) : {}),
      ...(params.tag ? { characterTags: { some: { tag: { slug: params.tag } } } } : {}),
    },
    orderBy: seek.orderBy,
    take: limit + 1,
    select: cardSelect,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(toCard);
  let nextCursor: string | null = null;
  if (hasMore) {
    const last = rows[limit - 1];
    const v =
      params.sort === "new"
        ? [last.createdAt.toISOString()]
        : params.sort === "popular"
          ? [last.chatCount]
          : [last.trendScore];
    nextCursor = encodeCursor({ id: last.id, v });
  }
  return { items: page, nextCursor };
}

/** Full-text แบบ ILIKE — Thai ไม่ตัดคำด้วย to_tsvector จึงใช้ contains (ดู decisions.md) */
export async function searchCharacters(q: string, limit = 30): Promise<CharacterCardData[]> {
  const term = q.trim();
  if (!term) return [];
  const rows = await prisma.character.findMany({
    where: {
      ...PUBLIC_ONLY,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { tagline: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        { creator: { username: { contains: term.toLowerCase(), mode: "insensitive" } } },
        { characterTags: { some: { tag: { name: { contains: term, mode: "insensitive" } } } } },
      ],
    },
    orderBy: { chatCount: "desc" },
    take: limit,
    select: cardSelect,
  });
  return rows.map(toCard);
}

export async function getCharacterDetail(
  slugOrId: string,
  viewerId: string | null
): Promise<{
  character: Prisma.CharacterGetPayload<{
    include: { creator: true; characterTags: { include: { tag: true } }; examples: true };
  }>;
  viewer: { favorited: boolean; liked: boolean; isOwner: boolean };
} | null> {
  const character = await prisma.character.findFirst({
    where: isUuid(slugOrId) ? { OR: [{ slug: slugOrId }, { id: slugOrId }] } : { slug: slugOrId },
    include: {
      creator: true,
      characterTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      examples: { orderBy: { position: "asc" } },
    },
  });
  if (!character) return null;

  // visibility + status rules: owner เห็นได้ทุกสถานะ (draft/pending/rejected);
  // คนอื่นเห็นเฉพาะ PUBLISHED — PRIVATE จำกัด owner เสมอ, UNLISTED = ผู้มีลิงก์
  const isOwner = Boolean(viewerId && character.creator.userId === viewerId);
  if (character.visibility === "PRIVATE" && !isOwner) return null;
  if (character.status !== "PUBLISHED" && !isOwner) return null;

  const viewer = { favorited: false, liked: false, isOwner };
  if (viewerId) {
    const [fav, like] = await Promise.all([
      prisma.favorite.findUnique({
        where: { userId_characterId: { userId: viewerId, characterId: character.id } },
      }),
      prisma.characterLike.findUnique({
        where: { userId_characterId: { userId: viewerId, characterId: character.id } },
      }),
    ]);
    viewer.favorited = Boolean(fav);
    viewer.liked = Boolean(like);
  }
  return { character, viewer };
}

export interface DiscoverSections {
  trending: CharacterCardData[];
  new: CharacterCardData[];
  popular: CharacterCardData[];
  categories: { tag: { slug: string; name: string }; items: CharacterCardData[] }[];
}

export async function getDiscoverSections(): Promise<DiscoverSections> {
  const base = { ...PUBLIC_ONLY };
  const [trendingRows, newRows, popularRows, topTags] = await Promise.all([
    prisma.character.findMany({ where: base, orderBy: [{ trendScore: "desc" }, { chatCount: "desc" }], take: 12, select: cardSelect }),
    prisma.character.findMany({ where: base, orderBy: { createdAt: "desc" }, take: 12, select: cardSelect }),
    prisma.character.findMany({ where: base, orderBy: { chatCount: "desc" }, take: 12, select: cardSelect }),
    prisma.tag.findMany({
      orderBy: { characters: { _count: "desc" } },
      take: 8,
      select: { slug: true, name: true, _count: { select: { characters: true } } },
    }),
  ]);

  const categories = await Promise.all(
    topTags
      .filter((t) => t._count.characters > 0)
      .map(async (tag) => {
        const rows = await prisma.character.findMany({
          where: { ...PUBLIC_ONLY, characterTags: { some: { tag: { slug: tag.slug } } } },
          orderBy: { chatCount: "desc" },
          take: 4,
          select: cardSelect,
        });
        return { tag: { slug: tag.slug, name: tag.name }, items: rows.map(toCard) };
      })
  );

  return {
    trending: trendingRows.map(toCard),
    new: newRows.map(toCard),
    popular: popularRows.map(toCard),
    categories,
  };
}
