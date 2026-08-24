import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7 ใช้ driver adapter — connection string มาจาก DATABASE_URL
function createPrismaClient(): PrismaClient {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. ตั้งค่าใน .env ก่อน (ดูตัวอย่างที่ .env.example)"
    );
  }
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // Supabase Supavisor (session mode) จำกัด ~15 sessions — pg.Pool default max=10
    // ต่อ 1 client instance และ Next dev/worker spawn หลาย instance → ต้อง cap เอง
    max: Number(process.env.DATABASE_POOL_MAX ?? 4),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
