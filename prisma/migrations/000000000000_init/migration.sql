-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ContentRating" AS ENUM ('GENERAL', 'MATURE');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('COMPLETED', 'ABORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('FACT', 'RELATIONSHIP', 'EVENT', 'PREFERENCE', 'PROMISE', 'SECRET', 'GOAL');

-- CreateEnum
CREATE TYPE "EnergyTransactionType" AS ENUM ('DAILY_REWARD', 'PURCHASE', 'CHAT_USAGE', 'REGENERATE', 'REFUND', 'ADMIN_ADJUSTMENT', 'PROMOTION', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM ('SUCCESS', 'ERROR', 'TIMEOUT', 'CONTENT_REJECTED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('CHARACTER', 'MESSAGE', 'CREATOR');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_personas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "age" INTEGER,
    "description" TEXT,
    "personality" TEXT,
    "appearance" TEXT,
    "additional_context" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "bio" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "personality" TEXT,
    "scenario" TEXT,
    "speaking_style" TEXT,
    "first_message" TEXT NOT NULL,
    "avatar_url" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "content_rating" "ContentRating" NOT NULL DEFAULT 'GENERAL',
    "chat_count" INTEGER NOT NULL DEFAULT 0,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "default_model_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_tags" (
    "character_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "character_tags_pkey" PRIMARY KEY ("character_id","tag_id")
);

-- CreateTable
CREATE TABLE "character_examples" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "user_turn" TEXT NOT NULL,
    "character_turn" TEXT NOT NULL,

    CONSTRAINT "character_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "persona_id" UUID,
    "title" TEXT NOT NULL DEFAULT 'การสนทนาใหม่',
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "parent_message_id" UUID,
    "variant_index" INTEGER NOT NULL DEFAULT 0,
    "is_active_variant" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "status" "MessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "type" "MemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "source_message_id" UUID,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_summaries" (
    "conversation_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "summarized_until_message_id" UUID,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","character_id")
);

-- CreateTable
CREATE TABLE "character_likes" (
    "user_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_likes_pkey" PRIMARY KEY ("user_id","character_id")
);

-- CreateTable
CREATE TABLE "creator_follows" (
    "user_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_follows_pkey" PRIMARY KEY ("user_id","creator_id")
);

-- CreateTable
CREATE TABLE "energy_wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "free_balance" INTEGER NOT NULL DEFAULT 0,
    "paid_balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime_earned" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "energy_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "EnergyTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "energy_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" UUID NOT NULL,
    "model_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "input_cost_per_million" DECIMAL(12,4) NOT NULL,
    "output_cost_per_million" DECIMAL(12,4) NOT NULL,
    "energy_multiplier" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "max_context_tokens" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_premium_only" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "conversation_id" UUID,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "estimated_cost" DECIMAL(12,6),
    "latency_ms" INTEGER,
    "status" "AiUsageStatus" NOT NULL,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_personas_user_id_idx" ON "user_personas"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_user_id_key" ON "creator_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_username_key" ON "creator_profiles"("username");

-- CreateIndex
CREATE UNIQUE INDEX "characters_slug_key" ON "characters"("slug");

-- CreateIndex
CREATE INDEX "characters_creator_id_idx" ON "characters"("creator_id");

-- CreateIndex
CREATE INDEX "characters_visibility_idx" ON "characters"("visibility");

-- CreateIndex
CREATE INDEX "characters_chat_count_idx" ON "characters"("chat_count");

-- CreateIndex
CREATE INDEX "characters_updated_at_idx" ON "characters"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "character_tags_tag_id_idx" ON "character_tags"("tag_id");

-- CreateIndex
CREATE INDEX "character_examples_character_id_position_idx" ON "character_examples"("character_id", "position");

-- CreateIndex
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "conversations_character_id_idx" ON "conversations"("character_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_parent_message_id_idx" ON "messages"("parent_message_id");

-- CreateIndex
CREATE INDEX "memories_conversation_id_idx" ON "memories"("conversation_id");

-- CreateIndex
CREATE INDEX "memories_character_id_user_id_idx" ON "memories"("character_id", "user_id");

-- CreateIndex
CREATE INDEX "favorites_character_id_idx" ON "favorites"("character_id");

-- CreateIndex
CREATE INDEX "character_likes_character_id_idx" ON "character_likes"("character_id");

-- CreateIndex
CREATE INDEX "creator_follows_creator_id_idx" ON "creator_follows"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "energy_wallets_user_id_key" ON "energy_wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "energy_transactions_idempotency_key_key" ON "energy_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "energy_transactions_wallet_id_created_at_idx" ON "energy_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "energy_transactions_user_id_created_at_idx" ON "energy_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_model_key_key" ON "ai_models"("model_key");

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_created_at_idx" ON "ai_usage_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_conversation_id_idx" ON "ai_usage_logs"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_status_created_at_idx" ON "ai_usage_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- AddForeignKey
ALTER TABLE "user_personas" ADD CONSTRAINT "user_personas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_tags" ADD CONSTRAINT "character_tags_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_tags" ADD CONSTRAINT "character_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_examples" ADD CONSTRAINT "character_examples_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "user_personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_likes" ADD CONSTRAINT "character_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_likes" ADD CONSTRAINT "character_likes_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_follows" ADD CONSTRAINT "creator_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_follows" ADD CONSTRAINT "creator_follows_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_wallets" ADD CONSTRAINT "energy_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_transactions" ADD CONSTRAINT "energy_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "energy_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_transactions" ADD CONSTRAINT "energy_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

