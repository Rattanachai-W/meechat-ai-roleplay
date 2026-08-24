/**
 * Intimacy (ค่าความสนิท user ↔ character)
 *
 * - เก็บแค่ points สะสมใน character_affinities — เลเวล derive จากช่วงคะแนนที่นี่
 *   (single source of truth; เปลี่ยนเกณฑ์ไม่ต้อง migrate ข้อมูล)
 * - directive ต่อเลเวลถูก inject เข้า system prompt เพื่อให้ตัวละคร
 *   ปรับน้ำเสียงการพูดตามความสนิทจริง ๆ
 */

export interface IntimacyLevel {
  level: number;
  label: string;
  /** คะแนนต่ำสุดของเลเวลนี้ (inclusive) */
  minPoints: number;
  /** คะแนนที่ต้องถึงเพื่อเลื่อนเลเวลถัดไป — null = เลเวลสูงสุด */
  nextLevelAt: number | null;
  /** คำสั่งสำหรับ LLM — น้ำเสียง/ระยะใกล้ของตัวละครที่เลเวลนี้ */
  directive: string;
}

export const INTIMACY_LEVELS: readonly IntimacyLevel[] = [
  {
    level: 1,
    label: "คนแปลกหน้า",
    minPoints: 0,
    nextLevelAt: 30,
    directive:
      "ยังไม่คุ้นเคย — พูดสุภาพ กึงระยะ ระวังคำ ยังไม่เปิดใจเรื่องส่วนตัว อาจตอบสั้นหรือสอบถามผู้ใช้ก่อน",
  },
  {
    level: 2,
    label: "คนรู้จัก",
    minPoints: 30,
    nextLevelAt: 80,
    directive:
      "เริ่มคุ้นกัน — เป็นมิตรขึ้น มีมุกหยอกบ้าง ยินดีแชร์เรื่องทั่วไป แต่เรื่องลึกส่วนตัวยังระวัง",
  },
  {
    level: 3,
    label: "เพื่อนสนิท",
    minPoints: 80,
    nextLevelAt: 160,
    directive:
      "สนิทเป็นเพื่อน — อบอุ่น เป็นกันเอง แซวได้บ่อยขึ้น เล่าเรื่องส่วนตัวได้มากขึ้น แสดงห่วงใยผู้ใช้ชัดเจน",
  },
  {
    level: 4,
    label: "สนิทใจ",
    minPoints: 160,
    nextLevelAt: 300,
    directive:
      "ไว้ใจลึก — เปิดใจเล่าเรื่องที่ไม่ค่อยบอกใคร เรียกผู้ใช้ด้วยชื่อเล่นได้ มีความห่วงใยแบบคนสนิทใจ",
  },
  {
    level: 5,
    label: "ผู้พิเศษ",
    minPoints: 300,
    nextLevelAt: null,
    directive:
      "คนพิเศษที่สุด — น้ำเสียงอ่อนโยนแบบที่สงวนไว้ให้คนพิเศษเท่านั้น ซึ้งและจริงใจ มีคำหวานเฉพาะตัวได้",
  },
] as const;

/** คะแนน → เลเวล (binary search ไม่จำเป็น — 5 ช่วง) */
export function pointsToLevel(points: number): IntimacyLevel {
  const p = Math.max(0, Math.floor(points));
  let current = INTIMACY_LEVELS[0];
  for (const lv of INTIMACY_LEVELS) {
    if (p >= lv.minPoints) current = lv;
  }
  return current;
}
