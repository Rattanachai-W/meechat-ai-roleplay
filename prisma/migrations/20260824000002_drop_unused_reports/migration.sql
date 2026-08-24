-- DropUnusedReports — ระบบ report/moderation ยังไม่ implement (ไม่มี API/service/UI)
-- ตารางว่าง 0 แถว; backup DDL: backups/reports-table-backup.sql
-- หมายเหตุ: migration นี้ apply เข้า DB แบบ manual (shared DB ห้าม prisma migrate dev)

ALTER TABLE "reports" DROP CONSTRAINT "reports_reporter_user_id_fkey";

DROP TABLE "reports";

DROP TYPE "ReportStatus";

DROP TYPE "ReportTargetType";
