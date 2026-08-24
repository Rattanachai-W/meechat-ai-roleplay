import "dotenv/config";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Client } from "pg";

const NAME = "20260824000000_creator_system";
const FILE = `prisma/migrations/${NAME}/migration.sql`;
const sql = readFileSync(FILE, "utf8");

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  const already = await c.query("select 1 from _prisma_migrations where migration_name=$1", [NAME]);
  if (already.rowCount > 0) {
    console.log("already applied — skip");
  } else {
    await c.query(sql);
    const checksum = createHash("sha256").update(sql).digest("hex");
    await c.query(
      "insert into _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) values (gen_random_uuid(), $1, now(), $2, NULL, NULL, now(), 0)",
      [checksum, NAME]
    );
    console.log("APPLIED + registered:", NAME);
  }
} finally {
  await c.end();
}
