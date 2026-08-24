import { prisma } from "@/lib/db/prisma";
import { completeOnce, resolveCheapestJobModel, LlmError } from "@/lib/ai/gateway";

/**
 * Rolling conversation summary — เมื่อข้อความที่ยังไม่ถูกสรุปเกิน threshold
 * สรุปส่วนเก่า (เว้น tail ล่าสุดไว้ใช้เป็น context ตรง ๆ) เก็บลง conversation_summaries
 */
const SUMMARY_THRESHOLD = 24;
const TAIL_KEEP_COUNT = 6;

export async function maybeUpdateSummary(conversationId: string): Promise<void> {
  try {
    const existing = await prisma.conversationSummary.findUnique({
      where: { conversationId },
    });

    let sinceCreatedAt: Date | undefined;
    if (existing?.summarizedUntilMessageId) {
      const marker = await prisma.message.findUnique({
        where: { id: existing.summarizedUntilMessageId },
        select: { createdAt: true },
      });
      sinceCreatedAt = marker?.createdAt;
    }

    const unsummarized = await prisma.message.findMany({
      where: {
        conversationId,
        isActiveVariant: true,
        status: "COMPLETED",
        ...(sinceCreatedAt ? { createdAt: { gt: sinceCreatedAt } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true },
    });

    if (unsummarized.length < SUMMARY_THRESHOLD) return;

    const older = unsummarized.slice(0, unsummarized.length - TAIL_KEEP_COUNT);
    if (older.length < SUMMARY_THRESHOLD - TAIL_KEEP_COUNT) return;
    const lastOldId = older[older.length - 1].id;

    const transcript = older
      .map((m) => `${m.role === "USER" ? "ผู้ใช้" : "ตัวละคร"}: ${m.content}`)
      .join("\n")
      .slice(0, 12_000);

    const previousSummary = existing?.summary ?? "";
    const model = await resolveCheapestJobModel();
    const { text } = await completeOnce({
      model,
      maxTokens: 600,
      messages: [
        {
          role: "system",
          content:
            "สรุปบทสนทนา roleplay ภาษาไทยให้กระชับ (ไม่เกิน 250 คำ) เก็บสาระสำคัญ: " +
            "ความสัมพันธ์ของตัวละครกับผู้ใช้ เหตุการณ์ที่เกิดขึ้น สถานที่ สัญญา และอารมณ์โดยรวม " +
            "เขียนต่อเนื่องจากบทสรุปเดิมถ้ามี ตอบข้อความสรุปอย่างเดียว",
        },
        {
          role: "user",
          content:
            (previousSummary ? `บทสรุปเดิม:\n${previousSummary}\n\n` : "") +
            `บทสนทนาใหม่:\n${transcript}`,
        },
      ],
    });

    const summary = text.trim();
    if (!summary) return;

    await prisma.conversationSummary.upsert({
      where: { conversationId },
      update: {
        summary,
        summarizedUntilMessageId: lastOldId,
      },
      create: {
        conversationId,
        summary,
        summarizedUntilMessageId: lastOldId,
      },
    });
  } catch (error) {
    console.error("[memory] summary failed:", error instanceof LlmError ? error.code : error);
  }
}
