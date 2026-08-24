// Seed stealth/ox-alpha เป็น default model + ปิด model ที่ OpenRouter ปลดแล้ว (404)
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

// โมเดลหลักของแพลตฟอร์ม
await db.query(
  `insert into ai_models (model_key, provider, provider_model_id, display_name, input_cost_per_million, output_cost_per_million, energy_multiplier, max_context_tokens, is_enabled, sort_order)
   values ('stealth/ox-alpha', 'openrouter', 'stealth/ox-alpha', 'Ox Alpha', 0.5, 1.5, 1.0, 128000, true, 0)
   on conflict (model_key) do update set
     provider_model_id = 'stealth/ox-alpha',
     is_enabled = true,
     sort_order = 0`
);

// ปิดโมเดลที่ตาย (404 จาก probe)
await db.query(
  `update ai_models set is_enabled = false
    where model_key in ('google/gemini-2.0-flash-001','anthropic/claude-3.5-haiku','google/gemma-3-27b-it:free')`
);

const r = await db.query(
  "select model_key, is_enabled, sort_order from ai_models order by sort_order"
);
for (const row of r.rows) console.log(`${row.is_enabled ? "on " : "off"} ${row.model_key} (${row.sort_order})`);

await db.end();
