import { z } from "zod";

/**
 * Centralized environment config.
 *
 * สำคัญ: NEXT_PUBLIC_* ต้องอ้างผ่าน process.env.NAME แบบระบุชื่อตรง ๆ เท่านั้น
 * เพราะ Next.js inline ค่าเหล่านี้ลง client bundle ตอน compile —
 * การอ่านแบบ dynamic เช่น Object.entries(process.env) จะได้ค่าว่างฝั่ง browser
 *
 * ทุกตัวแปรเป็น optional ตอน build เพื่อให้ project build ได้ก่อนตั้งค่าครบ
 * แต่ feature ที่ต้องใช้จะ throw ตอน runtime ผ่าน require*() helpers
 */

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  LLM_API_URL: z.string().url().optional(),
  LLM_MODEL: z.string().min(1).optional(),
  LLM_API_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
});

const rawServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== "")
);

const serverParsed = serverEnvSchema.safeParse(rawServerEnv);

if (!serverParsed.success) {
  console.error("Invalid server env:", serverParsed.error.flatten().fieldErrors);
}

export const env = {
  ...(serverParsed.success ? serverParsed.data : {}),
};

export function isAuthConfigured(): boolean {
  return Boolean(env.DATABASE_URL && env.BETTER_AUTH_SECRET && env.BETTER_AUTH_URL);
}

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. ตั้งค่าใน .env ก่อน (ดูตัวอย่างที่ .env.example)");
  }
  return env.DATABASE_URL;
}
