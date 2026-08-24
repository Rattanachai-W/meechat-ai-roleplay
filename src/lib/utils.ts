import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ตรวจก่อนส่งเป็นเงื่อนไขคอลัมน์ @db.Uuid — ไม่งั้น Postgres throw invalid uuid */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
