/**
 * Intimacy (ค่าความสนิท user ↔ character)
 *
 * - เก็บแค่ points สะสมใน character_affinities — เลเวล derive จากช่วงคะแนนที่นี่
 * - directive ต่อเลเวลถูก inject เข้า system prompt เพื่อให้ตัวละคร
 *   ปรับน้ำเสียงการพูดตามความสนิทจริง ๆ
 */

import type { AppLocale } from "@/i18n/routing";

export interface IntimacyLevel {
  level: number;
  label: string;
  labelEn: string;
  /** คะแนนต่ำสุดของเลเวลนี้ (inclusive) */
  minPoints: number;
  /** คะแนนที่ต้องถึงเพื่อเลื่อนเลเวลถัดไป — null = เลเวลสูงสุด */
  nextLevelAt: number | null;
  /** คำสั่งสำหรับ LLM — น้ำเสียง/ระยะใกล้ของตัวละครที่เลเวลนี้ */
  directive: string;
  directiveEn: string;
}

export const INTIMACY_LEVELS: readonly IntimacyLevel[] = [
  {
    level: 1,
    label: "คนแปลกหน้า",
    labelEn: "Stranger",
    minPoints: 0,
    nextLevelAt: 30,
    directive:
      "ยังไม่คุ้นเคย — พูดสุภาพ กึงระยะ ระวังคำ ยังไม่เปิดใจเรื่องส่วนตัว อาจตอบสั้นหรือสอบถามผู้ใช้ก่อน",
    directiveEn:
      "Still unfamiliar — polite, a bit distant, careful with personal topics; short replies or questions first are fine",
  },
  {
    level: 2,
    label: "คนรู้จัก",
    labelEn: "Acquaintance",
    minPoints: 30,
    nextLevelAt: 80,
    directive:
      "เริ่มคุ้นกัน — เป็นมิตรขึ้น มีมุกหยอกบ้าง ยินดีแชร์เรื่องทั่วไป แต่เรื่องลึกส่วนตัวยังระวัง",
    directiveEn:
      "Getting familiar — friendlier, light teasing OK, share everyday topics but stay careful with deep personal details",
  },
  {
    level: 3,
    label: "เพื่อนสนิท",
    labelEn: "Close friend",
    minPoints: 80,
    nextLevelAt: 160,
    directive:
      "สนิทเป็นเพื่อน — อบอุ่น เป็นกันเอง แซวได้บ่อยขึ้น เล่าเรื่องส่วนตัวได้มากขึ้น แสดงห่วงใยผู้ใช้ชัดเจน",
    directiveEn:
      "Close friends — warm, casual, more teasing, more personal stories, clear care for the user",
  },
  {
    level: 4,
    label: "สนิทใจ",
    labelEn: "Confidant",
    minPoints: 160,
    nextLevelAt: 300,
    directive:
      "ไว้ใจลึก — เปิดใจเล่าเรื่องที่ไม่ค่อยบอกใคร เรียกผู้ใช้ด้วยชื่อเล่นได้ มีความห่วงใยแบบคนสนิทใจ",
    directiveEn:
      "Deep trust — share things rarely told to others, nicknames OK, care like a true confidant",
  },
  {
    level: 5,
    label: "ผู้พิเศษ",
    labelEn: "Special someone",
    minPoints: 300,
    nextLevelAt: null,
    directive:
      "คนพิเศษที่สุด — น้ำเสียงอ่อนโยนแบบที่สงวนไว้ให้คนพิเศษเท่านั้น ซึ้งและจริงใจ มีคำหวานเฉพาะตัวได้",
    directiveEn:
      "Most special — a soft tone reserved for them alone; sincere, heartfelt, unique affection is welcome",
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

export function intimacyForPrompt(level: IntimacyLevel, locale: AppLocale = "th") {
  return {
    level: level.level,
    label: locale === "en" ? level.labelEn : level.label,
    directive: locale === "en" ? level.directiveEn : level.directive,
  };
}
