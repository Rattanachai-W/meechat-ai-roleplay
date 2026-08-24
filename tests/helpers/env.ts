import "dotenv/config";

export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
export const SB_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://yauoirkmvouoownxtbhr.supabase.co";
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres.yauoirkmvouoownxtbhr:YYXbS4HCIitB8aTJ@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

/** ชุดที่ยิง HTTP ต้องมี dev server — เรียกใน beforeAll ของ suite ฝั่ง HTTP */
export async function requireDevServer(): Promise<void> {
  const res = await fetch(`${BASE}/api/models`).catch(() => null);
  if (!res) {
    throw new Error(`dev server ไม่ตอบที่ ${BASE} — รัน "npm run dev" ก่อนแล้วค่อยรัน suite นี้`);
  }
}
