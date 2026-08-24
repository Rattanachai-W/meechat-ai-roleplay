-- Quests (ภารกิจประจำตัวละคร) — manual migration
-- (shared DB กับโปรเจกต์อื่น — migrate dev จะพยายาม reset และ drop ตาราง
--  ของอีกโปรเจกต์ จึง apply ไฟล์นี้เองและ register ใน _prisma_migrations)

-- CreateEnum
CREATE TYPE "QuestGoalType" AS ENUM ('MESSAGES', 'STREAK_DAYS', 'AI_TOPIC');

-- AlterEnum
ALTER TYPE "EnergyTransactionType" ADD VALUE 'QUEST_REWARD';

-- CreateTable character_quests
CREATE TABLE "character_quests" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "goal_type" "QuestGoalType" NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "criteria_prompt" TEXT,
    "reward_energy" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable user_quest_progress
CREATE TABLE "user_quest_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "quest_id" UUID NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "last_bump_on" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),

    CONSTRAINT "user_quest_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_quests_character_id_sort_order_idx" ON "character_quests"("character_id", "sort_order");

-- CreateIndex
CREATE INDEX "user_quest_progress_user_id_idx" ON "user_quest_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_quest_progress_user_id_quest_id_key" ON "user_quest_progress"("user_id", "quest_id");

-- AddForeignKey
ALTER TABLE "character_quests" ADD CONSTRAINT "character_quests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_quest_progress" ADD CONSTRAINT "user_quest_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_quest_progress" ADD CONSTRAINT "user_quest_progress_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "character_quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
