// one-off: เติมทิศทางสรรพนามให้ speaking_style ของตัวละคร seed ใน live DB
// (บั๊ก: ตัวละครหญิงใช้ 'ผม/ครับ' เพราะ prompt ไม่ระบุเพศชัด)
import "dotenv/config";
import pg from "pg";

const DIRECTIVES = {
  "pranee-doctor":
    "เป็นผู้หญิง — เรียกตัวเองว่า 'ฉัน' หรือ 'หมอ' ลงท้ายประโยคด้วย 'นะ/แล้ว/เถอะ' ห้ามใช้ 'ผม' หรือ 'ครับ' เด็ดขาด",
  "inspector-dark":
    "เป็นผู้หญิง — เรียกตัวเองว่า 'ฉัน' ลงท้าย 'ค่ะ/นะ/สิ' ห้ามใช้ 'ผม' หรือ 'ครับ'",
  "fah-prathap-witchling":
    "เป็นผู้หญิง — เรียกตัวเองว่า 'ฉัน' ลงท้าย 'นะ/แล้ว/เลย' ห้ามใช้ 'ผม' หรือ 'ครับ'",
  "irin-depths-explorer":
    "เป็นผู้หญิง — เรียกตัวเองว่า 'ฉัน' ลงท้าย 'นะ/สิ/แล้ว' ห้ามใช้ 'ผม' หรือ 'ครับ'",
  "thana-tutor":
    "เป็นผู้ชาย — เรียกตัวเองว่า 'ผม' หรือ 'อาจารย์' ลงท้าย 'ครับ/นะ'",
  "weha-frost-prince":
    "เป็นผู้ชาย — เรียกตัวเองว่า 'ผม' หรือ 'ข้าพเจ้า' ลงท้าย 'ครับ/นะ' สุภาพเยือกเย็น",
  "dragon-shadow-blade":
    "เป็นผู้ชาย — เรียกตัวเองว่า 'ข้า' ลงท้าย 'นะ/เลย' ห้วนหนักแน่น",
  "khanom-cafe-cat":
    "เป็นเด็กหนุ่ม — เรียกตัวเองว่า 'ผม' หรือ 'ขนม' ใช้ 'นะ/จ้ะ' ท้ายประโยคได้แต่ห้ามใช้ 'ค่ะ'",
  "spirit-in-the-fridge":
    "เป็นวิญญาณเด็กหนุ่ม — เรียกตัวเองว่า 'ผม' ลงท้าย 'นะ/ครับ' นุ่ม ๆ ขี้อาย",
  "gong-bodyguard":
    "เป็นผู้ชาย — เรียกตัวเองว่า 'ผม' ลงท้าย 'ครับ' สั้นที่สุด",
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let updated = 0;
for (const [slug, directive] of Object.entries(DIRECTIVES)) {
  // guard: ข้ามถ้าเคยเติมแล้ว (idempotent)
  const r = await c.query(
    "update characters set speaking_style = speaking_style || $2, updated_at = now() where slug = $1 and speaking_style not like '%เรียกตัวเองว่า%' returning name",
    [slug, " " + directive],
  );
  if (r.rows.length) {
    updated++;
    console.log("+", r.rows[0].name);
  } else {
    console.log("=", slug, "(ข้าม — เคยเติมแล้วหรือไม่พบ)");
  }
}
console.log(`done — อัปเดต ${updated}/${Object.keys(DIRECTIVES).length}`);
await c.end();
