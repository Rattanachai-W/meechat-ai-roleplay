import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Error taxonomy กลางของทุก API — code เดียวกับ docs/api-routes.md
 * message เป็นภาษาไทยอ่านง่าย เพราะแสดงต่อ user ได้ทันที
 */
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INSUFFICIENT_ENERGY"
  | "RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "CONTENT_REJECTED"
  | "LLM_TIMEOUT"
  | "PAYMENTS_DISABLED"
  | "PAYMENT_FAILED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INSUFFICIENT_ENERGY: 402,
  RATE_LIMITED: 429,
  MODEL_UNAVAILABLE: 503,
  CONTENT_REJECTED: 422,
  LLM_TIMEOUT: 504,
  PAYMENTS_DISABLED: 503,
  PAYMENT_FAILED: 402,
  INTERNAL_ERROR: 500,
};

const THAI_MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
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

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? THAI_MESSAGE_BY_CODE[code]);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.name = "ApiError";
  }
}

/** รูปแบบ error body เดียวกันทั้งระบบ: { error: { code, message } } */
export function errorBody(code: ApiErrorCode, message: string) {
  return { error: { code, message } };
}

/** แปลง unknown → Response; ใช้ใน catch block ของทุก route handler */
export function jsonErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(errorBody(error.code, error.message), { status: error.status });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const detail = first ? `${first.path.join(".")}: ${first.message}` : undefined;
    return NextResponse.json(
      errorBody("VALIDATION_ERROR", detail ? `ข้อมูลไม่ถูกต้อง (${detail})` : THAI_MESSAGE_BY_CODE.VALIDATION_ERROR),
      { status: 400 }
    );
  }
  console.error("[api] unhandled error:", error);
  return NextResponse.json(errorBody("INTERNAL_ERROR", THAI_MESSAGE_BY_CODE.INTERNAL_ERROR), { status: 500 });
}

/** throw UNAUTHORIZED ถ้ายังไม่ login; คืน userId */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("UNAUTHORIZED");
  return user.id;
}

export async function requireUser(): Promise<{ id: string; email?: string }> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("UNAUTHORIZED");
  return user;
}
