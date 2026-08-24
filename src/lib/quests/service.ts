import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/errors";
import { QuestGoalType } from "@/generated/prisma/client";
import { completeOnce, resolveCheapestJobModel } from "@/lib/ai/gateway";
import { pointsToLevel } from "@/lib/quests/intimacy";

/**
 * Quest service — ภารกิจประจำตัวละคร
 *
 * - ภารกิจ default ถูกสร้างอัตโนมัติครั้งแรกที่มีคนเปิดดู
 *   (MESSAGES ×2, STREAK_DAYS ×1, AI_TOPIC ×2 — ภารกิจสายสนทนาที่ AI ตัดสิน)
 *   ครีเอเตอร์เพิ่ม/แก้/ลบเพิ่มได้ผ่าน Creator Studio
 * - progress bump หลังแชทสำเร็จเท่านั้น (pipeline post-jobs)
 * - รางวัล = ค่าความสนิท (character_affinities) ไม่แจกเหรียญ — กันเงินเฟ้อ
 * - claim idempotent: mark claimedAt (conditional update) + เติม affinity
 *   ใน transaction เดียว — concurrent claim ซ้ำได้รางวัลครั้งเดียวแน่นอน
 */

const MAX_QUESTS_PER_CHARACTER = 10;

const DEFAULT_QUESTS = [
  {
    goalType: QuestGoalType.MESSAGES,
    target: 10,
    rewardIntimacy: 8,
    sortOrder: 10,
    title: "เริ่มต้นคุยกัน",
    description: "ส่งข้อความถึงตัวละครนี้ให้ครบ 10 ข้อความ",
  },
  {
    goalType: QuestGoalType.MESSAGES,
    target: 50,
    rewardIntimacy: 15,
    sortOrder: 20,
    title: "เพื่อนซี้ตัวจริง",
    description: "สะสมการแชทกับตัวละครนี้ให้ครบ 50 ข้อความ",
  },
  {
    goalType: QuestGoalType.STREAK_DAYS,
    target: 3,
    rewardIntimacy: 12,
    sortOrder: 30,
    title: "กลับมาหากันทุกวัน",
    description: "กลับมาแชทกับตัวละครนี้ให้ครบ 3 วัน (นับวันที่แชท ไม่จำเป็นต้องต่อเนื่อง)",
  },
  {
    // ภารกิจสายสนทนา — คุยจน "ทำสิ่งนั้นสำเร็จ" AI ตัดสินจากบทสนทนาหลังแชททุกครั้ง
    goalType: QuestGoalType.AI_TOPIC,
    target: 1,
    rewardIntimacy: 10,
    sortOrder: 40,
    title: "ทำให้เขาหัวเราะ",
    description: "เล่าเรื่องหรือมุกจนตัวละครหัวเราะ — AI ตัดสินจากบทสนทนา",
    criteriaPrompt:
      "ผู้ใช้เล่าเรื่องหรือมุกที่ทำให้ตัวละครแสดงปฏิกิริยาขำ/หัวเราะจริง ๆ ในบทสนทนา " +
      "(เช่น ตอบด้วยอารมณ์หัวเราะ ขำจนตกเก้าอี้ หรืออมยิ้ม) — การพูดคุยทั่วไปที่ไม่มีปฏิกิริยาขำไม่นับ",
  },
  {
    goalType: QuestGoalType.AI_TOPIC,
    target: 1,
    rewardIntimacy: 20,
    sortOrder: 50,
    title: "เปิดใจสนิท",
    description: "คุยจนตัวละครเปิดใจเล่าเรื่องส่วนตัวที่ไม่เคยเล่าให้ใครฟัง — AI ตัดสินจากบทสนทนา",
    criteriaPrompt:
      "ตัวละครเปิดใจเล่าเรื่องส่วนตัว ความทรงจำ ความกลัว หรือความลับลึก ๆ ของตัวเองกับผู้ใช้อย่างจริงใจ " +
      "(เช่น อดีตที่ต้องซ่อน เรื่องที่ไม่เคยบอกใคร) — การทักทายหรือคุยผิวเผินไม่นับ",
  },
] as const;

