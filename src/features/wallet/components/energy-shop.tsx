"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Coins, Loader2, FlaskConical, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toBcp47, type AppLocale } from "@/i18n/routing";

interface Pkg {
  id: string;
  coins: number;
  priceThb: number;
  priceUsd?: number;
  label: string;
  labelEn?: string;
}

type ShopMode = "off" | "mock" | "stripe";

export function EnergyShop() {
  const router = useRouter();
  const t = useTranslations("Wallet");
  const tCommon = useTranslations("Common");
  const locale = useLocale() as AppLocale;
  const bcp47 = toBcp47(locale);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [mode, setMode] = useState<ShopMode>("off");
  const [currency, setCurrency] = useState<"THB" | "USD">("THB");
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const confirmedReturn = useRef(false);

  useEffect(() => {
    fetch("/api/energy/purchase")
      .then((r) => r.json())
      .then((d: { packages?: Pkg[]; paymentsEnabled?: boolean; mode?: string | null }) => {
        setPackages(d.packages ?? []);
        const m = !d.paymentsEnabled ? "off" : d.mode === "mock" ? "mock" : "stripe";
        setMode(m);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (confirmedReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get("purchase");
    if (!purchase) return;
    confirmedReturn.current = true;

    const sessionId = params.get("session_id");
    router.replace("/wallet", { scroll: false });

    if (purchase === "cancelled" || !sessionId) {
      toast.info(t("shopCancelled"));
      return;
    }

    fetch("/api/energy/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as
          | { credited?: boolean; coins?: number; error?: { message?: string } }
          | null;
        if (!res.ok || !data) throw new Error(data?.error?.message ?? t("shopFailed"));
        if (data.credited) toast.success(t("shopSuccess"));
        else toast.success(t("shopSuccess"));
      })
      .then(() => router.refresh())
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("shopFailed")));
  }, [router, t]);

  async function buy(pkg: Pkg) {
    setBuying(pkg.id);
    try {
      const res = await fetch("/api/energy/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id, currency }),
      });
      const data = (await res.json()) as
        | { purchased?: boolean; coins?: number; checkoutUrl?: string }
        | { error: { message: string } };
      if ("error" in data) throw new Error(data.error.message);

      if ("checkoutUrl" in data && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      toast.success(t("shopSuccess"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("shopFailed"));
    } finally {
      setBuying(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="size-4 text-amber-500" aria-hidden /> {t("buy")}
          {mode === "mock" && (
            <span className="ml-auto flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-500">
              <FlaskConical className="size-3" aria-hidden /> {t("shopMockBadge")}
            </span>
          )}
          {mode === "stripe" && (
            <span className="ml-auto flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3" aria-hidden /> {t("shopStripeBadge")}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">{tCommon("loading")}</p>
        ) : mode === "off" ? (
          <p className="py-2 text-sm text-muted-foreground">{t("shopDisabled")}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Currency">
              {(["THB", "USD"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={currency === code}
                  onClick={() => setCurrency(code)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    currency === code
                      ? "border-amber-500 bg-amber-500/10 text-amber-500"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => buy(pkg)}
                  disabled={buying !== null}
                  className="rounded-xl border border-border p-4 text-left transition-colors hover:border-amber-500/50 hover:bg-amber-500/5 disabled:opacity-50"
                >
                  <p className="font-semibold">{locale === "en" && pkg.labelEn ? pkg.labelEn : pkg.label}</p>
                  <p className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                    {currency === "USD"
                      ? t("priceUsd", {
                          price: (pkg.priceUsd ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 }),
                        })
                      : t("priceThb", { price: pkg.priceThb.toLocaleString(bcp47) })}
                    {buying === pkg.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <span className="font-medium text-amber-500">{t("shopBuy")}</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
