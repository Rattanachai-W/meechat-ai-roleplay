"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const COOKIE_KEY = "meechat_cookie_consent";

export function CookieConsentBanner() {
  const t = useTranslations("Legal");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function accept(mode: "necessary" | "all") {
    try {
      localStorage.setItem(COOKIE_KEY, mode);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 mx-auto w-[min(100%-1.5rem,40rem)] rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur md:bottom-6">
      <p className="text-sm text-muted-foreground">
        {t("cookieBanner")}{" "}
        <Link href="/cookies" className="text-primary underline">
          {t("cookiesTitle")}
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => accept("necessary")}>
          {t("acceptNecessary")}
        </Button>
        <Button size="sm" onClick={() => accept("all")}>
          {t("acceptAll")}
        </Button>
      </div>
    </div>
  );
}
