import { defineRouting } from "next-intl/routing";

export const locales = ["th", "en"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "th",
  localePrefix: "always",
});

export function isAppLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

/** BCP 47 tag for Intl formatting */
export function toBcp47(locale: AppLocale): string {
  return locale === "th" ? "th-TH" : "en-US";
}
