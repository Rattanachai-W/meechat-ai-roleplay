-- App settings KV (manual migration — shared DB กับโปรเจกต์อื่น)
-- MVP: แอดมินปรับค่า config ที่ละเอียดอ่อนต่อเกมด้วย SQL ตรง ๆ ไม่ต้องสร้าง UI
-- เช่น จำนวนพลังงานแจกรายวัน:
--   update app_settings set value = '75', updated_at = now() where key = 'daily_reward_amount';

-- CreateTable app_settings
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- seed ค่าเริ่มต้น = ค่าคงที่เดิมในโค้ด (src/lib/energy/pricing.ts)
INSERT INTO "app_settings" ("key", "value")
VALUES ('daily_reward_amount', '50')
ON CONFLICT ("key") DO NOTHING;
