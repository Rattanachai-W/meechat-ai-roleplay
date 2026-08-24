-- Intimacy/Affinity (ค่าความสนิท) — manual migration
-- (shared DB กับโปรเจกต์อื่น — migrate dev จะพยายาม reset และ drop ตาราง
--  ของอีกโปรเจกต์ จึง apply ไฟล์นี้เองและ register ใน _prisma_migrations)
--
-- 1) character_affinities: ความสนิทสะสมต่อ (user, character) — unique pair
-- 2) character_quests: เปลี่ยนรางวัลจาก reward_energy → reward_intimacy
--    backfill แถว default เดิมตามค่า energy เด่า ๆ (10→8, 15→10, 20→12, 25→20, 30→15)

-- CreateTable character_affinities
CREATE TABLE "character_affinities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_affinities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "character_affinities_user_id_character_id_key" ON "character_affinities"("user_id", "character_id");

-- CreateIndex
CREATE INDEX "character_affinities_character_id_points_idx" ON "character_affinities"("character_id", "points");

-- AddForeignKey
ALTER TABLE "character_affinities" ADD CONSTRAINT "character_affinities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_affinities" ADD CONSTRAINT "character_affinities_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable character_quests: เพิ่มคอลัมน์ใหม่ก่อน แล้ว backfill จากค่าเดิม
ALTER TABLE "character_quests" ADD COLUMN "reward_intimacy" INTEGER NOT NULL DEFAULT 10;

-- Backfill: ภารกิจที่มีอยู่ทั้งหมดเป็น default set (energy 10/15/20/25/30)
UPDATE "character_quests" SET "reward_intimacy" = CASE
    WHEN "reward_energy" >= 30 THEN 15
    WHEN "reward_energy" >= 25 THEN 20
    WHEN "reward_energy" >= 20 THEN 12
    WHEN "reward_energy" >= 15 THEN 10
    ELSE 8
END;

-- AlterTable character_quests: เลิกใช้รางวัลเป็นเหรียญ (กันเงินเฟ้อ) — drop คอลัมน์เดิม
ALTER TABLE "character_quests" DROP COLUMN "reward_energy";
