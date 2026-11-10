"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";

const LOCAL_KEY = "meechat_mature_confirmed";

export function AgeGate({
  required,
  alreadyConfirmed,
  children,
}: {
  required: boolean;
  alreadyConfirmed: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("AgeGate");
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(alreadyConfirmed);
  const [ready, setReady] = useState(alreadyConfirmed);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (alreadyConfirmed) {
      setConfirmed(true);
      setReady(true);
      return;
    }
    try {
      if (localStorage.getItem(LOCAL_KEY) === "1") {
        setConfirmed(true);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [alreadyConfirmed]);

  if (!required) return <>{children}</>;
  if (!ready) return null;
  if (confirmed) return <>{children}</>;

  async function confirm() {
    setBusy(true);
    try {
      try {
        localStorage.setItem(LOCAL_KEY, "1");
      } catch {
        /* ignore */
      }
      const res = await fetch("/api/me/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matureConfirmed: true }),
      });
      // Guests get 401 — localStorage still counts as confirmed for this browser
      if (res.ok) {
        router.refresh();
      }
      setConfirmed(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border p-6 text-center">
      <h1 className="text-xl font-bold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={confirm} disabled={busy} className="rounded-full">
          {t("confirm")}
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/discover">{t("cancel")}</Link>
        </Button>
      </div>
    </div>
  );
}
