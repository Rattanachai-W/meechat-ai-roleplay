"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter, usePathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

const TIMEZONES = [
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Asia/Singapore",
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
];

export function LocalePrefsForm({
  initialLocale,
  initialTimezone,
  initialCurrency,
}: {
  initialLocale: AppLocale;
  initialTimezone: string;
  initialCurrency: "THB" | "USD";
}) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [preferredLocale, setPreferredLocale] = useState<AppLocale>(initialLocale);
  const [timezone, setTimezone] = useState(initialTimezone || "Asia/Bangkok");
  const [preferredCurrency, setPreferredCurrency] = useState<"THB" | "USD">(initialCurrency);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/me/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLocale, timezone, preferredCurrency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? tCommon("saveFailed"));
      toast.success(t("prefsSaved"));
      if (preferredLocale !== locale) {
        router.replace(pathname, { locale: preferredLocale });
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="font-medium">{t("locale")}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("locale")}>
          {(["th", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={preferredLocale === code}
              onClick={() => setPreferredLocale(code)}
              className={`rounded-full border px-3 py-1.5 ${
                preferredLocale === code
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {code === "th" ? t("localeTh") : t("localeEn")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium">{t("timezone")}</p>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label={t("timezone")}>
          {TIMEZONES.map((tz) => (
            <button
              key={tz}
              type="button"
              role="option"
              aria-selected={timezone === tz}
              onClick={() => setTimezone(tz)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                timezone === tz
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {tz}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium">{t("currency")}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("currency")}>
          {(["THB", "USD"] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={preferredCurrency === code}
              onClick={() => setPreferredCurrency(code)}
              className={`rounded-full border px-3 py-1.5 ${
                preferredCurrency === code
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="rounded-full">
        {t("savePrefs")}
      </Button>
    </div>
  );
}