/** สร้างภารกิจ default ให้ตัวละคร (idempotent — ข้ามถ้ามีภารกิจอยู่แล้ว) */
export async function ensureDefaultQuests(characterId: string): Promise<void> {
  const existing = await prisma.characterQuest.count({ where: { characterId } });
  if (existing > 0) return;
  // single-process dev/Next instance — race window แคบมาก ยอมรับได้
  await prisma.characterQuest.createMany({
    data: DEFAULT_QUESTS.map((q) => ({ ...q, characterId })),
    skipDuplicates: true,
  });
}

export interface QuestWithProgress {
  id: string;
  goalType: QuestGoalType;
  target: number;
  title: string;
  description: string;
  criteriaPrompt: string | null;
  rewardIntimacy: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

/** ค่าความสนิทปัจจุบันของ (user, character) — null ถ้ายังไม่เคยสะสม */
export interface AffinitySummary {
  points: number;
  level: number;
  label: string;
  nextLevelAt: number | null;
}

export async function getAffinitySummary(
  userId: string,
  characterId: string
): Promise<AffinitySummary> {
  const row = await prisma.characterAffinity.findUnique({
    where: { userId_characterId: { userId, characterId } },
    select: { points: true },
  });
  const lv = pointsToLevel(row?.points ?? 0);
  return { points: row?.points ?? 0, level: lv.level, label: lv.label, nextLevelAt: lv.nextLevelAt };
}

/** เติมค่าความสนิท (upsert increment) — ใช้ทั้งจาก claim ภารกิจและ engagement อื่นในอนาคต */
async function addIntimacyPoints(userId: string, characterId: string, amount: number): Promise<number> {
  const row = await prisma.characterAffinity.upsert({
    where: { userId_characterId: { userId, characterId } },
    update: { points: { increment: amount } },
    create: { userId, characterId, points: amount },
    select: { points: true },
  });
  return row.points;
}

/** รายการภารกิจของตัวละคร + progress ของผู้ใช้ (auto-create default ครั้งแรก) */
export async function getQuestsWithProgress(
  userId: string | null,
  characterId: string
): Promise<QuestWithProgress[]> {
  await ensureDefaultQuests(characterId);
  const quests = await prisma.characterQuest.findMany({
    where: { characterId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      progress: userId ? { where: { userId } } : undefined,
    },
  });
  return quests.map((q) => ({
    id: q.id,
    goalType: q.goalType,
    target: q.target,
    title: q.title,
    description: q.description,
    criteriaPrompt: q.criteriaPrompt,
    rewardIntimacy: q.rewardIntimacy,
    progress: q.progress[0]?.progress ?? 0,
    completed: Boolean(q.progress[0]?.completedAt),
    claimed: Boolean(q.progress[0]?.claimedAt),
  }));
}

/** YYYY-MM-DD แบบ UTC — กุญแจนับ "วันที่แชท" ของ STREAK_DAYS */
function utcDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * นับ progress จากการแชทสำเร็จ 1 ครั้ง (เรียกจาก pipeline post-jobs)
 * - MESSAGES: +1 ทุกข้อความ
 * - STREAK_DAYS: +1 ต่อวัน (UTC) เท่านั้น — กัน spam ข้อความเดียวจบภารกิจ
 */
export async function bumpChatQuestProgress(userId: string, characterId: string): Promise<void> {
  const quests = await prisma.characterQuest.findMany({
    where: {
      characterId,
      goalType: { in: [QuestGoalType.MESSAGES, QuestGoalType.STREAK_DAYS] },
    },
  });
  const today = utcDateOf(new Date());

  for (const quest of quests) {
    const row = await prisma.userQuestProgress.upsert({
      where: { userId_questId: { userId, questId: quest.id } },
      update: {},
      create: { userId, questId: quest.id },
    });

    let nextProgress = row.progress;
    let shouldBump = false;

    if (quest.goalType === QuestGoalType.MESSAGES) {
      nextProgress = row.progress + 1;
      shouldBump = true;
    } else {
      // STREAK_DAYS — bump เฉพาะวันแรกของวันนั้น
      const lastDay = row.lastBumpOn ? utcDateOf(row.lastBumpOn) : null;
      if (lastDay !== today) {
        nextProgress = row.progress + 1;
        shouldBump = true;
      }
    }

    if (!shouldBump) continue;
    await prisma.userQuestProgress.update({
      where: { id: row.id },
      data: {
        progress: nextProgress,
        lastBumpOn: new Date(),
        ...(nextProgress >= quest.target && !row.completedAt ? { completedAt: new Date() } : {}),
      },
    });
  }
}

/** แปลงคำตอบ JSON ของ AI judge — return null ถ้า parse ไม่ได้ (best-effort) */
export function parseJudgeVerdict(text: string): boolean | null {
  // ตัด code fence ```json ... ``` ที่โมเดลชอบห่อ
  const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { completed?: unknown };
    return typeof parsed.completed === "boolean" ? parsed.completed : null;
  } catch {
    return null;
  }
}

