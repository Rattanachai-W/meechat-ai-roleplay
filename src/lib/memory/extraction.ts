import { prisma } from "@/lib/db/prisma";
import { completeOnce, resolveCheapestJobModel, LlmError } from "@/lib/ai/gateway";

/**
 * Memory extraction — ทุก N ข้อความ ให้ model ราคาถูกสกัด "ความจำ"
 * (ข้อเท็จจริง/ความสัมพันธ์/เหตุการณ์) เก็บลงตาราง memories
 * heuristic dedupe: ข้ามถ้ามี content เดิมแบบเป๊ะใน conversation แล้ว
 */
const EXTRACT_EVERY_N_MESSAGES = 8;
const LOOKBACK_MESSAGES = 8;

const MEMORY_TYPES = ["FACT", "RELATIONSHIP", "EVENT", "PREFERENCE", "PROMISE", "SECRET", "GOAL"] as const;

interface ExtractedMemory {
  type: string;
  content: string;
  importance: number;
}

/** เรียกหลัง assistant ตอบจบ — fire-and-forget friendly (ไม่ throw) */
export async function maybeExtractMemories(conversationId: string): Promise<void> {
  try {
    const messageCount = await prisma.message.count({
      where: { conversationId, status: "COMPLETED" },
    });
    if (messageCount === 0 || messageCount % EXTRACT_EVERY_N_MESSAGES !== 0) return;

    const recent = await prisma.message.findMany({
      where: { conversationId, isActiveVariant: true },
      orderBy: { createdAt: "desc" },
      take: LOOKBACK_MESSAGES,
      select: { role: true, content: true },
    });
    if (recent.length < 4) return;
    recent.reverse();

    const transcript = recent
      .map((m) => `${m.role === "USER" ? "ผู้ใช้" : "ตัวละคร"}: ${m.content}`)
      .join("\n");

    const model = await resolveCheapestJobModel();
    const { text } = await completeOnce({
      model,
      maxTokens: 500,
      messages: [
        {
          role: "system",
          content:
            "คุณสกัดความจำระยะยาวจากบทสนทนา roleplay ภาษาไทย ตอบเป็น JSON array เท่านั้น " +
            'รูปแบบ: [{"type":"FACT|RELATIONSHIP|EVENT|PREFERENCE|PROMISE|SECRET|GOAL","content":"...","importance":1-5}] ' +
            "สกัดเฉพาะสาระสำคัญที่ควรจำไปอนาคต (ชื่อเรียก ความสัมพันธ์ เหตุการณ์สำคัญ สิ่งที่ชอบ/เกลียด สัญญา) " +
            "ถ้าไม่มีอะไรน่าจดจำ ตอบ [] เท่านั้น ห้ามอธิบายอื่น",
        },
        { role: "user", content: transcript },
      ],
    });

    const extracted = parseMemories(text);
    if (extracted.length === 0) return;

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true, characterId: true },
    });
    if (!conv) return;

    const existing = await prisma.memory.findMany({
      where: { conversationId },
      select: { content: true },
    });
    const seen = new Set(existing.map((e) => e.content));

    for (const item of extracted) {
      const content = item.content.trim().slice(0, 300);
      if (!content || seen.has(content)) continue;
      seen.add(content);
      await prisma.memory.create({
        data: {
          userId: conv.userId,
          characterId: conv.characterId,
          conversationId,
          type: normalizeType(item.type),
          content,
          importance: clampImportance(item.importance),
        },
      });
    }
  } catch (error) {
    // background job — log แล้วปล่อยผ่าน ไม่กระทบ stream ของ user
    console.error("[memory] extraction failed:", error instanceof LlmError ? error.code : error);
  }
}

function parseMemories(text: string): ExtractedMemory[] {
  const jsonText = text.replace(/```json?/g, "").replace(/```/g, "").trim();
  const start = jsonText.indexOf("[");
  const end = jsonText.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ExtractedMemory =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ExtractedMemory).content === "string"
    );
  } catch {
    return [];
  }
}

function normalizeType(type: unknown): (typeof MEMORY_TYPES)[number] {
  const upper = typeof type === "string" ? type.toUpperCase() : "";
  return (MEMORY_TYPES as readonly string[]).includes(upper)
    ? (upper as (typeof MEMORY_TYPES)[number])
    : "FACT";
}

function clampImportance(value: unknown): number {
  const n = typeof value === "number" ? Math.round(value) : 1;
  return Math.min(5, Math.max(1, n));
}
