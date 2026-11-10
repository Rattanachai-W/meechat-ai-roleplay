"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Check, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function NavDailyClaim() {
  const router = useRouter();
  const t = useTranslations("Wallet");
  const [state, setState] = useState<"loading" | "hidden" | "claimable" | "claimed">("loading");
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/energy/daily-claim")
      .then(async (res) => {
        if (res.status === 401) {
          setState("hidden");
          return null;
        }
        if (!res.ok) throw new Error("load failed");
        return (await res.json()) as { claimedToday: boolean; amount: number };
      })
      .then((d) => {
        if (!d) return;
        setAmount(d.amount);
        setState(d.claimedToday ? "claimed" : "claimable");
      })
      .catch(() => setState("hidden"));
  }, []);

  async function claim() {
    setState((s) => (s === "claimable" ? "loading" : s));
    try {
      const res = await fetch("/api/energy/daily-claim", { method: "POST" });
      const data = (await res.json()) as
        | { claimed: boolean; amount: number }
        | { error: { message: string } };
      if ("error" in data) throw new Error(data.error.message);
      setState("claimed");
      if (data.claimed) {
        toast.success(t("dailyClaimSuccess", { amount: data.amount }));
        router.refresh();
      } else {
        toast.info(t("dailyClaimed"));
      }
    } catch (error) {
      setState("claimable");
      toast.error(error instanceof Error ? error.message : t("dailyClaimFailed"));
    }
  }

  if (state === "hidden") return null;

  const unclaimed = state === "claimable";

  return (
    <Button
      onClick={claim}
      disabled={state === "loading" || state === "claimed"}
      aria-label={
        state === "claimed"
          ? t("navClaimed")
          : amount !== null
            ? `${t("navClaim")} +${amount}`
            : t("navClaim")
      }
      title={state === "claimed" ? t("navClaimed") : t("navClaim")}
      className={`relative rounded-full border transition-colors ${
        unclaimed
          ? "border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20"
          : "border-border bg-muted/40 text-muted-foreground opacity-70"
      }`}
    >
      {state === "loading" ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : state === "claimed" ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Gift className="size-4 fill-red-500/30" aria-hidden />
      )}
      {unclaimed && amount !== null && (
        <span className="text-xs font-semibold tabular-nums">+{amount}</span>
      )}
      {unclaimed && (
        <span
          className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-red-500"
          aria-hidden
        />
      )}
    </Button>
  );
}
