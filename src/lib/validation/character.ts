import { z } from "zod";

/** string ที่ trim แล้วเป็นค่าว่าง → undefined (สำหรับ field ไม่บังคับ) */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));
}

export function requiredText(min: number, max: number) {
  return z.string().trim().min(min).max(max);
}

export const characterInputSchema = z.object({
  name: requiredText(2, 60),
  tagline: requiredText(5, 120),
  description: requiredText(30, 4000),
  personality: optionalText(2000),
  scenario: optionalText(2000),
  speakingStyle: optionalText(1000),
  firstMessage: requiredText(1, 3000),
  visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]).default("PUBLIC"),
  contentRating: z.enum(["GENERAL", "MATURE"]).default("GENERAL"),
  defaultModelKey: optionalText(120),
  tagSlugs: z.array(z.string().trim().min(1).max(60)).max(6).default([]),
  examples: z
    .array(
      z.object({
        userTurn: requiredText(1, 1000),
        characterTurn: requiredText(1, 1000),
      })
    )
    .max(5)
    .default([]),
  /** POST เท่านั้น: true = บันทึกแล้วส่งเผยแพร่ทันที (PATCH จะไม่อ่านค่านี้) */
  publish: z.boolean().default(false),
});

export type CharacterInput = z.infer<typeof characterInputSchema>;
export const characterUpdateSchema = characterInputSchema.partial();
export type CharacterUpdateInput = z.infer<typeof characterUpdateSchema>;
