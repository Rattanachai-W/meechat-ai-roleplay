-- M15–M18: locale prefs, bilingual characters, reports, payout readiness

CREATE TYPE "AppLocaleCode" AS ENUM ('th', 'en');
CREATE TYPE "PreferredCurrency" AS ENUM ('THB', 'USD');
CREATE TYPE "CharacterLanguage" AS ENUM ('TH', 'EN', 'BILINGUAL');
CREATE TYPE "ReportTargetType" AS ENUM ('CHARACTER', 'MESSAGE', 'CREATOR');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');
CREATE TYPE "PayoutStatus" AS ENUM ('NONE', 'PENDING_KYC', 'READY', 'SUSPENDED');

ALTER TABLE "users"
  ADD COLUMN "preferred_locale" "AppLocaleCode" NOT NULL DEFAULT 'th',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  ADD COLUMN "preferred_currency" "PreferredCurrency" NOT NULL DEFAULT 'THB',
  ADD COLUMN "mature_confirmed_at" TIMESTAMP(3);

ALTER TABLE "creator_profiles"
  ADD COLUMN "payout_status" "PayoutStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "payout_ready_at" TIMESTAMP(3),
  ADD COLUMN "kyc_note" TEXT;

ALTER TABLE "characters"
  ADD COLUMN "tagline_en" TEXT,
  ADD COLUMN "description_en" TEXT,
  ADD COLUMN "primary_language" "CharacterLanguage" NOT NULL DEFAULT 'TH';

CREATE INDEX "characters_primary_language_idx" ON "characters"("primary_language");

CREATE TABLE "reports" (
  "id" UUID NOT NULL,
  "reporter_id" UUID NOT NULL,
  "target_type" "ReportTargetType" NOT NULL,
  "target_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "admin_note" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");
CREATE INDEX "reports_reporter_id_created_at_idx" ON "reports"("reporter_id", "created_at");

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_reporter_id_fkey"
  FOREIGN KEY ("reporter_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
