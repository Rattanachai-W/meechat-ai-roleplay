-- Backup: public.reports (dropped 2026-08-24 — unused, 0 rows)
-- Restore manually if moderation feature is built later
CREATE TABLE IF NOT EXISTS public.reports (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "reporter_user_id" uuid NOT NULL,
  "target_type" ReportTargetType NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "details" text,
  "status" ReportStatus NOT NULL DEFAULT 'OPEN'::"ReportStatus",
  "created_at" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp without time zone NOT NULL DEFAULT now()
);
