// เติมภารกิจ AI_TOPIC default (สายสนทนา) ให้ตัวละครเดิมทุกตัวที่ยังไม่มี
// — ensureDefaultQuests สร้างเฉพาะตอน character ยังไม่มี quest เลย ตัวละครเก่าจึงตกหล่น
// รัน: node scripts/backfill-quest-defaults.mjs (idempotent — ข้ามตัวที่มี AI_TOPIC แล้ว)
import "dotenv/config";
import { randomUUID } from "crypto";
import pg from "pg";

const AI_TOPIC_DEFAULTS = [
  {
    title: "ทำให้เขาหัวเราะ",
    description: "เล่าเรื่องหรือมุกจนตัวละครหัวเราะ — AI ตัดสินจากบทสนทนา",
    criteria:
      "ผู้ใช้เล่าเรื่องหรือมุกที่ทำให้ตัวละครแสดงปฏิกิริยาขำ/หัวเราะจริง ๆ ในบทสนทนา " +
      "(เช่น ตอบด้วยอารมณ์หัวเราะ ขำจนตกเก้าอี้ หรืออมยิ้ม) — การพูดคุยทั่วไปที่ไม่มีปฏิกิริยาขำไม่นับ",
    reward: 10,
    sort: 40,
  },
  {
    title: "เปิดใจสนิท",
    description: "คุยจนตัวละครเปิดใจเล่าเรื่องส่วนตัวที่ไม่เคยเล่าให้ใครฟัง — AI ตัดสินจากบทสนทนา",
    criteria:
      "ตัวละครเปิดใจเล่าเรื่องส่วนตัว ความทรงจำ ความกลัว หรือความลับลึก ๆ ของตัวเองกับผู้ใช้อย่างจริงใจ " +
      "(เช่น อดีตที่ต้องซ่อน เรื่องที่ไม่เคยบอกใคร) — การทักทายหรือคุยผิวเผินไม่นับ",
    reward: 20,
    sort: 50,
  },
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const characters = await client.query("select id, name from characters");
let added = 0;
for (const ch of characters.rows) {
  const has = await client.query(
    "select 1 from character_quests where character_id = $1 and goal_type = 'AI_TOPIC' limit 1",
    [ch.id]
  );
  if (has.rows.length > 0) continue;
  for (const q of AI_TOPIC_DEFAULTS) {
    await client.query(
      `insert into character_quests
        (id, character_id, goal_type, target, title, description, criteria_prompt, reward_intimacy, sort_order)
       values ($1, $2, 'AI_TOPIC', 1, $3, $4, $5, $6, $7)`,
      [randomUUID(), ch.id, q.title, q.description, q.criteria, q.reward, q.sort]
    );
    added++;
  }
  console.log(`+ ${ch.name}: เพิ่ม 2 ภารกิจ AI_TOPIC`);
}

console.log(`done — เพิ่ม ${added} quest ใน ${characters.rows.length} ตัวละคร`);
await client.end();
