import { z } from "zod";

/**
 * Centralized environment config.
 *
 * สำคัญ: NEXT_PUBLIC_* ต้องอ้างผ่าน process.env.NAME แบบระบุชื่อตรง ๆ เท่านั้น
 * เพราะ Next.js inline ค่าเหล่านี้ลง client bundle ตอน compile —
 * การอ่านแบบ dynamic เช่น Object.entries(process.env) จะได้ค่าว่างฝั่ง browser
 *
 * ทุกตัวแปรเป็น optional ตอน build เพื่อให้ project build ได้ก่อนตั้งค่า Supabase
 * แต่ feature ที่ต้องใช้จะ throw ตอน runtime ผ่าน require*() helpers
 */

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

// ── Client (inlined ลง bundle) ──
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

const clientParsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: emptyToUndefined(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
});

// ── Server (อ่านได้ตอน runtime — dynamic access ปลอดภัย) ──
const serverEnvSchema = z.object({
  // Database (Supabase Postgres)
  DATABASE_URL: z.string().min(1).optional(),
  // Server-side only — ห้ามเรียกใช้ใน client code
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // AI Provider
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  // Upstash Redis (rate limit / cache)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Vercel Cron protection (ถ้าตั้งจะ require Bearer token)
  CRON_SECRET: z.string().min(1).optional(),
  // Stripe (payment gateway) — server-side only, ห้าม expose
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
});

const rawServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== "")
);

const serverParsed = serverEnvSchema.safeParse(rawServerEnv);

if (!clientParsed.success) {
  console.error("❌ Invalid NEXT_PUBLIC env:", clientParsed.error.flatten().fieldErrors);
}
if (!serverParsed.success) {
  // แจ้งเฉพาะรูปแบบที่ผิด (เช่น URL ไม่ถูกต้อง) ไม่ใช่ค่าที่ยังไม่ได้ตั้ง
  console.error("❌ Invalid server env:", serverParsed.error.flatten().fieldErrors);
}

export const env = {
  ...(clientParsed.success ? clientParsed.data : {}),
  ...(serverParsed.success ? serverParsed.data : {}),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function requireSupabaseConfig(): { url: string; anonKey: string } {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env ก่อน (ดูตัวอย่างที่ .env.example)"
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. ตั้งค่าใน .env ก่อน (ดูตัวอย่างที่ .env.example)");
  }
  return env.DATABASE_URL;
}
