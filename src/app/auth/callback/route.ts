import { NextResponse, type NextRequest } from "next/server";
import { isAppLocale, locales, routing, type AppLocale } from "@/i18n/routing";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth / email confirmation callback — แลก exchange code เป็น session
 *
 * origin ต้องอ่านจาก x-forwarded-* ก่อนเสมอ — เวลา deploy หลัง reverse proxy
 * (nginx/ทำโดเมนเอง) request.url จะเป็น internal address เช่น http://localhost:3000
 * ทำให้หลังล็อกอิน Google สำเร็จ ผู้ใช้โดนพากลับมาที่ localhost
 */
function localeFromRequest(request: NextRequest): AppLocale {
  const value = request.cookies.get(LOCALE_COOKIE)?.value;
  if (value && isAppLocale(value)) return value;
  return routing.defaultLocale;
}

/** Prefix an in-app path with the locale. Paths that already include /th or /en stay as-is. */
function withLocale(path: string, locale: AppLocale): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;

  const normalized = path.startsWith("/") ? path : `/${path}`;
  const cut = ["?", "#"]
    .map((mark) => normalized.indexOf(mark))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const pathname = cut === undefined ? normalized : normalized.slice(0, cut);
  const suffix = cut === undefined ? "" : normalized.slice(cut);

  if (pathname.startsWith("//")) return path;

  const hasLocale = locales.some(
    (code) => pathname === `/${code}` || pathname.startsWith(`/${code}/`),
  );
  if (hasLocale) return `${pathname}${suffix}`;

  const localized = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  return `${localized}${suffix}`;
}

function resolveOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request);
  const code = searchParams.get("code");
  const locale = localeFromRequest(request);
  const next = withLocale(searchParams.get("next") ?? "/discover", locale);

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}${withLocale("/login?error=not_configured", locale)}`);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${withLocale("/login?error=auth_callback_failed", locale)}`);
}
