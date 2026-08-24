-- Creator Studio (docs/creator-system.md)
-- Manual migration (shared DB กับโปรเจกต์อื่น — migrate dev จะพยายาม reset
-- และ drop ตารางของอีกโปรเจกต์ จึง apply ไฟล์นี้เองและ register ใน _prisma_migrations)

-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CreatorEarningType" AS ENUM ('CHAT_SHARE', 'BONUS', 'ADJUSTMENT');

-- AlterTable characters: publishing state machine
ALTER TABLE "characters" ADD COLUMN "status" "CharacterStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "review_note" TEXT,
ADD COLUMN "published_at" TIMESTAMP(3);

-- AlterTable creator_profiles: earnings counter
ALTER TABLE "creator_profiles" ADD COLUMN "total_earned" INTEGER NOT NULL DEFAULT 0;

-- CreateTable creator_earnings (append-only ledger)
CREATE TABLE "creator_earnings" (
    "id" UUID NOT NULL,
    "creator_user_id" UUID NOT NULL,
    "character_id" UUID,
    "type" "CreatorEarningType" NOT NULL DEFAULT 'CHAT_SHARE',
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_earnings_idempotency_key_key" ON "creator_earnings"("idempotency_key");

-- CreateIndex
CREATE INDEX "creator_earnings_creator_user_id_created_at_idx" ON "creator_earnings"("creator_user_id", "created_at");

-- CreateIndex
CREATE INDEX "creator_earnings_character_id_idx" ON "creator_earnings"("character_id");

-- CreateIndex
CREATE INDEX "characters_status_idx" ON "characters"("status");

-- Backfill: ตัวละครที่มีอยู่ก่อนหน้า (seed meemee-studio) ถือว่า published แล้ว
UPDATE "characters" SET "status" = 'PUBLISHED', "published_at" = "created_at";
