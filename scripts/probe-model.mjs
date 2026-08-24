// ดู model ที่ใช้ล่าสุดใน ai_usage_logs + ai_models config
import { Client } from "pg";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
function envOf(key) {
  const m = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
}
const db = new Client({
  connectionString: envOf("DATABASE_URL").replace("postgresql+pg://", "postgresql://"),
});
await db.connect();

const logs = await db.query(
  "select model_key, status, error_code, created_at from ai_usage_logs where feature='chat' order by created_at desc limit 3"
);
console.log("usage logs:", logs.rows);

const ch = await db.query("select slug, default_model_key from characters where slug='pranee-doctor'");
console.log("character:", ch.rows);

const am = await db.query(
  "select model_key, provider_model_id, is_enabled, sort_order from ai_models order by sort_order"
);
for (const r of am.rows) console.log(`model: ${r.model_key} -> ${r.provider_model_id} enabled=${r.is_enabled} sort=${r.sort_order}`);

await db.end();
