import { cookies, headers } from "next/headers";
import { isAppLocale, type AppLocale, routing } from "@/i18n/routing";

const COOKIE_NAME = "NEXT_LOCALE";

/** Resolve reply/UI locale for API routes (no [locale] segment). */
export async function resolveRequestLocale(): Promise<AppLocale> {
  const jar = await cookies();
  const fromCookie = jar.get(COOKIE_NAME)?.value;
  if (fromCookie && isAppLocale(fromCookie)) return fromCookie;

  const h = await headers();
  const accept = h.get("accept-language") ?? "";
  if (accept.toLowerCase().startsWith("en")) return "en";
  return routing.defaultLocale;
}

export { COOKIE_NAME as LOCALE_COOKIE };