const JUDGE_MESSAGE_WINDOW = 12;

/**
 * AI ตัดสินภารกิจ AI_TOPIC — best-effort เท่านั้น (fail เงียบ ๆ ไม่กระทบแชท)
 * อ่านแชทล่าสุดของ conversation ล่าสุด user+character แล้วให้โมเดลถูกที่สุดตัดสินตาม criteriaPrompt
 */
export async function judgeAiTopicQuests(userId: string, characterId: string): Promise<void> {
  const pending = await prisma.characterQuest.findMany({
    where: { characterId, goalType: QuestGoalType.AI_TOPIC },
    include: { progress: { where: { userId } } },
  });
  const todo = pending.filter((q) => !q.progress[0]?.completedAt);
  if (todo.length === 0) return;

  const conversation = await prisma.conversation.findFirst({
    where: { userId, characterId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  if (!conversation) return;

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id, isActiveVariant: true },
    orderBy: { createdAt: "desc" },
    take: JUDGE_MESSAGE_WINDOW,
    select: { role: true, content: true },
  });
  if (messages.length === 0) return;
  messages.reverse();

  let model: string;
  try {
    model = await resolveCheapestJobModel();
  } catch {
    return;
  }

  const transcript = messages.map((m) => `${m.role === "USER" ? "ผู้ใช้" : "AI"}: ${m.content}`).join("\n");

  for (const quest of todo) {
    try {
      const result = await completeOnce({
        model,
        temperature: 0,
        maxTokens: 50,
        messages: [
          {
            role: "system",
            content:
              "คุณเป็นผู้ตัดสินภารกิจในเกม อ่านเกณฑ์และบทสนทนา แล้วตอบกลับเป็น JSON เท่านั้น " +
              'รูปแบบ: {"completed": true} หรือ {"completed": false} — ห้ามตอบอย่างอื่น',
          },
          {
            role: "user",
            content: `เกณฑ์ภารกิจ "${quest.title}": ${quest.criteriaPrompt ?? quest.description}\n\nบทสนทนาล่าสุด:\n${transcript}`,
          },
        ],
      });
      const verdict = parseJudgeVerdict(result.text);
      if (verdict === true) {
        // upsert — แถว progress อาจยังไม่เคยมี (AI_TOPIC ไม่ผ่านการ bump ปกติ)
        await prisma.userQuestProgress.upsert({
          where: { userId_questId: { userId, questId: quest.id } },
          update: { progress: quest.target, completedAt: new Date() },
          create: { userId, questId: quest.id, progress: quest.target, completedAt: new Date() },
        });
      }
    } catch {
      // judge fail = ยังไม่สำเร็จ — จะลองใหม่แชทครั้งถัดไป
    }
  }
}

/**
 * รับรางวัลภารกิจ = เติมค่าความสนิทของ (user, character) — idempotent ต่อ (user, quest)
 *
 * mark claimedAt เป็น conditional update (claimedAt = null เท่านั้น) แล้วเติม affinity
 * ใน transaction เดียว — request ที่แย่ง claim ไม่สำเร็จจะโดน count=0 → error
 * ทั้งสอง step atomic จึงไม่มีทางได้รางวัลซ้ำหรือหายกลางทาง
 */
