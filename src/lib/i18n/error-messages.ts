import type { ApiErrorCode } from "@/lib/api/errors";
import type { AppLocale } from "@/i18n/routing";

const TH: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: "กรุณาเข้าสู่ระบบก่อนใช้งาน",
  FORBIDDEN: "คุณไม่มีสิทธิ์ทำรายการนี้",
  NOT_FOUND: "ไม่พบข้อมูลที่ต้องการ",
  VALIDATION_ERROR: "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
  INSUFFICIENT_ENERGY: "พลังงานไม่เพียงพอ กดรับพลังงานรายวันที่หน้า Wallet ก่อนใช้งาน",
  RATE_LIMITED: "พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  MODEL_UNAVAILABLE: "โมเดล AI ไม่พร้อมใช้งานชั่วคราว ลองเปลี่ยนโมเดลหรือลองอีกครั้ง",
  CONTENT_REJECTED: "โมเดลปฏิเสธเนื้อหาส่วนนี้ กรุณาลองเขียนใหม่",
  LLM_TIMEOUT: "AI ใช้เวลาตอบนานเกินไป กรุณาลองอีกครั้ง",
  PAYMENTS_DISABLED: "ระบบชำระเงินยังไม่เปิดใช้งาน รับพลังงานรายวันได้ที่หน้า Wallet",
  PAYMENT_FAILED: "การชำระเงินยังไม่สำเร็จหรือถูกยกเลิก — ไม่มีการตัดเงิน",
  INTERNAL_ERROR: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองอีกครั้ง",
};

const EN: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: "Please sign in to continue",
  FORBIDDEN: "You do not have permission for this action",
  NOT_FOUND: "The requested resource was not found",
  VALIDATION_ERROR: "Invalid input. Please check and try again",
  INSUFFICIENT_ENERGY: "Not enough energy. Claim your daily reward on the Wallet page first",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again",
  MODEL_UNAVAILABLE: "The AI model is temporarily unavailable. Try another model or retry",
  CONTENT_REJECTED: "The model rejected this content. Please rephrase",
  LLM_TIMEOUT: "The AI took too long to reply. Please try again",
  PAYMENTS_DISABLED: "Payments are not enabled yet. Claim daily energy on the Wallet page",
  PAYMENT_FAILED: "Payment was not completed or was cancelled — you were not charged",
  INTERNAL_ERROR: "Something went wrong. Please try again",
};

export function apiErrorMessage(code: ApiErrorCode, locale: AppLocale = "th"): string {
  return (locale === "en" ? EN : TH)[code];
}

export function validationDetailMessage(detail: string, locale: AppLocale = "th"): string {
  return locale === "en"
    ? `Invalid input (${detail})`
    : `ข้อมูลไม่ถูกต้อง (${detail})`;
}
