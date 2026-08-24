import { z } from "zod";
import { optionalText, requiredText } from "@/lib/validation/character";

// base แยกจาก refine — zod ไม่อนุญาต .partial() บน ZodEffects
const questBaseSchema = z.object({
  goalType: z.enum(["MESSAGES", "STREAK_DAYS", "AI_TOPIC"]),
  title: requiredText(2, 60),
  description: requiredText(5, 200),
  // เป้าตัวเลข (ข้อความ/วัน) — AI_TOPIC ไม่ใช้ (AI ตัดสิน) จึง default 1
  target: z.coerce.number().int().min(1).max(999).default(1),
  // เกณฑ์ที่ส่งให้ AI ตัดสิน — required เฉพาะ AI_TOPIC (refine ด้านล่าง)
  criteriaPrompt: optionalText(500),
  rewardIntimacy: z.coerce.number().int().min(1).max(50).default(10),
});

/** ภารกิจของตัวละคร (creator กำหนดเองผ่าน Creator Studio) */
export const questInputSchema = questBaseSchema.refine(
  (data) => data.goalType !== "AI_TOPIC" || Boolean(data.criteriaPrompt),
  {
    path: ["criteriaPrompt"],
    message: "ภารกิจ AI_TOPIC ต้องระบุเกณฑ์ให้ AI ตัดสิน (criteriaPrompt)",
  }
);

// PATCH: ทุก field optional — เปลี่ยน goalType เป็น AI_TOPIC ต้องส่ง criteriaPrompt มาด้วยเสมอ
// (ลบ criteria ของภารกิจ AI_TOPIC ที่มีอยู่ทำไม่ได้เพราะ undefined = ไม่แก้)
export const questUpdateSchema = questBaseSchema.partial().refine(
  (data) => data.goalType !== "AI_TOPIC" || Boolean(data.criteriaPrompt),
  {
    path: ["criteriaPrompt"],
    message: "ภารกิจ AI_TOPIC ต้องระบุเกณฑ์ให้ AI ตัดสิน (criteriaPrompt)",
  }
);
