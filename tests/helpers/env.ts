import "dotenv/config";

export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://meechat:meechat@localhost:5432/meechat";

/** ชุดที่ยิง HTTP ต้องมี dev server — เรียกใน beforeAll ของ suite ฝั่ง HTTP */
export async function requireDevServer(): Promise<void> {
  const res = await fetch(`${BASE}/api/models`).catch(() => null);
  if (!res) {
    throw new Error(`dev server ไม่ตอบที่ ${BASE} — รัน "npm run dev" ก่อนแล้วค่อยรัน suite นี้`);
  }
}
