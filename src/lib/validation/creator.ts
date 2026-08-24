import { z } from "zod";

/** โปรไฟล์ครีเอเตอร์ — username เป็น handle บนหน้า /creator/[username] */
export const creatorProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "username ต้องเป็น a-z 0-9 _ ความยาว 3-20 ตัวอักษร")
    .optional(),
  bio: z.string().trim().max(500).optional(),
  avatarUrl: z.string().trim().url().max(500).optional(),
});

export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;
