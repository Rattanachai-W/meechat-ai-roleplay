import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_URL } from "../helpers/env";
import { connectDb, closeDb, q } from "../helpers/db";

/**
 * Database Migration / Schema integrity:
 * - _prisma_migrations บันทึกครบทุก migration ใน prisma/migrations
 * - `prisma migrate status` exit 0
 * - live DB ↔ schema.prisma drift จำกัดเฉพาะตารางของโปรเจกต์อื่น (ห้ามแตะ)
 * - seed SQL idempotent: รันซ้ำได้ ไม่เปลี่ยน counts
 */

const FOREIGN_TABLES = new Set([
  "stories",
  "npcs",
  "game_sessions",
  "reader_profiles",
  "story_favorites",
  "story_ratings",
  "story_save_slots",
  "player_logs",
]);

const MEECHAT_TABLES = [
  "users", "creator_profiles", "characters", "tags", "character_tags", "character_examples",
  "conversations", "messages", "memories", "conversation_summaries", "favorites", "character_likes",
  "creator_follows", "energy_wallets", "energy_transactions", "ai_models", "ai_usage_logs",
  "user_personas", "character_quests", "user_quest_progress", "character_affinities", "creator_earnings",
];

beforeAll(async () => {
  await connectDb();
});

afterAll(async () => {
  await closeDb();
});

describe("migration state", () => {
  it("_prisma_migrations มีทุก directory ใน prisma/migrations", async () => {
    const applied = await q<{ migration_name: string }>(
      "select migration_name from _prisma_migrations order by migration_name"
    );
    const dirs = execSync(`ls prisma/migrations`, { encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.includes("migration_lock"));
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(applied.rows.some((r) => r.migration_name === dir), `missing migration: ${dir}`).toBe(true);
    }
  });

  it("prisma migrate status exit 0", () => {
    const out = execSync("npx prisma migrate status", {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL },
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(out.toLowerCase()).not.toContain("have not yet been applied");
    expect(out.toLowerCase()).not.toContain("failed");
  }, 120_000);
});

describe("schema drift vs prisma/schema.prisma", () => {
  /**
   * Drift ที่ยอมรับได้ (known-benign):
   * - `ALTER COLUMN ... DROP DEFAULT` — live DB สร้าง default (gen_random_uuid/now)
   *   ผ่าน SQL migrations ส่วน schema.prisma ไม่ประกาศ dbgenerated() — เป็น noise
   *   metadata-level ไม่กระทบข้อมูล
   * - DROP TABLE/DropForeignKey ของ 8 ตาราง story-project (ไม่อยู่ใน schema เรา)
   *   — diff อยากลบ แต่เราห้ามแตะ จึง assert ว่ามีแค่นั้นและไม่มีเกิน
   */
  it("diff (live→schema) ไม่มี destructive statement บนตารางของ MeeChat", () => {
    const diff = execSync(
      `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`,
      { encoding: "utf8", env: { ...process.env, DATABASE_URL }, stdio: ["pipe", "pipe", "pipe"] }
    );

    // 1) DROP TABLE ทั้งหมดต้องเป็นตารางของโปรเจกต์อื่นเท่านั้น
    const droppedTables = [...diff.matchAll(/DROP TABLE "?(\w+)"?/g)].map((m) => m[1]);
    expect(droppedTables.length).toBeGreaterThan(0);
    expect(
      droppedTables.filter((t) => !FOREIGN_TABLES.has(t)),
      `ห้ามมี DROP TABLE บนตาราง MeeChat: ${droppedTables.join(", ")}`
    ).toEqual([]);

    // 2) ไม่มี destructive op ใด ๆ บนตาราง MeeChat (ยกเว้น DROP DEFAULT ที่ benign)
    const destructiveLines: string[] = [];
    for (const rawLine of diff.split("\n")) {
      const line = rawLine.trim();
      if (/DROP DEFAULT/i.test(line)) continue;
      if (!/^(ALTER TABLE|DROP TABLE|DROP INDEX|-- )/i.test(line)) continue;
      const touchesMeechat = MEECHAT_TABLES.some((t) =>
        new RegExp(`"${t}"`, "i").test(line) || new RegExp(`\\b${t}\\b`, "i").test(line.replace(/"/g, ""))
      );
      const isDestructive =
        /DROP COLUMN/i.test(line) ||
        /DROP NOT NULL/i.test(line) ||
        /\bTYPE\b/i.test(line) || // ALTER COLUMN x TYPE ...
        /^DROP (TABLE|INDEX)/i.test(line);
      if (touchesMeechat && isDestructive && !/^-- /.test(line)) {
        destructiveLines.push(line);
      }
    }
    expect(destructiveLines, `พบ destructive drift:\n${destructiveLines.join("\n")}`).toEqual([]);

    console.log(`[drift] DROP TABLE (foreign only): ${droppedTables.join(", ")}`);
  }, 180_000);

  it("ตาราง MeeChat ครบทุก model + ตารางต่างชาติ 8 ตัวยังอยู่ untouched", async () => {
    for (const t of MEECHAT_TABLES) {
      const r = await q(`select to_regclass('public.${t}') as reg`);
      expect(r.rows[0].reg, `missing table ${t}`).not.toBeNull();
    }
    for (const t of FOREIGN_TABLES) {
      const r = await q(`select to_regclass('public.${t}') as reg`);
      expect(r.rows[0].reg, `foreign table ${t} ถูกลบ!`).not.toBeNull();
    }
  });
});

describe("seed SQL idempotency", () => {
  it("รัน 002_seed_models_tags.sql ซ้ำ → counts คงเดิม, ไม่ error", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/sql/002_seed_models_tags.sql", "utf8");

    const beforeModels = await q<{ n: number }>("select count(*)::int n from ai_models");
    const beforeTags = await q<{ n: number }>("select count(*)::int n from tags");

    await q(sql); // run 1
    await q(sql); // run 2

    const afterModels = await q<{ n: number }>("select count(*)::int n from ai_models");
    const afterTags = await q<{ n: number }>("select count(*)::int n from tags");
    expect(afterModels.rows[0].n).toBe(beforeModels.rows[0].n);
    expect(afterTags.rows[0].n).toBe(beforeTags.rows[0].n);

    // default model ยังเป็น stealth/ox-alpha enabled
    const def = await q<{ is_enabled: boolean }>(
      "select is_enabled from ai_models where model_key='stealth/ox-alpha'"
    );
    expect(def.rows[0].is_enabled).toBe(true);
  });
});
