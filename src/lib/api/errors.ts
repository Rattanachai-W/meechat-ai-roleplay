import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { apiErrorMessage, validationDetailMessage } from "@/lib/i18n/error-messages";
import { resolveRequestLocale } from "@/lib/i18n/locale";
import type { AppLocale } from "@/i18n/routing";

/**
 * Error taxonomy กลางของทุก API — code เดียวกับ docs/api-routes.md
 * message เป็นภาษาตาม locale ของ request (cookie / Accept-Language)
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

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? apiErrorMessage(code, "th"));
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
export function jsonErrorResponse(error: unknown, locale: AppLocale = "th"): NextResponse {
  if (error instanceof ApiError) {
    const message =
      error.message === apiErrorMessage(error.code, "th") ||
      error.message === apiErrorMessage(error.code, "en")
        ? apiErrorMessage(error.code, locale)
        : error.message;
    return NextResponse.json(errorBody(error.code, message), { status: error.status });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const detail = first ? `${first.path.join(".")}: ${first.message}` : undefined;
    return NextResponse.json(
      errorBody(
        "VALIDATION_ERROR",
        detail
          ? validationDetailMessage(detail, locale)
          : apiErrorMessage("VALIDATION_ERROR", locale)
      ),
      { status: 400 }
    );
  }
  console.error("[api] unhandled error:", error);
  return NextResponse.json(
    errorBody("INTERNAL_ERROR", apiErrorMessage("INTERNAL_ERROR", locale)),
    { status: 500 }
  );
}

/** Async helper: resolve locale then map error */
export async function jsonErrorResponseLocalized(error: unknown): Promise<NextResponse> {
  const locale = await resolveRequestLocale();
  return jsonErrorResponse(error, locale);
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
