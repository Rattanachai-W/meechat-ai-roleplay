-- CreateEnum
CREATE TYPE "ConversationEndedReason" AS ENUM ('KICKED');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "ended_at" TIMESTAMP(3),
ADD COLUMN "ended_reason" "ConversationEndedReason";