export async function claimQuestReward(
  userId: string,
  questId: string
): Promise<{ amount: number; affinity: AffinitySummary }> {
  const quest = await prisma.characterQuest.findUnique({ where: { id: questId } });
  if (!quest) throw new ApiError("NOT_FOUND", "ไม่พบภารกิจ");

  const progress = await prisma.userQuestProgress.findUnique({
    where: { userId_questId: { userId, questId } },
  });
  if (!progress?.completedAt) throw new ApiError("VALIDATION_ERROR", "ยังทำภารกิจไม่สำเร็จ ลองใหม่อีกครั้ง");
  if (progress.claimedAt) throw new ApiError("VALIDATION_ERROR", "คุณรับรางวัลภารกิจนี้ไปแล้ว");

  const points = await prisma.$transaction(async (tx) => {
    const marked = await tx.userQuestProgress.updateMany({
      where: { userId, questId, completedAt: { not: null }, claimedAt: null },
      data: { claimedAt: new Date() },
    });
    // อีก request เดียวกันแย่ง claim ไปก่อน — reward จ่ายครั้งเดียวเสมอ
    if (marked.count === 0) throw new ApiError("VALIDATION_ERROR", "คุณรับรางวัลภารกิจนี้ไปแล้ว");

    return addIntimacyPoints(userId, quest.characterId, quest.rewardIntimacy);
  });

  return {
    amount: quest.rewardIntimacy,
    affinity: (() => {
      const lv = pointsToLevel(points);
      return { points, level: lv.level, label: lv.label, nextLevelAt: lv.nextLevelAt };
    })(),
  };
}

// ─────────────────────── Creator quest CRUD ───────────────────────

export interface QuestInput {
  goalType: QuestGoalType;
  title: string;
  description: string;
  target?: number;
  criteriaPrompt?: string;
  rewardIntimacy?: number;
}

export async function createQuest(characterId: string, userId: string, input: QuestInput) {
  const owned = await prisma.character.findFirst({
    where: { id: characterId, creator: { userId } },
    select: { id: true },
  });
  if (!owned) throw new ApiError("NOT_FOUND", "ไม่พบตัวละคร หรือคุณไม่ใช่เจ้าของ");

  const count = await prisma.characterQuest.count({ where: { characterId } });
  if (count >= MAX_QUESTS_PER_CHARACTER) {
    throw new ApiError("VALIDATION_ERROR", `ภารกิจเต็มจำนวนสูงสุด ${MAX_QUESTS_PER_CHARACTER} รายการ`);
  }

  const last = await prisma.characterQuest.findFirst({
    where: { characterId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return prisma.characterQuest.create({
    data: {
      characterId,
      goalType: input.goalType,
      title: input.title,
      description: input.description,
      target: input.target ?? 1,
      criteriaPrompt: input.criteriaPrompt ?? null,
      rewardIntimacy: input.rewardIntimacy ?? 10,
      sortOrder: (last?.sortOrder ?? 0) + 10,
    },
  });
}

export async function updateQuest(questId: string, userId: string, input: Partial<QuestInput>) {
  const quest = await prisma.characterQuest.findUnique({
    where: { id: questId },
    select: { character: { select: { creator: { select: { userId: true } } } } },
  });
  if (!quest || quest.character.creator.userId !== userId) {
    throw new ApiError("NOT_FOUND", "ไม่พบภารกิจ หรือคุณไม่ใช่เจ้าของ");
  }

  return prisma.characterQuest.update({
    where: { id: questId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.goalType !== undefined ? { goalType: input.goalType } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.criteriaPrompt !== undefined ? { criteriaPrompt: input.criteriaPrompt } : {}),
      ...(input.rewardIntimacy !== undefined ? { rewardIntimacy: input.rewardIntimacy } : {}),
    },
  });
}

export async function deleteQuest(questId: string, userId: string): Promise<void> {
  const quest = await prisma.characterQuest.findUnique({
    where: { id: questId },
    select: { character: { select: { creator: { select: { userId: true } } } } },
  });
  if (!quest || quest.character.creator.userId !== userId) {
    throw new ApiError("NOT_FOUND", "ไม่พบภารกิจ หรือคุณไม่ใช่เจ้าของ");
  }
  await prisma.characterQuest.delete({ where: { id: questId } });
}
