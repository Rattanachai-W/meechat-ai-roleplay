import { prisma } from "@/lib/db/prisma";

/**
 * Memory retrieval — heuristic top-K ก่อนขึ้น pgvector (ตาม decisions.md)
 * score = importance × decay(lastSeenAt); decay ครึ่งชีวิต 14 วัน
 */
const HALF_LIFE_DAYS = 14;
const MAX_MEMORIES_IN_PROMPT = 12;

export async function retrieveMemories(
  conversationId: string,
  limit = MAX_MEMORIES_IN_PROMPT
): Promise<{ type: string; content: string; importance: number }[]> {
  const rows = await prisma.memory.findMany({
    where: { conversationId },
    select: { type: true, content: true, importance: true, lastSeenAt: true },
    orderBy: [{ importance: "desc" }, { lastSeenAt: "desc" }],
    take: 200,
  });

  const now = Date.now();
  return rows
    .map((r) => {
      const ageDays = Math.max(0, (now - r.lastSeenAt.getTime()) / 86_400_000);
      const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
      return { ...r, score: r.importance * decay };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ type, content, importance }) => ({ type, content, importance }));
}
